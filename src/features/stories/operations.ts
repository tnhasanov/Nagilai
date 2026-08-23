import 'server-only';

import { errors } from '@/lib/errors';
import { supabaseServer } from '@/services/supabase/server';
import { supabaseAdmin } from '@/services/supabase/admin';
import type { UserClient } from '@/services/supabase/user-client';
import { getSetting } from '@/services/config/settings';
import { enforce } from '@/services/ratelimit';
import * as credits from '@/services/credits';
import * as storage from '@/services/storage';
import { enqueue, requeue } from '@/services/jobs/queue';
import { kickWorker } from '@/services/jobs/worker';
import { generateShareToken } from '@/lib/crypto';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS, STORAGE_BUCKETS } from '@/config/constants';
import { siteUrl } from '@/config/env';
import { createStory } from './create';
import type { RemixKind, StoryLength } from '@/types/database';

/**
 * Story operations, independent of how the caller arrived.
 *
 * The web app reaches these through server actions and the mobile app
 * through `/api/v1`. Both hand in an owner id and a user-scoped Supabase
 * client, so the ownership check, the rate limit, the credit spend and
 * the analytics event happen once, in one place.
 *
 * The alternative -- letting the API re-implement what the actions do --
 * is how a mobile client ends up able to do something the web client
 * cannot, which in this product would be a privacy bug.
 */

async function client(db?: UserClient): Promise<UserClient> {
  return db ?? (await supabaseServer());
}

export interface OwnedStory {
  id: string;
  title: string | null;
  status: string;
  language_code: string;
  current_version_id: string | null;
}

/**
 * Loads a story the caller owns, or throws.
 *
 * Runs through the user-scoped client, so RLS is what actually enforces
 * this; the explicit `owner_id` filter is the second layer.
 */
export async function ownedStory(
  ownerId: string,
  storyId: string,
  db?: UserClient,
): Promise<OwnedStory> {
  const supabase = await client(db);
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

/* ------------------------------------------------------------------ */

export interface NarrationRequest {
  storyId: string;
  voiceSlug?: string | null;
  speed?: number;
}

/** Queues narration for a story. The story owns its language (§10). */
export async function requestNarration(
  ownerId: string,
  input: NarrationRequest,
  db?: UserClient,
): Promise<{ queued: boolean }> {
  const features = await getSetting('features');
  if (!features.narration_enabled) throw errors.notConfigured('Narration');

  await enforce('narration', ownerId);

  const story = await ownedStory(ownerId, input.storyId, db);
  if (!story.current_version_id) throw errors.validation('This story is not ready yet.');

  if (!(await credits.canAfford(ownerId, 'story_narration'))) {
    throw errors.insufficientCredits(
      await credits.costOf('story_narration'),
      await credits.getBalance(ownerId),
    );
  }

  const speed = clampSpeed(input.speed ?? 1);
  const voiceSlug = input.voiceSlug ?? null;

  await enqueue({
    type: 'story_narration',
    ownerId,
    storyId: story.id,
    versionId: story.current_version_id,
    priority: 20,
    payload: { voiceSlug, speed },
    // Same story, voice and speed => the same job, so a double tap does
    // not queue two syntheses.
    idempotencyKey: `narration:${story.current_version_id}:${voiceSlug ?? 'default'}:${speed}`,
  });

  kickWorker();

  await capture({
    name: ANALYTICS_EVENTS.narrationStarted,
    ownerId,
    properties: { language: story.language_code, voice: voiceSlug ?? 'default' },
  });

  return { queued: true };
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(2, Math.max(0.5, Math.round(speed * 100) / 100));
}

/* ------------------------------------------------------------------ */

export interface PdfRequest {
  storyId: string;
  variant: 'digital' | 'print';
  pageSize: 'a5' | 'a4' | 'square';
}

/**
 * Renders (or reuses) a PDF and returns a signed download URL.
 *
 * Rendered inline rather than queued: a book is a few hundred
 * milliseconds of pdf-lib work, and making a parent wait for a worker
 * tick to download something they can already read would be worse.
 */
export async function buildPdf(
  ownerId: string,
  input: PdfRequest,
  db?: UserClient,
): Promise<{ url: string; pageCount: number | null }> {
  const features = await getSetting('features');
  if (!features.pdf_enabled) throw errors.notConfigured('PDF download');

  await enforce('pdf', ownerId);

  const story = await ownedStory(ownerId, input.storyId, db);
  if (!story.current_version_id || story.status !== 'ready') {
    throw errors.validation('This story is still being created.');
  }

  const { handlePdf } = await import('@/services/jobs/handlers/pdf');

  const result = await handlePdf({
    id: crypto.randomUUID(),
    type: 'story_pdf',
    status: 'running',
    owner_id: ownerId,
    story_id: story.id,
    version_id: story.current_version_id,
    page_id: null,
    payload: { variant: input.variant, pageSize: input.pageSize },
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
    ownerId,
    properties: { variant: input.variant, size: input.pageSize, language: story.language_code },
  });

  return { url, pageCount: typeof result['pageCount'] === 'number' ? result['pageCount'] : null };
}

/* ------------------------------------------------------------------ */

export interface RemixRequest {
  storyId: string;
  kind: RemixKind;
  languageCode?: string | null;
  objectiveSlug?: string | null;
  illustrationStyleSlug?: string | null;
}

/** Creates a new story from an existing one. The original is untouched (§12). */
export async function remixStory(
  ownerId: string,
  input: RemixRequest,
  db?: UserClient,
): Promise<{ storyId: string }> {
  const features = await getSetting('features');
  if (!features.remix_enabled) throw errors.notConfigured('Remix');

  const supabase = await client(db);
  const { data: original } = await supabase
    .from('stories')
    .select(
      'id, child_id, language_code, theme_slug, objective_slug, illustration_style_slug, length, custom_instructions, dedication',
    )
    .eq('id', input.storyId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (!original) throw errors.notFound('Story');
  if (!original.child_id) {
    throw errors.validation('This story’s child profile has been removed, so it cannot be remixed.');
  }

  const length: StoryLength =
    input.kind === 'shorter'
      ? shorten(original.length)
      : input.kind === 'longer'
        ? lengthen(original.length)
        : original.length;

  return createStory({
    ownerId,
    childId: original.child_id,
    languageCode:
      input.kind === 'different_language' && input.languageCode
        ? input.languageCode
        : original.language_code,
    themeSlug: original.theme_slug,
    objectiveSlug:
      input.kind === 'different_lesson' ? (input.objectiveSlug ?? null) : original.objective_slug,
    illustrationStyleSlug:
      input.kind === 'different_style'
        ? (input.illustrationStyleSlug ?? original.illustration_style_slug)
        : original.illustration_style_slug,
    length,
    customInstructions: original.custom_instructions,
    dedication: original.dedication,
    remix: { fromStoryId: original.id, kind: input.kind },
  });
}

function shorten(length: StoryLength): StoryLength {
  return length === 'long' ? 'medium' : 'short';
}

function lengthen(length: StoryLength): StoryLength {
  return length === 'short' ? 'medium' : 'long';
}

/* ------------------------------------------------------------------ */

export async function setFavourite(
  ownerId: string,
  storyId: string,
  isFavourite: boolean | 'toggle',
  db?: UserClient,
): Promise<{ isFavourite: boolean }> {
  const supabase = await client(db);

  let next: boolean;
  if (isFavourite === 'toggle') {
    const { data } = await supabase
      .from('stories')
      .select('is_favourite')
      .eq('id', storyId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (!data) throw errors.notFound('Story');
    next = !data.is_favourite;
  } else {
    next = isFavourite;
  }

  const { error } = await supabase
    .from('stories')
    .update({ is_favourite: next })
    .eq('id', storyId)
    .eq('owner_id', ownerId);

  if (error) throw errors.notFound('Story');
  return { isFavourite: next };
}

export async function renameStory(
  ownerId: string,
  storyId: string,
  title: string,
  db?: UserClient,
): Promise<{ title: string }> {
  const trimmed = title.trim().slice(0, 120);
  if (trimmed.length === 0) throw errors.validation('Please enter a title.');

  const supabase = await client(db);
  const { data, error } = await supabase
    .from('stories')
    .update({ title: trimmed })
    .eq('id', storyId)
    .eq('owner_id', ownerId)
    .select('title')
    .maybeSingle();

  if (error || !data) throw errors.notFound('Story');
  return { title: trimmed };
}

/**
 * Deletes a story and every paid-for asset it owns.
 *
 * Share links are revoked first, so a link already circulating stops
 * working immediately rather than at the end of a slow cleanup.
 */
export async function deleteStory(
  ownerId: string,
  storyId: string,
  db?: UserClient,
): Promise<{ deleted: boolean }> {
  const story = await ownedStory(ownerId, storyId, db);
  const admin = supabaseAdmin();

  await admin
    .from('share_links')
    .update({ is_enabled: false, revoked_at: new Date().toISOString() })
    .eq('story_id', story.id);

  const [{ data: images }, { data: audio }, { data: pdfs }] = await Promise.all([
    admin.from('story_illustrations').select('storage_path').eq('story_id', story.id),
    admin.from('narrations').select('storage_path').eq('story_id', story.id),
    admin.from('story_pdfs').select('storage_path').eq('story_id', story.id),
  ]);

  const paths = (rows: Array<{ storage_path: string | null }> | null) =>
    (rows ?? []).map((row) => row.storage_path).filter((path): path is string => Boolean(path));

  await Promise.all([
    storage.remove(STORAGE_BUCKETS.illustrations, paths(images)),
    storage.remove(STORAGE_BUCKETS.narrations, paths(audio)),
    storage.remove(STORAGE_BUCKETS.storyPdfs, paths(pdfs)),
  ]);

  const supabase = await client(db);
  const { error } = await supabase.from('stories').delete().eq('id', story.id).eq('owner_id', ownerId);
  if (error) throw errors.validation('We could not delete this story.');

  return { deleted: true };
}

/** Requeues a failed story from the beginning, reusing the same row. */
export async function retryStory(
  ownerId: string,
  storyId: string,
  db?: UserClient,
): Promise<{ queued: boolean }> {
  await enforce('story_create', ownerId);

  const story = await ownedStory(ownerId, storyId, db);
  if (story.status !== 'failed') throw errors.validation('This story does not need retrying.');
  if (!story.current_version_id) throw errors.validation('This story cannot be retried.');

  const admin = supabaseAdmin();
  const { data: job } = await admin
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
      ownerId,
      storyId: story.id,
      versionId: story.current_version_id,
      priority: 10,
      idempotencyKey: `story_text:${story.current_version_id}:retry:${Date.now()}`,
    });
  }

  await admin
    .from('stories')
    .update({ status: 'queued', failure_reason: null, status_message: 'Trying again' })
    .eq('id', story.id);

  kickWorker();
  return { queued: true };
}

/** Redraws one illustration without regenerating the book (§27). */
export async function retryIllustration(
  ownerId: string,
  storyId: string,
  illustrationId: string,
  db?: UserClient,
): Promise<{ queued: boolean }> {
  await enforce('illustration', ownerId);

  const story = await ownedStory(ownerId, storyId, db);
  const admin = supabaseAdmin();

  const { data: illustration } = await admin
    .from('story_illustrations')
    .select('id, page_id, is_cover, version_id')
    .eq('id', illustrationId)
    .eq('story_id', story.id)
    .maybeSingle();

  if (!illustration) throw errors.notFound('Illustration');

  await admin
    .from('story_illustrations')
    .update({ status: 'pending', error_message: null, prompt_fingerprint: null })
    .eq('id', illustration.id);

  await enqueue({
    type: illustration.is_cover ? 'story_cover' : 'story_illustration',
    ownerId,
    storyId: story.id,
    versionId: illustration.version_id,
    pageId: illustration.page_id,
    priority: 15,
    idempotencyKey: `illustration-retry:${illustration.id}:${Date.now()}`,
  });

  kickWorker();
  return { queued: true };
}

/* ------------------------------------------------------------------ */

export interface ShareState {
  token: string | null;
  url: string | null;
  isEnabled: boolean;
  allowAudio: boolean;
  allowDownload: boolean;
  allowIndexing: boolean;
  expiresAt: string | null;
  viewCount: number;
}

export async function getShareLink(
  ownerId: string,
  storyId: string,
  db?: UserClient,
): Promise<ShareState | null> {
  const supabase = await client(db);
  const { data } = await supabase
    .from('share_links')
    .select('token, is_enabled, allow_audio, allow_download, allow_indexing, expires_at, view_count, revoked_at')
    .eq('story_id', storyId)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  return {
    token: data.token,
    url: `${siteUrl()}/share/${data.token}`,
    isEnabled: data.is_enabled,
    allowAudio: data.allow_audio,
    allowDownload: data.allow_download,
    allowIndexing: data.allow_indexing,
    expiresAt: data.expires_at,
    viewCount: data.view_count,
  };
}

export interface ShareInput {
  storyId: string;
  allowAudio: boolean;
  allowDownload: boolean;
  allowIndexing: boolean;
  expiresInDays: number;
}

export async function upsertShareLink(
  ownerId: string,
  input: ShareInput,
  db?: UserClient,
): Promise<ShareState> {
  const features = await getSetting('features');
  if (!features.sharing_enabled) throw errors.notConfigured('Sharing');

  await enforce('share_create', ownerId);

  const supabase = await client(db);
  const { data: story } = await supabase
    .from('stories')
    .select('id, status, current_version_id')
    .eq('id', input.storyId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (!story) throw errors.notFound('Story');
  if (story.status !== 'ready') throw errors.validation('You can share a story once it is finished.');

  const expiresAt =
    input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
      : null;

  const { data: existing } = await supabase
    .from('share_links')
    .select('id, token')
    .eq('story_id', story.id)
    .eq('owner_id', ownerId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const patch = {
    is_enabled: true,
    allow_audio: input.allowAudio,
    allow_download: input.allowDownload,
    allow_indexing: input.allowIndexing,
    expires_at: expiresAt,
    version_id: story.current_version_id,
  };

  let token: string;
  if (existing) {
    token = existing.token;
    const { error } = await supabase.from('share_links').update(patch).eq('id', existing.id);
    if (error) throw errors.validation('We could not update the sharing settings.');
  } else {
    token = generateShareToken();
    const { error } = await supabase
      .from('share_links')
      .insert({ story_id: story.id, owner_id: ownerId, token, ...patch });
    if (error) throw errors.validation('We could not create the share link.');
  }

  await capture({
    name: ANALYTICS_EVENTS.storyShared,
    ownerId,
    properties: { allow_audio: input.allowAudio, allow_download: input.allowDownload },
  });

  return {
    token,
    url: `${siteUrl()}/share/${token}`,
    isEnabled: true,
    allowAudio: input.allowAudio,
    allowDownload: input.allowDownload,
    allowIndexing: input.allowIndexing,
    expiresAt,
    viewCount: 0,
  };
}

/**
 * Revokes sharing permanently.
 *
 * The token is retired rather than disabled, so re-sharing later mints a
 * new one and a revoked URL can never come back to life.
 */
export async function revokeShare(
  ownerId: string,
  storyId: string,
  db?: UserClient,
): Promise<{ revoked: boolean }> {
  const supabase = await client(db);
  const { error } = await supabase
    .from('share_links')
    .update({ is_enabled: false, revoked_at: new Date().toISOString() })
    .eq('story_id', storyId)
    .eq('owner_id', ownerId)
    .is('revoked_at', null);

  if (error) throw errors.validation('We could not revoke the link.');
  return { revoked: true };
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
