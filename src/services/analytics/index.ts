import 'server-only';

import { createLogger } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import type { AnalyticsEventName } from '@/config/constants';

/**
 * Product analytics (§19).
 *
 * Events are written to our own `analytics_events` table first and
 * forwarded to a provider second. Two reasons: the funnel survives ad
 * blockers and consent refusals, and swapping PostHog for GA4 or anything
 * else does not lose history.
 *
 * Capture never throws. An analytics outage must not break a story.
 */
const log = createLogger('analytics');

export interface CaptureInput {
  name: AnalyticsEventName;
  ownerId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  properties?: Record<string, unknown>;
  url?: string | null;
  referrer?: string | null;
}

export async function capture(input: CaptureInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from('analytics_events')
      .insert({
        owner_id: input.ownerId ?? null,
        anonymous_id: input.anonymousId ?? null,
        session_id: input.sessionId ?? null,
        name: input.name,
        properties: sanitise(input.properties ?? {}),
        url: input.url ?? null,
        referrer: input.referrer ?? null,
      });
    if (error) throw error;
  } catch (error) {
    log.warn('analytics capture failed', { name: input.name, error: String(error) });
  }

  void forward(input);
}

/**
 * Ships an event to the configured provider. Implemented over plain
 * `fetch` rather than an SDK so the provider is a URL and a key, not a
 * dependency -- which is what "PostHog-ready abstraction" means in §25.
 */
async function forward(input: CaptureInput): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

  try {
    await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: input.name,
        distinct_id: input.ownerId ?? input.anonymousId ?? 'anonymous',
        properties: { ...sanitise(input.properties ?? {}), $current_url: input.url ?? undefined },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    log.debug('analytics forward failed', { name: input.name, error: String(error) });
  }
}

/**
 * Analytics must never carry a child's personal information off-platform
 * (§24, §31). Only scalars survive, and known-sensitive keys are dropped
 * outright.
 */
const FORBIDDEN_KEYS = new Set([
  'child_name',
  'childName',
  'name',
  'nickname',
  'parent_notes',
  'email',
  'appearance_description',
  'custom_instructions',
  'text',
]);

function sanitise(properties: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
  }
  return out;
}
