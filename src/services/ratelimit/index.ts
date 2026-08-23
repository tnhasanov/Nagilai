import 'server-only';

import { errors } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getSetting } from '@/services/config/settings';

/**
 * Rate limiting (§17, §24).
 *
 * Backed by a Postgres fixed-window counter, which needs no extra
 * infrastructure on Vercel. Swapping in Redis later means reimplementing
 * `consume` alone -- call sites do not change.
 *
 * Fails open on a database error: a limiter outage must not stop a paying
 * customer from making a book, and the expensive downstream operations
 * have their own credit checks.
 */
const log = createLogger('ratelimit');

export type RateLimitBucket =
  | 'story_create'
  | 'illustration'
  | 'narration'
  | 'pdf'
  | 'share_create'
  | 'auth';

export interface RateLimitOutcome {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function consume(bucket: RateLimitBucket, subject: string): Promise<RateLimitOutcome> {
  const config = (await getSetting('rate_limits'))[bucket];

  try {
    const { data, error } = await supabaseAdmin().rpc('consume_rate_limit', {
      p_bucket: bucket,
      p_subject: subject,
      p_limit: config.limit,
      p_window_seconds: config.window_seconds,
    });

    if (error) throw error;

    const remaining = typeof data === 'number' ? data : 0;
    return {
      allowed: remaining >= 0,
      remaining: Math.max(0, remaining),
      retryAfterSeconds: config.window_seconds,
    };
  } catch (error) {
    log.warn('rate limiter unavailable, allowing request', { bucket, error: String(error) });
    return { allowed: true, remaining: config.limit, retryAfterSeconds: 0 };
  }
}

/** Consumes a slot and throws a friendly error when the budget is spent. */
export async function enforce(bucket: RateLimitBucket, subject: string): Promise<void> {
  const outcome = await consume(bucket, subject);
  if (!outcome.allowed) {
    throw errors.rateLimited(outcome.retryAfterSeconds);
  }
}
