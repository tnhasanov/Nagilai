import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { supabaseServer } from './server';

/**
 * A Supabase client that acts as a specific signed-in user.
 *
 * Two things produce one: a browser cookie session (the web app) and a
 * bearer token (the mobile app). Both go through Row Level Security, so
 * the feature layer can take either and does not need to know which.
 *
 * This is the seam that lets one set of queries serve both clients. The
 * alternative -- a parallel mobile data layer -- would mean two places to
 * get an ownership check wrong.
 */
export type UserClient = SupabaseClient<Database>;

/**
 * Client authenticated by an access token rather than a cookie.
 *
 * The token is attached as an `Authorization` header, so PostgREST sees
 * the same JWT claims it would from a browser session and `auth.uid()`
 * resolves identically. No session is persisted: each request is
 * independent.
 */
export function supabaseWithToken(accessToken: string): UserClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Client-Info': 'nagilai-mobile',
        },
      },
    },
  );
}

/** The bearer client when a token is supplied, otherwise the cookie one. */
export async function resolveUserClient(accessToken?: string | null): Promise<UserClient> {
  return accessToken ? supabaseWithToken(accessToken) : supabaseServer();
}
