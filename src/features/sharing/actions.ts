'use server';

import { revalidatePath } from 'next/cache';
import { errors } from '@/lib/errors';
import { attempt, type ActionResult } from '@/lib/result';
import { getCurrentUser } from '@/services/supabase/server';
import * as ops from '@/features/stories/operations';
import { shareSettingsSchema } from '@/features/stories/schemas';

/**
 * Sharing for the web app (§21).
 *
 * Stories are private by default and stay private until a parent
 * deliberately creates a link. The rules themselves live in
 * `features/stories/operations` so the mobile API enforces exactly the
 * same ones.
 */
export type { ShareState } from '@/features/stories/operations';

export async function getShareState(storyId: string): Promise<ops.ShareState | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return ops.getShareLink(user.id, storyId);
}

export async function createOrUpdateShareLink(input: unknown): Promise<ActionResult<ops.ShareState>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const parsed = shareSettingsSchema.parse(input);
    const result = await ops.upsertShareLink(user.id, {
      storyId: parsed.storyId,
      allowAudio: parsed.allowAudio,
      allowDownload: parsed.allowDownload,
      allowIndexing: parsed.allowIndexing,
      expiresInDays: parsed.expiresInDays,
    });

    revalidatePath(`/library/${parsed.storyId}`);
    return result;
  });
}

export async function revokeShareLink(storyId: string): Promise<ActionResult<{ revoked: boolean }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const result = await ops.revokeShare(user.id, storyId);
    revalidatePath(`/library/${storyId}`);
    return result;
  });
}
