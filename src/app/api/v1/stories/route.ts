import { authenticated, body, preflight } from '@/services/api/handler';
import { listLibrary } from '@/features/stories/queries';
import { createStory } from '@/features/stories/create';
import { createStoryInputSchema } from '@/features/stories/schemas';

/**
 * The library, and story creation.
 *
 * `POST` returns as soon as the work is enqueued — it never waits for a
 * model. The client redirects to the progress screen and polls
 * `/stories/{id}/progress` (§27).
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const GET = authenticated(async ({ actor }) => {
  const stories = await listLibrary(actor.userId, actor.db);
  return { stories };
});

export const POST = authenticated(async ({ actor, request }) => {
  const input = await body(request, createStoryInputSchema);

  const { storyId } = await createStory({
    ownerId: actor.userId,
    childId: input.childId,
    languageCode: input.languageCode,
    themeSlug: input.themeSlug,
    objectiveSlug: input.objectiveSlug || null,
    illustrationStyleSlug: input.illustrationStyleSlug || null,
    length: input.length,
    customInstructions: input.customInstructions || null,
    dedication: input.dedication || null,
  });

  return { storyId };
});
