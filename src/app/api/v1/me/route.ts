import { authenticated, preflight } from '@/services/api/handler';

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
  };
});
