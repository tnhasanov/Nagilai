import { NextResponse, type NextRequest } from 'next/server';
import { runWorker } from '@/services/jobs/worker';
import { safeEqual } from '@/lib/crypto';
import { createLogger, describeError } from '@/lib/logger';

/**
 * The background worker endpoint (§27).
 *
 * Invoked two ways, both authenticated with the same shared secret:
 *   - Vercel Cron, every minute (see vercel.json)
 *   - an inline nudge right after work is enqueued, so the first page
 *     appears in seconds rather than at the next tick
 *
 * `maxDuration` is set below Vercel's limit and the worker's own time
 * budget is lower again, so the loop always stops cleanly rather than
 * being killed part-way through a database write.
 */
const log = createLogger('api:worker');

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const unauthorised = authorise(request);
  if (unauthorised) return unauthorised;

  try {
    const report = await runWorker({
      workerId: `vercel-${Math.random().toString(36).slice(2, 8)}`,
      maxJobs: 12,
      timeBudgetMs: 45_000,
      batchSize: 3,
    });
    return NextResponse.json(report);
  } catch (error) {
    log.error('worker run failed', describeError(error));
    return NextResponse.json({ error: 'worker_failed' }, { status: 500 });
  }
}

/** Vercel Cron issues GET requests. */
export async function GET(request: NextRequest) {
  return POST(request);
}

function authorise(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Refuse rather than run unauthenticated: this endpoint spends money.
    log.error('CRON_SECRET is not configured; refusing to run the worker');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  return null;
}
