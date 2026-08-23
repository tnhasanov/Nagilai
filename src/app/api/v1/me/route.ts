import { authenticated, body, preflight } from '@/services/api/handler';
import {
  profileInputSchema,
  updateProfile,
  getNotificationPreferences,
} from '@/features/account/operations';

/**
 * The signed-in parent: identity, locale and credit balance.
 *
 * The first call a native client makes after sign-in, and what it polls
 * to keep the credit chip in the header honest.
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const GET = authenticated(async ({ actor }) => {
  const { data, error } = await actor.db
    .from('profiles')
    .select('id, email, display_name, avatar_url, ui_locale, credit_balance, role, created_at')
    .eq('id', actor.userId)
    .maybeSingle();

  if (error || !data) {
    // The row is created by a database trigger on sign-up; if it is not
    // there yet the client should retry rather than treat it as fatal.
    return { profile: null, ready: false };
  }

  return {
    ready: true,
    profile: {
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      uiLocale: data.ui_locale,
      creditBalance: data.credit_balance,
      isStaff: data.role === 'admin' || data.role === 'support',
      createdAt: data.created_at,
    },
    // Sent with the profile because the app needs it on the same screen
    // and a second round trip on launch is a second chance to be slow.
    notifications: await getNotificationPreferences(actor.userId, actor.db),
  };
});

/**
 * Updates the parent's own profile: display name, interface language,
 * marketing opt-in.
 *
 * Interface language is *not* story language. A parent may read the app
 * in Azerbaijani and make a book in Russian; this endpoint changes the
 * first and never touches the second.
 *
 * The privileged columns (role, credit balance, email) are pinned by a
 * database trigger, so even a bug here cannot promote an account.
 */
export const PATCH = authenticated(async ({ actor, request }) => {
  const input = await body(request, profileInputSchema);
  return updateProfile(actor.userId, input, actor.db);
});
