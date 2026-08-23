'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Browser Supabase client.
 *
 * Only ever holds the anon key, which is safe to ship because every table
 * is protected by Row Level Security (§24). No AI provider key, no service
 * role key, and no direct model call ever happens on this side.
 */
let cached: SupabaseClient<Database> | null = null;

export function supabaseBrowser(): SupabaseClient<Database> {
  cached ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
