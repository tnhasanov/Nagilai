import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Request-scoped Supabase client that acts as the signed-in user.
 *
 * Everything this client touches goes through RLS, which is the point: a
 * bug in a query cannot return another family's rows. Use
 * `supabaseAdmin()` only for work that legitimately spans users.
 */
export async function supabaseServer(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session instead, so this is safe
            // to ignore rather than crash the render.
          }
        },
      },
    },
  );
}

export interface AuthenticatedContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  email: string;
}

/** Returns the signed-in user, or null when there is no valid session. */
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}
