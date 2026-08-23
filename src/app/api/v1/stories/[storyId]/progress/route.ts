import { authenticated, preflight } from '@/services/api/handler';
import { getStoryProgress } from '@/features/stories/queries';

/**
 * Generation progress (§27).
 *
 * Polled every couple of seconds while a book is being made, so it does
 * one indexed read and returns a handful of numbers.
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const GET = authenticated<{ storyId: string }, unknown>(async ({ actor, params }) =>
  getStoryProgress(actor.userId, params.storyId, actor.db),
);
