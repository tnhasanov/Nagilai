import 'server-only';

import { AppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { stableHash } from '@/lib/crypto';
import { supabaseAdmin } from '@/services/supabase/admin';
import * as storage from '@/services/storage';
import * as credits from '@/services/credits';
import { renderBook, type BookPageInput } from '@/services/pdf/book-renderer';
import { bookStringsFor } from '@/services/pdf/book-strings';
import type { PageSizeName } from '@/services/pdf/layout';
import { STORAGE_BUCKETS } from '@/config/constants';
import type { GenerationJob } from '@/types/domain';
import { isPermanentFailure } from '@/services/jobs/queue';

/**
 * Renders a story into a downloadable or print-ready PDF (§14).
 *
 * Cached by a content hash over the version, its illustrations, the
 * variant and the page size, so pressing Download twice renders once.
 * A `print` variant is the paid, high-resolution artefact; `digital` is
 * free and is what the Download button produces.
 */
const log = createLogger('jobs:pdf');

interface PdfPayload {
  variant?: 'digital' | 'print';
  pageSize?: PageSizeName;
  includeBackCover?: boolean;
}

export async function handlePdf(job: GenerationJob): Promise<Record<string, unknown>> {
  const admin = supabaseAdmin();

  if (!job.story_id || !job.version_id || !job.owner_id) {
    throw new AppError('validation_failed', 'pdf job is missing story, version or owner', { retryable: false });
  }

  const payload = (job.payload ?? {}) as PdfPayload;
  const variant = payload.variant === 'print' ? 'print' : 'digital';
  const pageSize: PageSizeName = payload.pageSize ?? 'a5';
  const includeBackCover = payload.includeBackCover ?? true;

  const { data: story } = await admin
    .from('stories')
    .select('id, title, subtitle, summary, dedication, language_code, child_snapshot')
    .eq('id', job.story_id)
    .single();

  if (!story) throw new AppError('not_found', 'Story missing for PDF', { retryable: false });

  const { data: version } = await admin
    .from('story_versions')
    .select('id, title, subtitle, summary, educational_takeaway, discussion_questions')
    .eq('id', job.version_id)
    .single();

  if (!version) throw new AppError('not_found', 'Story version missing for PDF', { retryable: false });

  const { data: pages } = await admin
    .from('story_pages')
    .select('id, page_number, text')
    .eq('version_id', job.version_id)
    .order('page_number');

  if (!pages || pages.length === 0) {
    throw new AppError('not_found', 'Story has no pages to print', { retryable: false });
  }

  const { data: illustrations } = await admin
    .from('story_illustrations')
    .select('page_id, is_cover, storage_path, mime_type')
    .eq('version_id', job.version_id)
    .eq('status', 'ready')
    .is('superseded_by', null);

  const contentHash = stableHash({
    versionId: version.id,
    variant,
    pageSize,
    includeBackCover,
    pages: pages.map((page) => [page.page_number, page.text]),
    illustrations: (illustrations ?? []).map((row) => row.storage_path).sort(),
    dedication: story.dedication,
  });

  const existing = await findReusable(version.id, variant, pageSize, contentHash);
  if (existing) {
    log.info('reusing cached pdf', { pdfId: existing.id });
    return { reused: true, pdfId: existing.id, storagePath: existing.storage_path };
  }

  const rowId = await upsertRow({
    storyId: story.id,
    versionId: version.id,
    variant,
    pageSize,
    contentHash,
  });

  // The high-resolution print PDF is a paid artefact; the reading copy is
  // free. `story_pdf_hq` defaults to zero credits, so this is a no-op
  // until an owner prices it.
  if (variant === 'print') {
    await credits.spend({
      ownerId: job.owner_id,
      kind: 'story_pdf_hq',
      idempotencyKey: `pdf:${rowId}`,
      storyId: story.id,
      jobId: job.id,
      note: 'Print-ready PDF',
    });
  }

  try {
    const coverRow = (illustrations ?? []).find((row) => row.is_cover);
    const byPageId = new Map(
      (illustrations ?? []).filter((row) => row.page_id).map((row) => [row.page_id!, row]),
    );

    const [coverBytes, pageImages] = await Promise.all([
      coverRow?.storage_path ? fetchImage(coverRow.storage_path, coverRow.mime_type) : Promise.resolve(null),
      Promise.all(
        pages.map(async (page): Promise<BookPageInput> => {
          const row = byPageId.get(page.id);
          const image = row?.storage_path ? await fetchImage(row.storage_path, row.mime_type) : null;
          return { pageNumber: page.page_number, text: page.text, image };
        }),
      ),
    ]);

    const childName =
      typeof story.child_snapshot === 'object' &&
      story.child_snapshot !== null &&
      !Array.isArray(story.child_snapshot)
        ? ((story.child_snapshot as Record<string, unknown>)['display_name'] as string | undefined) ?? null
        : null;

    const rendered = await renderBook(
      {
        title: version.title ?? story.title ?? 'Nagilai',
        subtitle: version.subtitle ?? story.subtitle,
        summary: version.summary ?? story.summary,
        dedication: story.dedication,
        childDisplayName: childName,
        languageCode: story.language_code,
        educationalTakeaway: version.educational_takeaway,
        discussionQuestions: version.discussion_questions,
        cover: coverBytes,
        pages: pageImages,
        strings: bookStringsFor(story.language_code, childName),
      },
      { size: pageSize, variant, includeBackCover },
    );

    const path = storage.pdfPath({
      ownerId: job.owner_id,
      storyId: story.id,
      versionId: version.id,
      variant,
      hash: contentHash,
    });

    await storage.upload({
      bucket: STORAGE_BUCKETS.storyPdfs,
      path,
      bytes: rendered.bytes,
      contentType: 'application/pdf',
    });

    await admin
      .from('story_pdfs')
      .update({
        storage_path: path,
        bytes: rendered.bytes.byteLength,
        page_count: rendered.pageCount,
        status: 'ready',
        error_message: null,
      })
      .eq('id', rowId);

    return { pdfId: rowId, storagePath: path, pageCount: rendered.pageCount };
  } catch (error) {
    const permanent = isPermanentFailure(job, error);

    await admin
      .from('story_pdfs')
      .update({
        status: permanent ? 'failed' : 'pending',
        error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      })
      .eq('id', rowId);

    throw error;
  }
}

async function fetchImage(
  path: string,
  mimeType: string | null,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  try {
    const bytes = await storage.download(STORAGE_BUCKETS.illustrations, path);
    return { bytes, mimeType: mimeType ?? 'image/png' };
  } catch (error) {
    log.warn('could not read illustration for pdf', { path, error: String(error) });
    return null;
  }
}

async function findReusable(
  versionId: string,
  variant: string,
  pageSize: string,
  contentHash: string,
) {
  const { data } = await supabaseAdmin()
    .from('story_pdfs')
    .select('id, storage_path')
    .eq('version_id', versionId)
    .eq('variant', variant)
    .eq('page_size', pageSize)
    .eq('content_hash', contentHash)
    .eq('status', 'ready')
    .limit(1);

  const row = data?.[0];
  return row?.storage_path ? row : null;
}

async function upsertRow(input: {
  storyId: string;
  versionId: string;
  variant: string;
  pageSize: string;
  contentHash: string;
}): Promise<string> {
  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from('story_pdfs')
    .select('id')
    .eq('version_id', input.versionId)
    .eq('variant', input.variant)
    .eq('page_size', input.pageSize)
    .eq('content_hash', input.contentHash)
    .limit(1);

  const existingId = existing?.[0]?.id;
  if (existingId) {
    await admin.from('story_pdfs').update({ status: 'generating' }).eq('id', existingId);
    return existingId;
  }

  const { data, error } = await admin
    .from('story_pdfs')
    .insert({
      story_id: input.storyId,
      version_id: input.versionId,
      variant: input.variant,
      page_size: input.pageSize,
      content_hash: input.contentHash,
      status: 'generating',
    })
    .select('id')
    .single();

  if (error || !data) throw new AppError('internal', `Could not create pdf row: ${error?.message}`);
  return data.id;
}
