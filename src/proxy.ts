import type { NextRequest } from 'next/server';
import { updateSession } from '@/services/supabase/session';

/**
 * Next.js 16 renamed middleware to "proxy". Same thing, same place.
 *
 * The matcher below is deliberately a short list of the paths this
 * actually acts on, rather than "everything except static assets".
 *
 * Two reasons, and the second one cost a day:
 *
 *  1. **It is wasteful otherwise.** The handler makes a network call to
 *     Supabase to refresh the session. Under a catch-all matcher, every
 *     request for `/`, `/pricing`, `/about`, `/robots.txt` and
 *     `/sitemap.xml` paid for that before rendering — on pages where
 *     nobody is signed in and nothing uses the result.
 *
 *  2. **A catch-all matcher makes this file a single point of failure for
 *     the entire site.** If the platform cannot wire the proxy into its
 *     routing output — which is a live risk while hosts catch up with the
 *     rename — then every matched path fails. With a catch-all, that is
 *     every page. With this list, the marketing site and the API stay up
 *     regardless.
 *
 * Safe to narrow because this is not the security boundary and never was:
 * every private page calls `getCurrentUser()` and redirects on its own,
 * and Row Level Security refuses the data underneath either way. The
 * proxy exists to make the redirect fast, not to make it correct.
 *
 * `tests/proxy.test.ts` fails if a prefix is added to the handler without
 * being added here.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /*
   * Must stay in sync with PRIVATE_PREFIXES and AUTH_PREFIXES in
   * `services/supabase/session.ts`. Next requires this to be a literal,
   * so it cannot be derived from them — a test enforces it instead.
   *
   * Each private area is listed twice because `:path*` matching of the
   * bare prefix is not worth relying on across versions.
   */
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/children',
    '/children/:path*',
    '/create',
    '/create/:path*',
    '/library',
    '/library/:path*',
    '/settings',
    '/settings/:path*',
    '/admin',
    '/admin/:path*',
    '/login',
    '/signup',
    '/forgot-password',
  ],
};
