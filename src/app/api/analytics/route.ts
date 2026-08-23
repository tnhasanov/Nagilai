import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { capture } from '@/services/analytics';
import { getCurrentUser } from '@/services/supabase/server';
import { ANALYTICS_EVENTS, type AnalyticsEventName } from '@/config/constants';

/**
 * Client-side analytics intake (§19).
 *
 * Only the event names the product actually defines are accepted, so this
 * cannot be used as an open write endpoint into our own tables. Property
 * values are sanitised again inside `capture`, which drops anything that
 * could carry a child's personal information.
 */
export const dynamic = 'force-dynamic';

const VALID_EVENTS = new Set<string>(Object.values(ANALYTICS_EVENTS));

const bodySchema = z.object({
  name: z.string().max(64),
  properties: z.record(z.string(), z.unknown()).optional(),
  anonymousId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
  url: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success || !VALID_EVENTS.has(parsed.data.name)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const user = await getCurrentUser();

  await capture({
    name: parsed.data.name as AnalyticsEventName,
    ownerId: user?.id ?? null,
    anonymousId: parsed.data.anonymousId ?? null,
    sessionId: parsed.data.sessionId ?? null,
    properties: parsed.data.properties ?? {},
    url: parsed.data.url ?? null,
    referrer: request.headers.get('referer'),
  });

  return NextResponse.json({ ok: true });
}
