import { authenticated, preflight } from '@/services/api/handler';
import * as ops from '@/features/stories/operations';

/** Retries a failed story from the beginning, reusing the same row (§32). */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const POST = authenticated<{ storyId: string }, unknown>(async ({ actor, params }) =>
  ops.retryStory(actor.userId, params.storyId, actor.db),
);
