import 'server-only';

import { errors } from '@/lib/errors';
import { supabaseServer } from '@/services/supabase/server';
import { supabaseAdmin } from '@/services/supabase/admin';
import * as storage from '@/services/storage';
import { STORAGE_BUCKETS } from '@/config/constants';
import type {
  LibraryCard,
  NarrationTiming,
  ReaderPage,
  ReaderStory,
} from '@/types/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';

/**
 * Story reads for the library and the reader.
 *
 * Reads go through the user-scoped client so RLS enforces ownership. The
 * only thing the service-role client is used for is minting signed URLs
 * for private storage objects, which RLS cannot do on the user's behalf.
 */

export async function listLibrary(ownerId: string): Promise<LibraryCard[]> {
  const supabase = await supabaseServer();

  // Deliberately no embedded resources. `stories` has two relationships to
  // `story_illustrations` (the cover pointer and the story back-reference),
  // which makes an embed ambiguous and forces a fragile foreign-key hint.
  // Four small indexed queries are easier to reason about and cannot break
  // on a constraint rename.
  const { data: rows, error } = await supabase
    .from('stories')
    .select(
      'id, title, subtitle, status, language_code, theme_slug, is_favourite, created_at, child_snapshot, current_version_id, cover_illustration_id',
    )
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(120);

  if (error) throw errors.notFound('Library');
  if (rows.length === 0) return [];

  const storyIds = rows.map((row) => row.id);
  const versionIds = rows.map((row) => row.current_version_id).filter((id): id is string => Boolean(id));
  const coverIds = rows.map((row) => row.cover_illustration_id).filter((id): id is string => Boolean(id));

  const [pageCounts, narrated, covers, sharedStoryIds] = await Promise.all([
    countPagesByVersion(versionIds),
    narratedVersions(versionIds),
    coverPathsById(coverIds),
    sharedStories(supabase, ownerId, storyIds),
  ]);

  const signed = await storage.signedUrls(STORAGE_BUCKETS.illustrations, [...covers.values()]);

  return rows.map((row) => {
    const coverPath = row.cover_illustration_id ? covers.get(row.cover_illustration_id) : undefined;

    return {
      id: row.id,
      title: row.title ?? 'Untitled story',
      subtitle: row.subtitle,
      status: row.status,
      languageCode: row.language_code,
      themeSlug: row.theme_slug,
      childDisplayName: displayNameOf(row.child_snapshot),
      isFavourite: row.is_favourite,
      createdAt: row.created_at,
      coverUrl: coverPath ? (signed.get(coverPath) ?? null) : null,
      pageCount: row.current_version_id ? (pageCounts.get(row.current_version_id) ?? 0) : 0,
      hasNarration: row.current_version_id ? narrated.has(row.current_version_id) : false,
      isShared: sharedStoryIds.has(row.id),
    };
  });
}

/** Loads a story for the owner's reader, with signed asset URLs. */
export async function getReaderStory(ownerId: string, storyId: string): Promise<ReaderStory> {
  const supabase = await supabaseServer();

  const { data: story, error } = await supabase
    .from('stories')
    .select('*')
    .eq('id', storyId)
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !story) throw errors.notFound('Story');
  if (!story.current_version_id) {
    return emptyReaderStory(story);
  }

  const [{ data: version }, { data: pages }, { data: illustrations }, { data: narration }] =
    await Promise.all([
      supabase
        .from('story_versions')
        .select('id, title, subtitle, summary, educational_takeaway, discussion_questions')
        .eq('id', story.current_version_id)
        .maybeSingle(),
      supabase
        .from('story_pages')
        .select('id, page_number, text, layout')
        .eq('version_id', story.current_version_id)
        .order('page_number'),
      supabase
        .from('story_illustrations')
        .select('id, page_id, is_cover, storage_path, width, height, status')
        .eq('version_id', story.current_version_id)
        .is('superseded_by', null),
      supabase
        .from('narrations')
        .select('id, storage_path, duration_seconds, voice_slug, status, timings')
        .eq('version_id', story.current_version_id)
        .eq('scope', 'full_story')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const illustrationRows = illustrations ?? [];
  const imageUrls = await storage.signedUrls(
    STORAGE_BUCKETS.illustrations,
    illustrationRows.map((row) => row.storage_path),
  );
  const audioUrl =
    narration?.status === 'ready'
      ? await storage.signedUrl(STORAGE_BUCKETS.narrations, narration.storage_path)
      : null;

  const coverRow = illustrationRows.find((row) => row.is_cover);
  const byPage = new Map(illustrationRows.filter((row) => row.page_id).map((row) => [row.page_id!, row]));

  const readerPages: ReaderPage[] = (pages ?? []).map((page) => {
    const illustration = byPage.get(page.id);
    return {
      id: page.id,
      pageNumber: page.page_number,
      text: page.text,
      layout: page.layout,
      illustration: illustration
        ? {
            id: illustration.id,
            url: illustration.storage_path ? (imageUrls.get(illustration.storage_path) ?? null) : null,
            width: illustration.width,
            height: illustration.height,
            status: illustration.status,
          }
        : null,
    };
  });

  return {
    id: story.id,
    title: version?.title ?? story.title ?? 'Untitled story',
    subtitle: version?.subtitle ?? story.subtitle,
    summary: version?.summary ?? story.summary,
    dedication: story.dedication,
    languageCode: story.language_code,
    themeSlug: story.theme_slug,
    status: story.status,
    statusMessage: story.status_message,
    childDisplayName: displayNameOf(story.child_snapshot),
    educationalTakeaway: version?.educational_takeaway ?? null,
    discussionQuestions: version?.discussion_questions ?? [],
    isFavourite: story.is_favourite,
    createdAt: story.created_at,
    versionId: story.current_version_id,
    cover: coverRow
      ? {
          id: coverRow.id,
          url: coverRow.storage_path ? (imageUrls.get(coverRow.storage_path) ?? null) : null,
          width: coverRow.width,
          height: coverRow.height,
          status: coverRow.status,
        }
      : null,
    pages: readerPages,
    narration: narration
      ? {
          id: narration.id,
          url: audioUrl,
          durationSeconds: narration.duration_seconds,
          voiceSlug: narration.voice_slug,
          status: narration.status,
          timings: parseTimings(narration.timings),
        }
      : null,
    ownerControls: { canNarrate: true, canDownloadPdf: true, canShare: true, canRemix: true },
  };
}

/** Lightweight status poll used by the generation progress screen (§27). */
export async function getStoryProgress(
  ownerId: string,
  storyId: string,
): Promise<{
  status: string;
  statusMessage: string | null;
  failureReason: string | null;
  percent: number;
  totalIllustrations: number;
  readyIllustrations: number;
}> {
  const supabase = await supabaseServer();

  const { data: story } = await supabase
    .from('stories')
    .select('status, status_message, failure_reason, current_version_id')
    .eq('id', storyId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (!story) throw errors.notFound('Story');

  let total = 0;
  let ready = 0;

  if (story.current_version_id) {
    const { data: rows } = await supabase
      .from('story_illustrations')
      .select('status')
      .eq('version_id', story.current_version_id)
      .is('superseded_by', null);

    total = rows?.length ?? 0;
    ready = rows?.filter((row) => row.status === 'ready').length ?? 0;
  }

  const percent = percentFor(story.status, total, ready);

  return {
    status: story.status,
    statusMessage: story.status_message,
    failureReason: story.failure_reason,
    percent,
    totalIllustrations: total,
    readyIllustrations: ready,
  };
}

function percentFor(status: string, total: number, ready: number): number {
  switch (status) {
    case 'queued':
      return 5;
    case 'generating_text':
      return 20;
    case 'text_ready':
      return 35;
    case 'generating_images':
      return total === 0 ? 45 : Math.round(35 + (ready / total) * 60);
    case 'generating_audio':
      return 92;
    case 'ready':
      return 100;
    case 'failed':
      return 100;
    default:
      return 0;
  }
}

/* ------------------------------------------------------------------ */

async function countPagesByVersion(versionIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (versionIds.length === 0) return counts;

  const { data } = await supabaseAdmin()
    .from('story_pages')
    .select('version_id')
    .in('version_id', versionIds);

  for (const row of data ?? []) {
    counts.set(row.version_id, (counts.get(row.version_id) ?? 0) + 1);
  }
  return counts;
}

async function narratedVersions(versionIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (versionIds.length === 0) return set;

  const { data } = await supabaseAdmin()
    .from('narrations')
    .select('version_id')
    .in('version_id', versionIds)
    .eq('status', 'ready');

  for (const row of data ?? []) set.add(row.version_id);
  return set;
}

/** Storage paths for the covers that are actually ready to display. */
async function coverPathsById(illustrationIds: string[]): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  if (illustrationIds.length === 0) return paths;

  const { data } = await supabaseAdmin()
    .from('story_illustrations')
    .select('id, storage_path, status')
    .in('id', illustrationIds);

  for (const row of data ?? []) {
    if (row.status === 'ready' && row.storage_path) paths.set(row.id, row.storage_path);
  }
  return paths;
}

/** The subset of these stories that currently has a live share link. */
async function sharedStories(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  storyIds: string[],
): Promise<Set<string>> {
  const shared = new Set<string>();
  if (storyIds.length === 0) return shared;

  const { data } = await supabase
    .from('share_links')
    .select('story_id')
    .eq('owner_id', ownerId)
    .eq('is_enabled', true)
    .is('revoked_at', null)
    .in('story_id', storyIds);

  for (const row of data ?? []) shared.add(row.story_id);
  return shared;
}

export function displayNameOf(snapshot: Json | null): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const value = (snapshot as Record<string, unknown>)['display_name'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseTimings(value: Json | null): NarrationTiming[] | null {
  if (!Array.isArray(value)) return null;
  const out: NarrationTiming[] = [];
  for (const entry of value) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      if (
        typeof record['pageNumber'] === 'number' &&
        typeof record['startSeconds'] === 'number' &&
        typeof record['endSeconds'] === 'number'
      ) {
        out.push({
          pageNumber: record['pageNumber'],
          startSeconds: record['startSeconds'],
          endSeconds: record['endSeconds'],
        });
      }
    }
  }
  return out.length > 0 ? out : null;
}

function emptyReaderStory(story: {
  id: string;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  dedication: string | null;
  language_code: string;
  theme_slug: string;
  status: ReaderStory['status'];
  status_message: string | null;
  child_snapshot: Json;
  is_favourite: boolean;
  created_at: string;
}): ReaderStory {
  return {
    id: story.id,
    title: story.title ?? 'Untitled story',
    subtitle: story.subtitle,
    summary: story.summary,
    dedication: story.dedication,
    languageCode: story.language_code,
    themeSlug: story.theme_slug,
    status: story.status,
    statusMessage: story.status_message,
    childDisplayName: displayNameOf(story.child_snapshot),
    educationalTakeaway: null,
    discussionQuestions: [],
    isFavourite: story.is_favourite,
    createdAt: story.created_at,
    versionId: '',
    cover: null,
    pages: [],
    narration: null,
    ownerControls: { canNarrate: false, canDownloadPdf: false, canShare: false, canRemix: false },
  };
}
