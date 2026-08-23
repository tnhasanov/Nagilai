import { authenticated, preflight } from '@/services/api/handler';
import * as ops from '@/features/stories/operations';

/** Redraws one picture without regenerating the book (§27). */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const POST = authenticated<{ storyId: string; illustrationId: string }, unknown>(
  async ({ actor, params }) =>
    ops.retryIllustration(actor.userId, params.storyId, params.illustrationId, actor.db),
);
