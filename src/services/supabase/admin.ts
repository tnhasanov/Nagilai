import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/config/env';
import type { Database } from '@/types/database';

/**
 * Service-role Supabase client. **Bypasses Row Level Security.**
 *
 * Reserved for work that genuinely cannot be done as the user:
 *   - background jobs writing generated pages, images and audio
 *   - minting signed URLs for private storage objects
 *   - the credit ledger and usage/cost tracking
 *   - admin aggregates and webhook handlers
 *
 * Every call site must have already established *who* the work is for and
 * must scope its queries by that owner id by hand -- the database will not
 * do it for you here.
 */
let cached: SupabaseClient<Database> | null = null;

export function supabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached;

  const env = serverEnv();
  cached = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'X-Client-Info': 'nagilai-server' } },
    },
  );
  return cached;
}
