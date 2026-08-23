import type { NextRequest } from 'next/server';
import { updateSession } from '@/services/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. The share route is
     * deliberately included so an anonymous visitor still gets a refreshed
     * session if they happen to be signed in.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
