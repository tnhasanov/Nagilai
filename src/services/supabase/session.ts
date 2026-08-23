import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

/**
 * Refreshes the Supabase session cookie on every request and gates the
 * private areas of the app.
 *
 * Middleware is a first line of defence for routing, not the security
 * boundary: RLS in the database is. A request that slips past this still
 * cannot read another family's data.
 */
/**
 * Exported so `tests/middleware.test.ts` can check that `src/middleware.ts`'s
 * matcher covers every one of them. Next requires that matcher to be a
 * static literal, so the two lists cannot be derived from each other — and
 * a prefix added here but forgotten there is a redirect that silently
 * stops happening.
 */
export const PRIVATE_PREFIXES = [
  '/dashboard',
  '/children',
  '/create',
  '/library',
  '/settings',
  '/admin',
] as const;

export const AUTH_PREFIXES = ['/login', '/signup', '/forgot-password'] as const;

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be called to refresh an expiring token before the page renders.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(redirectUrl);
  }

  if (user && AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/library';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
