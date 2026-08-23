import 'server-only';

import { AppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { sha256Hex } from '@/lib/crypto';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getSetting } from '@/services/config/settings';
import { speechProvider } from '@/services/providers';
import { buildNarrationInstructions } from '@/services/ai/prompts';
import * as credits from '@/services/credits';
import * as storage from '@/services/storage';
import { recordUsage } from '@/services/usage/tracker';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS, STORAGE_BUCKETS } from '@/config/constants';
import type { GenerationJob, NarrationTiming } from '@/types/domain';
import type { Json } from '@/types/database';

/**
 * Narration (§10).
 *
 * The story's own `language_code` drives pronunciation. Nothing about the
 * language is passed in from the client -- the closing architectural note
 * of the specification rules out `?voice_language=ru-RU`-style plumbing,
 * and this is where that rule is honoured.
 *
 * Caching is the whole point of §37's "do not regenerate audio every time
 * Play is pressed": audio is keyed by (version, voice, speed, text hash),
 * so pressing Play a hundred times costs one synthesis.
 */
const log = createLogger('jobs:narration');

interface NarrationPayload {
  voiceSlug?: string;
  speed?: number;
}

export async function handleNarration(job: GenerationJob): Promise<Record<string, unknown>> {
  const admin = supabaseAdmin();

  if (!job.story_id || !job.version_id || !job.owner_id) {
    throw new AppError('validation_failed', 'narration job is missing story, version or owner', {
      retryable: false,
    });
  }

  const payload = (job.payload ?? {}) as NarrationPayload;

  const { data: story } = await admin
    .from('stories')
    .select('id, language_code, theme_slug')
    .eq('id', job.story_id)
    .single();

  if (!story) throw new AppError('not_found', 'Story missing for narration', { retryable: false });

  const { data: pages } = await admin
    .from('story_pages')
    .select('page_number, text')
    .eq('version_id', job.version_id)
    .order('page_number');

  if (!pages || pages.length === 0) {
    throw new AppError('not_found', 'No pages to narrate', { retryable: false });
  }

  const voice = await resolveVoice(payload.voiceSlug ?? null, story.language_code);
  const speed = clampSpeed(payload.speed ?? 1);

  // Two blank lines between pages give the speech model a natural pause
  // and make the per-page timing estimate more honest.
  const narrationText = pages.map((page) => page.text.trim()).join('\n\n');
  const textHash = sha256Hex(`${narrationText}::${voice.provider_voice_id}::${speed}`);

  const existing = await findReusable(job.version_id, voice.slug, speed, textHash);
  if (existing) {
    log.info('reusing cached narration', { narrationId: existing.id });
    return { reused: true, narrationId: existing.id };
  }

  const models = await getSetting('ai_models');
  const rowId = await upsertRow({
    storyId: story.id,
    versionId: job.version_id,
    voiceId: voice.id,
    voiceSlug: voice.slug,
    languageCode: story.language_code,
    speed,
    textHash,
    model: models.tts,
    status: 'generating',
  });

  await credits.spend({
    ownerId: job.owner_id,
    kind: 'story_narration',
    idempotencyKey: `narration:${rowId}`,
    storyId: story.id,
    jobId: job.id,
    note: `Narration (${voice.slug})`,
  });

  try {
    const result = await speechProvider().synthesise(
      {
        text: narrationText,
        voiceId: voice.provider_voice_id,
        languageCode: story.language_code,
        instructions: buildNarrationInstructions({
          languageCode: story.language_code,
          voiceGuidance: voice.delivery_guidance,
          themeSlug: story.theme_slug,
        }),
        speed,
        format: models.tts_format,
      },
      models.tts,
    );

    const path = storage.narrationPath({
      ownerId: job.owner_id,
      storyId: story.id,
      versionId: job.version_id,
      scope: 'full',
      hash: textHash,
      extension: models.tts_format,
    });

    await storage.upload({
      bucket: STORAGE_BUCKETS.narrations,
      path,
      bytes: result.value.bytes,
      contentType: result.value.mimeType,
    });

    const timings = estimatePageTimings(
      pages.map((page) => ({ pageNumber: page.page_number, text: page.text })),
      result.value.durationSeconds ?? 0,
    );

    await admin
      .from('narrations')
      .update({
        storage_path: path,
        mime_type: result.value.mimeType,
        bytes: result.value.bytes.byteLength,
        duration_seconds: result.value.durationSeconds,
        timings: timings as unknown as Json,
        status: 'ready',
        error_message: null,
      })
      .eq('id', rowId);

    await recordUsage({
      ownerId: job.owner_id,
      storyId: story.id,
      versionId: job.version_id,
      jobId: job.id,
      operation: 'speech_synthesis',
      usage: result.usage,
    });

    await capture({
      name: ANALYTICS_EVENTS.narrationCompleted,
      ownerId: job.owner_id,
      properties: { language: story.language_code, voice: voice.slug },
    });

    return { narrationId: rowId, seconds: result.value.durationSeconds };
  } catch (error) {
    const permanent = job.attempts >= job.max_attempts;

    await admin
      .from('narrations')
      .update({
        status: permanent ? 'failed' : 'pending',
        error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      })
      .eq('id', rowId);

    if (permanent) {
      const amount = await credits.costOf('story_narration');
      await credits.refund({
        ownerId: job.owner_id,
        amount,
        idempotencyKey: `refund:narration:${rowId}`,
        storyId: story.id,
        note: 'Narration failed',
      });
    }
    throw error;
  }
}

async function resolveVoice(requestedSlug: string | null, languageCode: string) {
  const admin = supabaseAdmin();

  if (requestedSlug) {
    const { data } = await admin
      .from('voices')
      .select('id, slug, provider_voice_id, delivery_guidance, supported_language_codes')
      .eq('slug', requestedSlug)
      .eq('is_active', true)
      .maybeSingle();

    // An empty support list means the voice works for every language.
    if (
      data &&
      (data.supported_language_codes.length === 0 || data.supported_language_codes.includes(languageCode))
    ) {
      return data;
    }
  }

  const { data: fallback } = await admin
    .from('voices')
    .select('id, slug, provider_voice_id, delivery_guidance, supported_language_codes')
    .eq('is_active', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle();

  if (!fallback) throw new AppError('not_configured', 'No narration voice is configured', { retryable: false });
  return fallback;
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(2, Math.max(0.5, Math.round(speed * 100) / 100));
}

async function findReusable(versionId: string, voiceSlug: string, speed: number, textHash: string) {
  const { data } = await supabaseAdmin()
    .from('narrations')
    .select('id, storage_path')
    .eq('version_id', versionId)
    .eq('scope', 'full_story')
    .eq('voice_slug', voiceSlug)
    .eq('speed', speed)
    .eq('text_hash', textHash)
    .eq('status', 'ready')
    .limit(1);

  const row = data?.[0];
  return row?.storage_path ? row : null;
}

async function upsertRow(input: {
  storyId: string;
  versionId: string;
  voiceId: string;
  voiceSlug: string;
  languageCode: string;
  speed: number;
  textHash: string;
  model: string;
  status: 'pending' | 'generating';
}): Promise<string> {
  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from('narrations')
    .select('id')
    .eq('version_id', input.versionId)
    .eq('scope', 'full_story')
    .eq('voice_slug', input.voiceSlug)
    .eq('speed', input.speed)
    .eq('text_hash', input.textHash)
    .limit(1);

  const existingId = existing?.[0]?.id;
  if (existingId) {
    await admin.from('narrations').update({ status: input.status }).eq('id', existingId);
    return existingId;
  }

  const { data, error } = await admin
    .from('narrations')
    .insert({
      story_id: input.storyId,
      version_id: input.versionId,
      scope: 'full_story',
      voice_id: input.voiceId,
      voice_slug: input.voiceSlug,
      language_code: input.languageCode,
      speed: input.speed,
      provider: 'openai',
      model: input.model,
      text_hash: input.textHash,
      status: input.status,
    })
    .select('id')
    .single();

  if (error || !data) throw new AppError('internal', `Could not create narration row: ${error?.message}`);
  return data.id;
}

/**
 * Page-level timings for follow-along highlighting (§10).
 *
 * The speech API returns no word timings, so this apportions the total
 * duration across pages by character count. It is an estimate, and the
 * reader treats it as one -- highlighting the current page rather than
 * individual words, which is the granularity that actually helps a child
 * follow along and is forgiving of a second's drift.
 */
export function estimatePageTimings(
  pages: readonly { pageNumber: number; text: string }[],
  totalSeconds: number,
): NarrationTiming[] {
  const lengths = pages.map((page) => Math.max(1, page.text.trim().length));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0 || totalSeconds <= 0) {
    return pages.map((page) => ({ pageNumber: page.pageNumber, startSeconds: 0, endSeconds: 0 }));
  }

  const timings: NarrationTiming[] = [];
  let cursor = 0;

  pages.forEach((page, index) => {
    const share = (lengths[index] ?? 1) / total;
    const duration = totalSeconds * share;
    const start = Math.round(cursor * 100) / 100;
    cursor += duration;
    timings.push({
      pageNumber: page.pageNumber,
      startSeconds: start,
      endSeconds: Math.round(Math.min(cursor, totalSeconds) * 100) / 100,
    });
  });

  return timings;
}
