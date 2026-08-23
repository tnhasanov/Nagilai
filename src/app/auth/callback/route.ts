import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/services/supabase/server';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS } from '@/config/constants';
import { createLogger } from '@/lib/logger';

/**
 * OAuth and email-link callback (§22).
 *
 * Exchanges the one-time code for a session and then redirects. The
 * `next` parameter is validated as a *relative path* before use — an
 * unchecked redirect target here would be an open-redirect handed to
 * anyone who can craft a sign-in link.
 */
const log = createLogger('auth:callback');

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeRedirectPath(url.searchParams.get('next'));
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    log.warn('code exchange failed', { message: error.message });
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  if (data.user) {
    // `created_at === last_sign_in_at` is how a first sign-in is
    // recognised without keeping a separate flag.
    const isNew =
      data.user.created_at &&
      data.user.last_sign_in_at &&
      Math.abs(Date.parse(data.user.created_at) - Date.parse(data.user.last_sign_in_at)) < 5000;

    if (isNew) {
      await capture({ name: ANALYTICS_EVENTS.signupCompleted, ownerId: data.user.id });
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/** Only same-site absolute paths are accepted. */
function safeRedirectPath(candidate: string | null): string {
  if (!candidate) return '/library';
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/library';
  return candidate;
}
