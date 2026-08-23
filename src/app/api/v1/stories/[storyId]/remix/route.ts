import { z } from 'zod';
import { authenticated, body, preflight } from '@/services/api/handler';
import * as ops from '@/features/stories/operations';
import { remixKindSchema } from '@/features/stories/schemas';

/** Creates a new story from an existing one. The original is untouched (§12). */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

const schema = z.object({
  kind: remixKindSchema,
  languageCode: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).nullable().optional(),
  objectiveSlug: z.string().trim().max(64).nullable().optional(),
  illustrationStyleSlug: z.string().trim().max(64).nullable().optional(),
});

export const POST = authenticated<{ storyId: string }, unknown>(async ({ actor, request, params }) => {
  const input = await body(request, schema);

  return ops.remixStory(
    actor.userId,
    {
      storyId: params.storyId,
      kind: input.kind,
      languageCode: input.languageCode ?? null,
      objectiveSlug: input.objectiveSlug ?? null,
      illustrationStyleSlug: input.illustrationStyleSlug ?? null,
    },
    actor.db,
  );
});
