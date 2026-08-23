import 'server-only';

import { errors } from '@/lib/errors';
import { supabaseWithToken, type UserClient } from '@/services/supabase/user-client';

/**
 * Bearer-token authentication for the mobile API.
 *
 * The native app signs in with the Supabase SDK directly and holds a JWT.
 * This verifies that token with Supabase on every request rather than
 * decoding it locally: a locally-decoded JWT cannot detect a revoked
 * session, a deleted account or a signed-out device, and this is a
 * product where "the parent deleted their account" has to take effect
 * immediately.
 */
export interface ApiActor {
  userId: string;
  email: string;
  /** Scoped to this user, so RLS applies exactly as it does on the web. */
  db: UserClient;
  accessToken: string;
}

export async function authenticate(request: Request): Promise<ApiActor> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token) throw errors.unauthenticated('Missing bearer token');

  const db = supabaseWithToken(token);
  const { data, error } = await db.auth.getUser(token);

  if (error || !data.user) {
    throw errors.unauthenticated('Invalid or expired token');
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? '',
    db,
    accessToken: token,
  };
}
