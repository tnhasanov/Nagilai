import 'server-only';

import { createLogger } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import type { StoryStatus } from '@/types/database';

/**
 * Story status derivation (§27).
 *
 * Status is *derived* from the state of the assets rather than pushed
 * around by whichever job happens to finish last. Illustration jobs run
 * concurrently and complete out of order, so a handler that simply wrote
 * "ready" when it finished would race with its siblings.
 *
 * Narration and PDF deliberately do not move the story status: they are
 * on-demand, per-asset, and a book is readable without them.
 */
const log = createLogger('stories:status');

export async function setStatus(
  storyId: string,
  status: StoryStatus,
  message?: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('stories')
    .update({
      status,
      status_message: message ?? null,
      ...(status === 'ready' ? { first_ready_at: new Date().toISOString() } : {}),
      ...(status === 'failed' ? {} : { failure_reason: null }),
    })
    .eq('id', storyId);

  if (error) log.error('could not set story status', { storyId, status, error: error.message });
}

export async function markFailed(storyId: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('stories')
    .update({ status: 'failed', failure_reason: reason.slice(0, 500), status_message: null })
    .eq('id', storyId);

  if (error) log.error('could not mark story failed', { storyId, error: error.message });
}

export interface StoryProgress {
  status: StoryStatus;
  totalIllustrations: number;
  readyIllustrations: number;
  failedIllustrations: number;
  percent: number;
}

/**
 * Recomputes and persists the status of a story from its current assets.
 *
 * Called after every illustration job. Idempotent, so several concurrent
 * callers converge on the same answer.
 */
export async function recomputeStatus(storyId: string): Promise<StoryProgress> {
  const admin = supabaseAdmin();

  const { data: story, error: storyError } = await admin
    .from('stories')
    .select('id, status, current_version_id')
    .eq('id', storyId)
    .single();

  if (storyError || !story) {
    log.error('could not load story for status recompute', { storyId });
    return { status: 'failed', totalIllustrations: 0, readyIllustrations: 0, failedIllustrations: 0, percent: 0 };
  }

  if (story.status === 'failed' || story.status === 'archived') {
    return {
      status: story.status,
      totalIllustrations: 0,
      readyIllustrations: 0,
      failedIllustrations: 0,
      percent: 0,
    };
  }

  if (!story.current_version_id) {
    return { status: story.status, totalIllustrations: 0, readyIllustrations: 0, failedIllustrations: 0, percent: 10 };
  }

  const { data: illustrations } = await admin
    .from('story_illustrations')
    .select('status')
    .eq('version_id', story.current_version_id)
    .is('superseded_by', null);

  const rows = illustrations ?? [];
  const total = rows.length;
  const ready = rows.filter((row) => row.status === 'ready').length;
  const failed = rows.filter((row) => row.status === 'failed' || row.status === 'skipped').length;
  const settled = ready + failed;

  let next: StoryStatus;
  if (total === 0) {
    // Text-only story, or illustrations have not been enqueued yet.
    next = story.status === 'generating_text' || story.status === 'queued' ? story.status : 'ready';
  } else if (settled >= total) {
    // A book with at least one picture is worth reading even if one image
    // failed; the reader offers a per-image retry (§27).
    next = 'ready';
  } else {
    next = 'generating_images';
  }

  if (next !== story.status) {
    await setStatus(storyId, next);
  }

  const percent =
    total === 0 ? (next === 'ready' ? 100 : 40) : Math.round(35 + (settled / total) * 65);

  return { status: next, totalIllustrations: total, readyIllustrations: ready, failedIllustrations: failed, percent };
}
