import { z } from 'zod';
import { authenticated, body, preflight } from '@/services/api/handler';
import { getReaderStory } from '@/features/stories/queries';
import * as ops from '@/features/stories/operations';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS } from '@/config/constants';

/**
 * One story, fully hydrated for the reader: pages, illustrations,
 * narration and signed asset URLs.
 *
 * The signed URLs are short-lived, which is what makes it safe to hand
 * private media to a client at all. A native app should download what it
 * wants to keep rather than storing the URL.
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const GET = authenticated<{ storyId: string }, unknown>(async ({ actor, params }) => {
  const story = await getReaderStory(actor.userId, params.storyId, actor.db);

  if (story.status === 'ready') {
    await capture({
      name: ANALYTICS_EVENTS.storyOpened,
      ownerId: actor.userId,
      properties: { language: story.languageCode, theme: story.themeSlug, surface: 'mobile' },
    });
  }

  const share = await ops.getShareLink(actor.userId, params.storyId, actor.db);
  return { story, share };
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    isFavourite: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.isFavourite !== undefined, {
    message: 'Provide a title or a favourite state.',
  });

export const PATCH = authenticated<{ storyId: string }, unknown>(async ({ actor, request, params }) => {
  const input = await body(request, patchSchema);
  const result: { title?: string; isFavourite?: boolean } = {};

  if (input.title !== undefined) {
    result.title = (await ops.renameStory(actor.userId, params.storyId, input.title, actor.db)).title;
  }
  if (input.isFavourite !== undefined) {
    result.isFavourite = (
      await ops.setFavourite(actor.userId, params.storyId, input.isFavourite, actor.db)
    ).isFavourite;
  }

  return result;
});

export const DELETE = authenticated<{ storyId: string }, unknown>(async ({ actor, params }) =>
  ops.deleteStory(actor.userId, params.storyId, actor.db),
);
