import 'server-only';

import { createLogger } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import * as storage from '@/services/storage';
import { STORAGE_BUCKETS } from '@/config/constants';
import type { ReaderPage, ReaderStory } from '@/types/domain';
import type { Json } from '@/types/database';

/**
 * The public share view (§21).
 *
 * Reads through `get_shared_story()`, a security-definer function that
 * returns exactly the fields a shared book needs. An anonymous visitor
 * never queries `stories`, `children` or `profiles` -- so there is no
 * query for them to widen, and no child's personal information for the
 * page to accidentally render.
 */
const log = createLogger('sharing');

export interface SharedStoryView {
  story: ReaderStory;
  allowIndexing: boolean;
  allowDownload: boolean;
}

export async function getSharedStory(token: string): Promise<SharedStoryView | null> {
  if (!token || token.length < 32) return null;

  const { data, error } = await supabaseAdmin().rpc('get_shared_story', { p_token: token });

  if (error) {
    log.warn('share lookup failed', { error: error.message });
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const payload = data as Record<string, Json>;
  const storyNode = asRecord(payload['story']);
  const shareNode = asRecord(payload['share']);
  if (!storyNode) return null;

  const pageNodes = Array.isArray(payload['pages']) ? payload['pages'] : [];
  const coverNode = asRecord(payload['cover']);
  const narrationNode = asRecord(payload['narration']);

  const imagePaths = [
    stringOf(coverNode?.['storage_path']),
    ...pageNodes.map((page) => stringOf(asRecord(asRecord(page)?.['illustration'])?.['storage_path'])),
  ];
  const signed = await storage.signedUrls(STORAGE_BUCKETS.illustrations, imagePaths);

  const audioPath = stringOf(narrationNode?.['storage_path']);
  const audioUrl = audioPath
    ? await storage.signedUrl(STORAGE_BUCKETS.narrations, audioPath)
    : null;

  const pages: ReaderPage[] = pageNodes.map((node) => {
    const page = asRecord(node) ?? {};
    const illustration = asRecord(page['illustration']);
    const path = stringOf(illustration?.['storage_path']);
    return {
      id: stringOf(page['id']) ?? '',
      pageNumber: numberOf(page['page_number']) ?? 0,
      text: stringOf(page['text']) ?? '',
      layout: stringOf(page['layout']) ?? 'illustration_top',
      illustration: path
        ? {
            id: path,
            url: signed.get(path) ?? null,
            width: numberOf(illustration?.['width']),
            height: numberOf(illustration?.['height']),
            status: 'ready',
          }
        : null,
    };
  });

  const coverPath = stringOf(coverNode?.['storage_path']);

  const story: ReaderStory = {
    id: stringOf(storyNode['id']) ?? '',
    title: stringOf(storyNode['title']) ?? 'A Nagilai story',
    subtitle: stringOf(storyNode['subtitle']),
    summary: stringOf(storyNode['summary']),
    dedication: stringOf(storyNode['dedication']),
    languageCode: stringOf(storyNode['language_code']) ?? 'en-US',
    themeSlug: stringOf(storyNode['theme_slug']) ?? 'adventure',
    status: 'ready',
    statusMessage: null,
    childDisplayName: stringOf(storyNode['child_display_name']),
    educationalTakeaway: stringOf(storyNode['educational_takeaway']),
    discussionQuestions: [],
    isFavourite: false,
    createdAt: stringOf(storyNode['created_at']) ?? new Date().toISOString(),
    versionId: stringOf(payload['version_id']) ?? '',
    cover: coverPath
      ? {
          id: coverPath,
          url: signed.get(coverPath) ?? null,
          width: numberOf(coverNode?.['width']),
          height: numberOf(coverNode?.['height']),
          status: 'ready',
        }
      : null,
    pages,
    narration: audioUrl
      ? {
          id: audioPath ?? '',
          url: audioUrl,
          durationSeconds: numberOf(narrationNode?.['duration_seconds']),
          voiceSlug: '',
          status: 'ready',
          timings: null,
        }
      : null,
    // A visitor gets no owner controls at all -- not hidden ones.
    ownerControls: null,
  };

  return {
    story,
    allowIndexing: Boolean(shareNode?.['allow_indexing']),
    allowDownload: Boolean(shareNode?.['allow_download']),
  };
}

/** Records a view. Separate from the read so the read can stay `stable`. */
export async function recordShareView(token: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc('touch_share_link', { p_token: token });
  if (error) log.debug('could not record share view', { error: error.message });
}

function asRecord(value: unknown): Record<string, Json> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, Json>;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}
