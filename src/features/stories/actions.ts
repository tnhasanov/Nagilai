'use server';

import { revalidatePath } from 'next/cache';
import { errors } from '@/lib/errors';
import { attempt, type ActionResult } from '@/lib/result';
import { getCurrentUser, supabaseServer } from '@/services/supabase/server';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getSetting } from '@/services/config/settings';
import { enforce } from '@/services/ratelimit';
import * as credits from '@/services/credits';
import * as storage from '@/services/storage';
import { enqueue, requeue } from '@/services/jobs/queue';
import { kickWorker } from '@/services/jobs/worker';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS, STORAGE_BUCKETS } from '@/config/constants';
import { createStory } from './create';
import {
  createStoryInputSchema,
  narrationRequestSchema,
  pdfRequestSchema,
  remixInputSchema,
  type CreateStoryInput,
  type RemixInput,
} from './schemas';

/**
 * Story mutations.
 *
 * Every action re-establishes the caller from the session and never trusts
 * an owner id from the client. Long-running work is enqueued, never
 * awaited (§27).
 */

export async function createStoryAction(
  input: CreateStoryInput,
): Promise<ActionResult<{ storyId: string }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const parsed = createStoryInputSchema.parse(input);

    return createStory({
      ownerId: user.id,
      childId: parsed.childId,
      languageCode: parsed.languageCode,
      themeSlug: parsed.themeSlug,
      objectiveSlug: parsed.objectiveSlug || null,
      illustrationStyleSlug: parsed.illustrationStyleSlug || null,
      length: parsed.length,
      customInstructions: parsed.customInstructions || null,
      dedication: parsed.dedication || null,
    });
  });
}

/**
 * Remix (§12).
 *
 * Always creates a *new* story pointing back at the original, so the
 * original is preserved exactly as the specification requires.
 */
export async function remixStoryAction(input: RemixInput): Promise<ActionResult<{ storyId: string }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const features = await getSetting('features');
    if (!features.remix_enabled) throw errors.notConfigured('Remix');

    const parsed = remixInputSchema.parse(input);
    const supabase = await supabaseServer();

    const { data: original } = await supabase
      .from('stories')
      .select(
        'id, child_id, language_code, theme_slug, objective_slug, illustration_style_slug, length, custom_instructions, dedication',
      )
      .eq('id', parsed.storyId)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!original) throw errors.notFound('Story');
    if (!original.child_id) {
      throw errors.validation('This story’s child profile has been removed, so it cannot be remixed.');
    }

    const length =
      parsed.kind === 'shorter'
        ? shorten(original.length)
        : parsed.kind === 'longer'
          ? lengthen(original.length)
          : original.length;

    return createStory({
      ownerId: user.id,
      childId: original.child_id,
      languageCode:
        parsed.kind === 'different_language' && parsed.languageCode
          ? parsed.languageCode
          : original.language_code,
      themeSlug: original.theme_slug,
      objectiveSlug:
        parsed.kind === 'different_lesson' ? (parsed.objectiveSlug ?? null) : original.objective_slug,
      illustrationStyleSlug:
        parsed.kind === 'different_style'
          ? (parsed.illustrationStyleSlug ?? original.illustration_style_slug)
          : original.illustration_style_slug,
      length,
      customInstructions: original.custom_instructions,
      dedication: original.dedication,
      remix: { fromStoryId: original.id, kind: parsed.kind },
    });
  });
}

/** Enqueues narration for a story (§10). The story owns its language. */
export async function requestNarrationAction(
  input: unknown,
): Promise<ActionResult<{ queued: boolean }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const features = await getSetting('features');
    if (!features.narration_enabled) throw errors.notConfigured('Narration');

    const parsed = narrationRequestSchema.parse(input);
    await enforce('narration', user.id);

    const story = await ownedStory(user.id, parsed.storyId);
    if (!story.current_version_id) throw errors.validation('This story is not ready yet.');

    if (!(await credits.canAfford(user.id, 'story_narration'))) {
      throw errors.insufficientCredits(await credits.costOf('story_narration'), await credits.getBalance(user.id));
    }

    await enqueue({
      type: 'story_narration',
      ownerId: user.id,
      storyId: story.id,
      versionId: story.current_version_id,
      priority: 20,
      payload: { voiceSlug: parsed.voiceSlug ?? null, speed: parsed.speed },
      // Same story, voice and speed => the same job, so a double click
      // does not queue two syntheses.
      idempotencyKey: `narration:${story.current_version_id}:${parsed.voiceSlug ?? 'default'}:${parsed.speed}`,
    });

    kickWorker();

    await capture({
      name: ANALYTICS_EVENTS.narrationStarted,
      ownerId: user.id,
      properties: { language: story.language_code, voice: parsed.voiceSlug ?? 'default' },
    });

    revalidatePath(`/library/${story.id}`);
    return { queued: true };
  });
}

/**
 * Produces (or reuses) a PDF and returns a signed download URL (§14).
 *
 * Renders inline rather than through the queue: a book is a few hundred
 * milliseconds of pdf-lib work, and making the parent wait for a worker
 * tick to download something they can already read would be worse.
 */
export async function requestPdfAction(
  input: unknown,
): Promise<ActionResult<{ url: string; pageCount: number | null }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const features = await getSetting('features');
    if (!features.pdf_enabled) throw errors.notConfigured('PDF download');

    const parsed = pdfRequestSchema.parse(input);
    await enforce('pdf', user.id);

    const story = await ownedStory(user.id, parsed.storyId);
    if (!story.current_version_id || story.status !== 'ready') {
      throw errors.validation('This story is still being created.');
    }

    const { handlePdf } = await import('@/services/jobs/handlers/pdf');

    const result = await handlePdf({
      id: crypto.randomUUID(),
      type: 'story_pdf',
      status: 'running',
      owner_id: user.id,
      story_id: story.id,
      version_id: story.current_version_id,
      page_id: null,
      payload: { variant: parsed.variant, pageSize: parsed.pageSize },
      result: null,
      priority: 100,
      attempts: 1,
      max_attempts: 1,
      run_after: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      started_at: null,
      finished_at: null,
      error_message: null,
      error_detail: null,
      idempotency_key: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const storagePath = typeof result['storagePath'] === 'string' ? result['storagePath'] : null;
    if (!storagePath) throw errors.validation('We could not prepare the PDF. Please try again.');

    const fileName = `${slugify(story.title ?? 'nagilai-story')}.pdf`;
    const url = await storage.signedUrl(STORAGE_BUCKETS.storyPdfs, storagePath, { download: fileName });
    if (!url) throw errors.validation('We could not prepare the download link.');

    await capture({
      name: ANALYTICS_EVENTS.pdfDownloaded,
      ownerId: user.id,
      properties: { variant: parsed.variant, size: parsed.pageSize, language: story.language_code },
    });

    return { url, pageCount: typeof result['pageCount'] === 'number' ? result['pageCount'] : null };
  });
}

/** Retries one failed illustration without regenerating the book (§27). */
export async function retryIllustrationAction(
  storyId: string,
  illustrationId: string,
): Promise<ActionResult<{ queued: boolean }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    await enforce('illustration', user.id);
    const story = await ownedStory(user.id, storyId);

    const { data: illustration } = await supabaseAdmin()
      .from('story_illustrations')
      .select('id, page_id, is_cover, version_id')
      .eq('id', illustrationId)
      .eq('story_id', story.id)
      .maybeSingle();

    if (!illustration) throw errors.notFound('Illustration');

    await supabaseAdmin()
      .from('story_illustrations')
      .update({ status: 'pending', error_message: null, prompt_fingerprint: null })
      .eq('id', illustration.id);

    await enqueue({
      type: illustration.is_cover ? 'story_cover' : 'story_illustration',
      ownerId: user.id,
      storyId: story.id,
      versionId: illustration.version_id,
      pageId: illustration.page_id,
      priority: 15,
      idempotencyKey: `illustration-retry:${illustration.id}:${Date.now()}`,
    });

    kickWorker();
    revalidatePath(`/library/${story.id}`);
    return { queued: true };
  });
}

/** Retries a failed story from the beginning, reusing the same row. */
export async function retryStoryAction(storyId: string): Promise<ActionResult<{ queued: boolean }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    await enforce('story_create', user.id);
    const story = await ownedStory(user.id, storyId);
    if (story.status !== 'failed') throw errors.validation('This story does not need retrying.');
    if (!story.current_version_id) throw errors.validation('This story cannot be retried.');

    const { data: job } = await supabaseAdmin()
      .from('generation_jobs')
      .select('id')
      .eq('story_id', story.id)
      .eq('type', 'story_text')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (job) {
      await requeue(job.id);
    } else {
      await enqueue({
        type: 'story_text',
        ownerId: user.id,
        storyId: story.id,
        versionId: story.current_version_id,
        priority: 10,
        idempotencyKey: `story_text:${story.current_version_id}:retry:${Date.now()}`,
      });
    }

    await supabaseAdmin()
      .from('stories')
      .update({ status: 'queued', failure_reason: null, status_message: 'Trying again' })
      .eq('id', story.id);

    kickWorker();
    revalidatePath(`/library/${story.id}`);
    return { queued: true };
  });
}

export async function toggleFavouriteAction(storyId: string): Promise<ActionResult<{ isFavourite: boolean }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const supabase = await supabaseServer();
    const { data: current } = await supabase
      .from('stories')
      .select('is_favourite')
      .eq('id', storyId)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!current) throw errors.notFound('Story');

    const next = !current.is_favourite;
    await supabase.from('stories').update({ is_favourite: next }).eq('id', storyId).eq('owner_id', user.id);

    revalidatePath('/library');
    return { isFavourite: next };
  });
}

export async function renameStoryAction(storyId: string, title: string): Promise<ActionResult<{ title: string }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const trimmed = title.trim().slice(0, 120);
    if (trimmed.length === 0) throw errors.validation('Please enter a title.');

    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from('stories')
      .update({ title: trimmed })
      .eq('id', storyId)
      .eq('owner_id', user.id)
      .select('title')
      .maybeSingle();

    if (error || !data) throw errors.notFound('Story');

    revalidatePath('/library');
    revalidatePath(`/library/${storyId}`);
    return { title: trimmed };
  });
}

/**
 * Deletes a story and the assets it owns.
 *
 * A soft delete would leave paid-for images and audio sitting in storage
 * indefinitely, so this removes the files too. Share links are revoked
 * first, so a link that is already circulating stops working immediately.
 */
export async function deleteStoryAction(storyId: string): Promise<ActionResult<{ deleted: boolean }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const story = await ownedStory(user.id, storyId);
    const admin = supabaseAdmin();

    await admin.from('share_links').update({ is_enabled: false, revoked_at: new Date().toISOString() }).eq('story_id', story.id);

    const [{ data: images }, { data: audio }, { data: pdfs }] = await Promise.all([
      admin.from('story_illustrations').select('storage_path').eq('story_id', story.id),
      admin.from('narrations').select('storage_path').eq('story_id', story.id),
      admin.from('story_pdfs').select('storage_path').eq('story_id', story.id),
    ]);

    await Promise.all([
      storage.remove(
        STORAGE_BUCKETS.illustrations,
        (images ?? []).map((row) => row.storage_path).filter((p): p is string => Boolean(p)),
      ),
      storage.remove(
        STORAGE_BUCKETS.narrations,
        (audio ?? []).map((row) => row.storage_path).filter((p): p is string => Boolean(p)),
      ),
      storage.remove(
        STORAGE_BUCKETS.storyPdfs,
        (pdfs ?? []).map((row) => row.storage_path).filter((p): p is string => Boolean(p)),
      ),
    ]);

    const supabase = await supabaseServer();
    const { error } = await supabase.from('stories').delete().eq('id', story.id).eq('owner_id', user.id);
    if (error) throw errors.validation('We could not delete this story.');

    revalidatePath('/library');
    return { deleted: true };
  });
}

/* ------------------------------------------------------------------ */

async function ownedStory(ownerId: string, storyId: string) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('stories')
    .select('id, title, status, language_code, current_version_id')
    .eq('id', storyId)
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) throw errors.notFound('Story');
  return data;
}

function shorten(length: 'short' | 'medium' | 'long'): 'short' | 'medium' | 'long' {
  return length === 'long' ? 'medium' : 'short';
}

function lengthen(length: 'short' | 'medium' | 'long'): 'short' | 'medium' | 'long' {
  return length === 'short' ? 'medium' : 'long';
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'nagilai-story'
  );
}
