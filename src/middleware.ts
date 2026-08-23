import type { NextRequest } from 'next/server';
import { updateSession } from '@/services/supabase/session';

/**
 * Session refresh and auth redirects, in front of the private pages.
 *
 * **Deliberately named `middleware.ts`, not `proxy.ts`.** Next.js 16
 * renamed this convention to "proxy", and this repository briefly
 * followed the rename — which took the whole deployment down. The build
 * succeeded, the route table listed `ƒ Proxy (Middleware)`, and every
 * matched path then returned Vercel's platform `NOT_FOUND`: the hosting
 * builder predates the rename, so its router pointed matched requests at
 * a function it never registered. The old filename is still supported by
 * Next 16 and understood by every deployment platform, which for a file
 * that runs in front of pages is worth more than being current. Revisit
 * only when the deploy target's tooling demonstrably understands `proxy`.
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
 *     the entire site.** If the platform cannot wire the file into its
 *     routing output, every matched path fails. With a catch-all, that is
 *     every page. With this list, the marketing site and the API stay up
 *     regardless.
 *
 * Safe to keep narrow because this is not the security boundary and never
 * was: every private page calls `getCurrentUser()` and redirects on its
 * own, and Row Level Security refuses the data underneath either way.
 * This file exists to make the redirect fast, not to make it correct.
 *
 * `tests/middleware.test.ts` fails if a prefix is added to the handler
 * without being added here.
 */
export async function middleware(request: NextRequest) {
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
