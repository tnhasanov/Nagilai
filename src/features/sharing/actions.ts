'use server';

import { revalidatePath } from 'next/cache';
import { errors } from '@/lib/errors';
import { attempt, type ActionResult } from '@/lib/result';
import { generateShareToken } from '@/lib/crypto';
import { getCurrentUser, supabaseServer } from '@/services/supabase/server';
import { getSetting } from '@/services/config/settings';
import { enforce } from '@/services/ratelimit';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS } from '@/config/constants';
import { siteUrl } from '@/config/env';
import { shareSettingsSchema } from '@/features/stories/schemas';

/**
 * Sharing (§21).
 *
 * Stories are private by default and stay private until a parent
 * deliberately creates a link. The link carries 256 bits of entropy, can
 * expire, can be revoked, and defaults to `noindex` (§31). Audio and
 * download are separate switches, because "show my mother the book" and
 * "let anyone download a PDF of my child" are different decisions.
 */

export interface ShareState {
  token: string | null;
  url: string | null;
  isEnabled: boolean;
  allowAudio: boolean;
  allowDownload: boolean;
  allowIndexing: boolean;
  expiresAt: string | null;
  viewCount: number;
}

export async function getShareState(storyId: string): Promise<ShareState | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('share_links')
    .select('token, is_enabled, allow_audio, allow_download, allow_indexing, expires_at, view_count, revoked_at')
    .eq('story_id', storyId)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  return {
    token: data.token,
    url: `${siteUrl()}/share/${data.token}`,
    isEnabled: data.is_enabled,
    allowAudio: data.allow_audio,
    allowDownload: data.allow_download,
    allowIndexing: data.allow_indexing,
    expiresAt: data.expires_at,
    viewCount: data.view_count,
  };
}

export async function createOrUpdateShareLink(input: unknown): Promise<ActionResult<ShareState>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const features = await getSetting('features');
    if (!features.sharing_enabled) throw errors.notConfigured('Sharing');

    const parsed = shareSettingsSchema.parse(input);
    await enforce('share_create', user.id);

    const supabase = await supabaseServer();

    const { data: story } = await supabase
      .from('stories')
      .select('id, status, current_version_id')
      .eq('id', parsed.storyId)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!story) throw errors.notFound('Story');
    if (story.status !== 'ready') throw errors.validation('You can share a story once it is finished.');

    const expiresAt =
      parsed.expiresInDays > 0
        ? new Date(Date.now() + parsed.expiresInDays * 86_400_000).toISOString()
        : null;

    const { data: existing } = await supabase
      .from('share_links')
      .select('id, token')
      .eq('story_id', story.id)
      .eq('owner_id', user.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const patch = {
      is_enabled: true,
      allow_audio: parsed.allowAudio,
      allow_download: parsed.allowDownload,
      allow_indexing: parsed.allowIndexing,
      expires_at: expiresAt,
      version_id: story.current_version_id,
    };

    let token: string;
    if (existing) {
      token = existing.token;
      const { error } = await supabase.from('share_links').update(patch).eq('id', existing.id);
      if (error) throw errors.validation('We could not update the sharing settings.');
    } else {
      token = generateShareToken();
      const { error } = await supabase
        .from('share_links')
        .insert({ story_id: story.id, owner_id: user.id, token, ...patch });
      if (error) throw errors.validation('We could not create the share link.');
    }

    await capture({
      name: ANALYTICS_EVENTS.storyShared,
      ownerId: user.id,
      properties: { allow_audio: parsed.allowAudio, allow_download: parsed.allowDownload },
    });

    revalidatePath(`/library/${story.id}`);

    return {
      token,
      url: `${siteUrl()}/share/${token}`,
      isEnabled: true,
      allowAudio: parsed.allowAudio,
      allowDownload: parsed.allowDownload,
      allowIndexing: parsed.allowIndexing,
      expiresAt,
      viewCount: 0,
    };
  });
}

/**
 * Revokes a link permanently.
 *
 * The token is retired rather than disabled, so re-sharing later mints a
 * fresh one -- a revoked link can never come back to life for someone who
 * still has the old URL.
 */
export async function revokeShareLink(storyId: string): Promise<ActionResult<{ revoked: boolean }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const supabase = await supabaseServer();
    const { error } = await supabase
      .from('share_links')
      .update({ is_enabled: false, revoked_at: new Date().toISOString() })
      .eq('story_id', storyId)
      .eq('owner_id', user.id)
      .is('revoked_at', null);

    if (error) throw errors.validation('We could not revoke the link.');

    revalidatePath(`/library/${storyId}`);
    return { revoked: true };
  });
}
