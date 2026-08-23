'use server';

import { revalidatePath } from 'next/cache';
import { errors } from '@/lib/errors';
import { attempt, type ActionResult } from '@/lib/result';
import { getCurrentUser } from '@/services/supabase/server';
import { createStory } from './create';
import * as ops from './operations';
import {
  createStoryInputSchema,
  narrationRequestSchema,
  pdfRequestSchema,
  remixInputSchema,
  type CreateStoryInput,
  type RemixInput,
} from './schemas';

/**
 * Story mutations for the web app.
 *
 * Thin wrappers: every one establishes the caller from the session,
 * validates, delegates to `./operations`, and revalidates the affected
 * paths. The mobile API calls the same operations with a token-scoped
 * client, so there is exactly one implementation of each rule.
 */

export async function createStoryAction(
  input: CreateStoryInput,
): Promise<ActionResult<{ storyId: string }>> {
  return attempt(async () => {
    const user = await requireUser();
    const parsed = createStoryInputSchema.parse(input);

    return createStory({
      ownerId: user.id,
      childId: parsed.childId,
      languageCode: parsed.languageCode,
      themeSlug: parsed.themeSlug,
      objectiveSlug: parsed.objectiveSlug || null,
      illustrationStyleSlug: parsed.illustrationStyleSlug || null,
      length: parsed.length,
      customInstructions: parsed.customInstructions || null,
      dedication: parsed.dedication || null,
    });
  });
}

export async function remixStoryAction(input: RemixInput): Promise<ActionResult<{ storyId: string }>> {
  return attempt(async () => {
    const user = await requireUser();
    const parsed = remixInputSchema.parse(input);

    return ops.remixStory(user.id, {
      storyId: parsed.storyId,
      kind: parsed.kind,
      languageCode: parsed.languageCode ?? null,
      objectiveSlug: parsed.objectiveSlug ?? null,
      illustrationStyleSlug: parsed.illustrationStyleSlug ?? null,
    });
  });
}

export async function requestNarrationAction(input: unknown): Promise<ActionResult<{ queued: boolean }>> {
  return attempt(async () => {
    const user = await requireUser();
    const parsed = narrationRequestSchema.parse(input);

    const result = await ops.requestNarration(user.id, {
      storyId: parsed.storyId,
      voiceSlug: parsed.voiceSlug ?? null,
      speed: parsed.speed,
    });

    revalidatePath(`/library/${parsed.storyId}`);
    return result;
  });
}

export async function requestPdfAction(
  input: unknown,
): Promise<ActionResult<{ url: string; pageCount: number | null }>> {
  return attempt(async () => {
    const user = await requireUser();
    const parsed = pdfRequestSchema.parse(input);

    return ops.buildPdf(user.id, {
      storyId: parsed.storyId,
      variant: parsed.variant,
      pageSize: parsed.pageSize,
    });
  });
}

export async function retryIllustrationAction(
  storyId: string,
  illustrationId: string,
): Promise<ActionResult<{ queued: boolean }>> {
  return attempt(async () => {
    const user = await requireUser();
    const result = await ops.retryIllustration(user.id, storyId, illustrationId);

    revalidatePath(`/library/${storyId}`);
    return result;
  });
}

export async function retryStoryAction(storyId: string): Promise<ActionResult<{ queued: boolean }>> {
  return attempt(async () => {
    const user = await requireUser();
    const result = await ops.retryStory(user.id, storyId);

    revalidatePath(`/library/${storyId}`);
    return result;
  });
}

export async function toggleFavouriteAction(
  storyId: string,
): Promise<ActionResult<{ isFavourite: boolean }>> {
  return attempt(async () => {
    const user = await requireUser();
    const result = await ops.setFavourite(user.id, storyId, 'toggle');

    revalidatePath('/library');
    return result;
  });
}

export async function renameStoryAction(
  storyId: string,
  title: string,
): Promise<ActionResult<{ title: string }>> {
  return attempt(async () => {
    const user = await requireUser();
    const result = await ops.renameStory(user.id, storyId, title);

    revalidatePath('/library');
    revalidatePath(`/library/${storyId}`);
    return result;
  });
}

export async function deleteStoryAction(storyId: string): Promise<ActionResult<{ deleted: boolean }>> {
  return attempt(async () => {
    const user = await requireUser();
    const result = await ops.deleteStory(user.id, storyId);

    revalidatePath('/library');
    return result;
  });
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthenticated();
  return user;
}
