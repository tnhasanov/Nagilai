import { z } from 'zod';
import { authenticated, body, preflight } from '@/services/api/handler';
import * as ops from '@/features/stories/operations';

/**
 * Queues narration (§10).
 *
 * Note what the client does *not* send: a language. The story owns its
 * language, and the speech service reads it from the story row — the
 * specification's closing note rules out passing it around.
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

const schema = z.object({
  voiceSlug: z.string().trim().max(64).nullable().optional(),
  speed: z.number().min(0.5).max(2).optional(),
});

export const POST = authenticated<{ storyId: string }, unknown>(async ({ actor, request, params }) => {
  const input = await body(request, schema);

  return ops.requestNarration(
    actor.userId,
    {
      storyId: params.storyId,
      voiceSlug: input.voiceSlug ?? null,
      speed: input.speed ?? 1,
    },
    actor.db,
  );
});
