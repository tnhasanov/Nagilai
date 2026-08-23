import 'server-only';

import { AppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { stableHash } from '@/lib/crypto';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getSetting } from '@/services/config/settings';
import { illustrationProvider } from '@/services/providers';
import { buildIllustrationPrompt, characterSheetLine } from '@/services/ai/prompts';
import { checkText } from '@/services/safety';
import * as credits from '@/services/credits';
import * as storage from '@/services/storage';
import { recordUsage } from '@/services/usage/tracker';
import { recomputeStatus } from '@/services/stories/status';
import { STORAGE_BUCKETS } from '@/config/constants';
import type { CharacterBible, GenerationJob } from '@/types/domain';
import type { Json } from '@/types/database';

/**
 * Generates one illustration -- a page or the cover (§8).
 *
 * Visual consistency comes from pasting the version's character sheet into
 * every prompt, so page nine draws the same child as page one.
 *
 * The fingerprint is the cost control (§17): it hashes everything that
 * determines the image, and a matching ready row short-circuits the
 * provider call. Regenerating on purpose supersedes the old row instead of
 * overwriting it, so the parent can always fall back.
 */
const log = createLogger('jobs:illustration');

export async function handleIllustration(job: GenerationJob): Promise<Record<string, unknown>> {
  const admin = supabaseAdmin();
  const isCover = job.type === 'story_cover';

  if (!job.story_id || !job.version_id || !job.owner_id) {
    throw new AppError('validation_failed', 'illustration job is missing story, version or owner', {
      retryable: false,
    });
  }

  const [{ data: story }, { data: version }] = await Promise.all([
    admin
      .from('stories')
      .select('id, illustration_style_slug, cover_illustration_id')
      .eq('id', job.story_id)
      .single(),
    admin
      .from('story_versions')
      .select('id, character_bible, cover_concept')
      .eq('id', job.version_id)
      .single(),
  ]);

  if (!story || !version) {
    throw new AppError('not_found', 'Story or version missing for illustration job', { retryable: false });
  }

  const styleSlug = story.illustration_style_slug ?? 'storybook';
  const { data: style } = await admin
    .from('illustration_styles')
    .select('prompt_prefix, negative_prompt')
    .eq('slug', styleSlug)
    .maybeSingle();

  if (!style) {
    throw new AppError('not_found', `Illustration style ${styleSlug} is not configured`, { retryable: false });
  }

  let page: { id: string; page_number: number; illustration_prompt: string | null } | null = null;
  if (!isCover) {
    if (!job.page_id) {
      throw new AppError('validation_failed', 'page illustration job has no page', { retryable: false });
    }
    const { data } = await admin
      .from('story_pages')
      .select('id, page_number, illustration_prompt')
      .eq('id', job.page_id)
      .single();
    page = data;
    if (!page) throw new AppError('not_found', 'Story page missing', { retryable: false });
  }

  const bible = version.character_bible as unknown as CharacterBible;
  const scenePrompt = isCover
    ? version.cover_concept || 'The protagonist in the most memorable moment of the story.'
    : page?.illustration_prompt || 'The protagonist in this scene.';

  const prompt = buildIllustrationPrompt({
    stylePrefix: style.prompt_prefix,
    scenePrompt,
    characterSheet: characterSheetLine(bible),
    worldPalette: bible?.worldPalette ?? '',
    artDirection: bible?.artDirection ?? '',
    isCover,
  });

  const models = await getSetting('ai_models');
  const fingerprint = stableHash({
    prompt,
    model: models.image,
    size: models.image_size,
    quality: models.image_quality,
    style: styleSlug,
  });

  const existing = await findReusable({
    versionId: version.id,
    pageId: page?.id ?? null,
    isCover,
    fingerprint,
  });

  if (existing) {
    log.info('reusing existing illustration', { illustrationId: existing.id, fingerprint });
    await afterIllustration({ storyId: story.id, isCover, illustrationId: existing.id, coverAlready: story.cover_illustration_id });
    return { reused: true, illustrationId: existing.id };
  }

  // §7: the prompt is checked before it reaches the image model, so a
  // poisoned scene description cannot smuggle content past us.
  const verdict = await checkText(scenePrompt, {
    ownerId: job.owner_id,
    storyId: story.id,
    jobId: job.id,
    stage: 'illustration_prompt',
  });

  if (!verdict.allowed) {
    await upsertRow({
      job,
      storyId: story.id,
      versionId: version.id,
      pageId: page?.id ?? null,
      isCover,
      styleSlug,
      prompt,
      fingerprint,
      status: 'skipped',
      errorMessage: 'Illustration prompt was blocked by moderation',
    });
    await recomputeStatus(story.id);
    return { skipped: true, reason: 'moderation' };
  }

  const rowId = await upsertRow({
    job,
    storyId: story.id,
    versionId: version.id,
    pageId: page?.id ?? null,
    isCover,
    styleSlug,
    prompt,
    fingerprint,
    status: 'generating',
  });

  await credits.spend({
    ownerId: job.owner_id,
    kind: 'story_illustration',
    idempotencyKey: `illustration:${rowId}`,
    storyId: story.id,
    jobId: job.id,
    note: isCover ? 'Cover illustration' : `Page ${page?.page_number} illustration`,
  });

  try {
    const result = await illustrationProvider().generate(
      {
        prompt,
        negativePrompt: style.negative_prompt,
        size: models.image_size,
        quality: models.image_quality,
        endUserId: job.owner_id,
      },
      models.image,
    );

    const path = storage.illustrationPath({
      ownerId: job.owner_id,
      storyId: story.id,
      versionId: version.id,
      pageNumber: page?.page_number ?? null,
      fingerprint,
    });

    await storage.upload({
      bucket: STORAGE_BUCKETS.illustrations,
      path,
      bytes: result.value.bytes,
      contentType: result.value.mimeType,
    });

    await admin
      .from('story_illustrations')
      .update({
        storage_path: path,
        width: result.value.width,
        height: result.value.height,
        mime_type: result.value.mimeType,
        bytes: result.value.bytes.byteLength,
        revised_prompt: result.value.revisedPrompt,
        model: models.image,
        status: 'ready',
        error_message: null,
      })
      .eq('id', rowId);

    await recordUsage({
      ownerId: job.owner_id,
      storyId: story.id,
      versionId: version.id,
      jobId: job.id,
      operation: 'image_generation',
      usage: result.usage,
    });

    await afterIllustration({
      storyId: story.id,
      isCover,
      illustrationId: rowId,
      coverAlready: story.cover_illustration_id,
    });

    return { illustrationId: rowId, bytes: result.value.bytes.byteLength };
  } catch (error) {
    const permanent = job.attempts >= job.max_attempts;

    await admin
      .from('story_illustrations')
      .update({
        status: permanent ? 'failed' : 'pending',
        error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      })
      .eq('id', rowId);

    if (permanent) {
      const amount = await credits.costOf('story_illustration');
      await credits.refund({
        ownerId: job.owner_id,
        amount,
        idempotencyKey: `refund:illustration:${rowId}`,
        storyId: story.id,
        note: 'Illustration generation failed',
      });
      // One failed picture must not hold the whole book hostage.
      await recomputeStatus(story.id);
    }

    throw error;
  }
}

async function findReusable(input: {
  versionId: string;
  pageId: string | null;
  isCover: boolean;
  fingerprint: string;
}) {
  const query = supabaseAdmin()
    .from('story_illustrations')
    .select('id, storage_path')
    .eq('version_id', input.versionId)
    .eq('prompt_fingerprint', input.fingerprint)
    .eq('status', 'ready')
    .is('superseded_by', null)
    .limit(1);

  const { data } = input.isCover
    ? await query.eq('is_cover', true)
    : await query.eq('page_id', input.pageId!);

  const row = data?.[0];
  return row?.storage_path ? row : null;
}

/**
 * Creates or revives the illustration row.
 *
 * The partial unique indexes in migration 0003 mean at most one active row
 * exists per (version, page, style), so a retry updates rather than piles
 * up duplicates.
 */
async function upsertRow(input: {
  job: GenerationJob;
  storyId: string;
  versionId: string;
  pageId: string | null;
  isCover: boolean;
  styleSlug: string;
  prompt: string;
  fingerprint: string;
  status: 'pending' | 'generating' | 'skipped';
  errorMessage?: string;
}): Promise<string> {
  const admin = supabaseAdmin();

  const existingQuery = admin
    .from('story_illustrations')
    .select('id')
    .eq('version_id', input.versionId)
    .eq('style_slug', input.styleSlug)
    .is('superseded_by', null)
    .limit(1);

  const { data: existing } = input.isCover
    ? await existingQuery.eq('is_cover', true)
    : await existingQuery.eq('page_id', input.pageId!);

  const patch = {
    prompt: input.prompt,
    prompt_fingerprint: input.fingerprint,
    status: input.status,
    error_message: input.errorMessage ?? null,
  };

  const existingId = existing?.[0]?.id;
  if (existingId) {
    const { error } = await admin.from('story_illustrations').update(patch).eq('id', existingId);
    if (error) throw new AppError('internal', `Could not update illustration row: ${error.message}`);
    return existingId;
  }

  const { data, error } = await admin
    .from('story_illustrations')
    .insert({
      story_id: input.storyId,
      version_id: input.versionId,
      page_id: input.pageId,
      is_cover: input.isCover,
      style_slug: input.styleSlug,
      provider: 'openai',
      ...patch,
    })
    .select('id')
    .single();

  if (error || !data) throw new AppError('internal', `Could not create illustration row: ${error?.message}`);
  return data.id;
}

async function afterIllustration(input: {
  storyId: string;
  isCover: boolean;
  illustrationId: string;
  coverAlready: string | null;
}): Promise<void> {
  if (input.isCover && input.coverAlready !== input.illustrationId) {
    await supabaseAdmin()
      .from('stories')
      .update({ cover_illustration_id: input.illustrationId })
      .eq('id', input.storyId);
  }
  await recomputeStatus(input.storyId);
}

/** Marks the current illustration superseded so a new one can be generated. */
export async function supersedeIllustration(illustrationId: string, replacementId: string | null): Promise<void> {
  await supabaseAdmin()
    .from('story_illustrations')
    .update({ superseded_by: replacementId } as { superseded_by: string | null } & Json)
    .eq('id', illustrationId);
}
