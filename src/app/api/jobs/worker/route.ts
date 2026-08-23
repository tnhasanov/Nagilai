import { NextResponse, type NextRequest } from 'next/server';
import { runWorker, kickWorker, shouldContinue } from '@/services/jobs/worker';
import { WORKER_DEFAULTS } from '@/config/constants';
import { safeEqual } from '@/lib/crypto';
import { createLogger, describeError } from '@/lib/logger';

/**
 * The background worker endpoint (§27).
 *
 * **Any scheduler may call this, and none of them is part of the
 * product.** The endpoint's contract is deliberately small enough that
 * every plausible trigger can satisfy it:
 *
 *   - **Vercel Cron** — `GET`, bearer token, configured in `vercel.json`.
 *   - **Supabase `pg_cron` + `pg_net`** — `POST` with an
 *     `Authorization` header, scheduled inside the same database that
 *     holds the queue. See `docs/OPERATIONS.md` for the SQL.
 *   - **GitHub Actions**, a container crontab, systemd timer, Cloudflare
 *     Worker, or `curl` in a loop — same call.
 *   - **An uptime pinger** that cannot set headers — `?token=` is
 *     accepted, but only when `CRON_ALLOW_QUERY_SECRET` is switched on,
 *     because a secret in a URL ends up in access logs.
 *   - **The app itself**, nudging inline after work is enqueued.
 *
 * Cadence does not matter. A run that ends with work still due wakes its
 * own successor, so the queue drains at its own pace; the scheduler only
 * decides how soon a *stalled* queue is noticed. Once a day is enough for
 * correctness, once a minute is nicer for a parent watching a progress
 * bar, and calling it fifty times a second is harmless because claiming
 * is atomic.
 *
 * `maxDuration` is set below Vercel's limit and the worker's own time
 * budget is lower again, so the loop always stops cleanly rather than
 * being killed part-way through a database write. A host with a longer
 * limit can raise both through the request body.
 */
const log = createLogger('api:worker');

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface WorkerRequestBody {
  source?: string;
  continuation?: number;
  maxJobs?: number;
  timeBudgetMs?: number;
  batchSize?: number;
}

export async function POST(request: NextRequest) {
  const unauthorised = authorise(request);
  if (unauthorised) return unauthorised;

  const body = await readBody(request);
  const continuation = clampInt(body.continuation, 0, WORKER_DEFAULTS.maxContinuations, 0);

  try {
    const report = await runWorker({
      workerId: workerId(request, body.source),
      maxJobs: clampInt(body.maxJobs, 1, 200, WORKER_DEFAULTS.maxJobs),
      // Capped at this host's function limit: a caller may ask for less
      // than the default, and only a host that genuinely allows longer
      // runs should raise `maxDuration` above.
      timeBudgetMs: clampInt(body.timeBudgetMs, 1_000, (maxDuration - 10) * 1000, WORKER_DEFAULTS.timeBudgetMs),
      batchSize: clampInt(body.batchSize, 1, 16, WORKER_DEFAULTS.batchSize),
    });

    // This is what makes the scheduler's cadence irrelevant. Fired after
    // the run rather than awaited, so the response returns immediately.
    const continued = shouldContinue(report, continuation);
    if (continued) {
      kickWorker({ reason: 'continuation', continuation: continuation + 1 });
    }

    return NextResponse.json({ ...report, continuation, continued });
  } catch (error) {
    log.error('worker run failed', describeError(error));
    return NextResponse.json({ error: 'worker_failed' }, { status: 500 });
  }
}

/**
 * Most schedulers issue a plain GET. Same work, and the tuning knobs move
 * to the query string so a GET-only trigger is not second-class.
 */
export async function GET(request: NextRequest) {
  const unauthorised = authorise(request);
  if (unauthorised) return unauthorised;

  const params = request.nextUrl.searchParams;
  const forwarded = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({
      source: params.get('source') ?? 'scheduled',
      continuation: numberParam(params.get('continuation')),
      maxJobs: numberParam(params.get('maxJobs')),
      timeBudgetMs: numberParam(params.get('timeBudgetMs')),
      batchSize: numberParam(params.get('batchSize')),
    }),
  });

  return POST(forwarded as unknown as NextRequest);
}

async function readBody(request: NextRequest): Promise<WorkerRequestBody> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as WorkerRequestBody) : {};
  } catch {
    // A scheduler that sends no body at all is the common case.
    return {};
  }
}

function numberParam(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * A stable-ish identity for the run, recorded on each claimed row so an
 * operator can tell which invocation is holding a job.
 *
 * Names the trigger rather than the host, because the host is not the
 * interesting part and hard-coding one ("vercel-…") makes the rows lie
 * the moment the scheduler changes.
 */
function workerId(request: NextRequest, source: string | undefined): string {
  const trigger = (source ?? request.headers.get('x-worker-source') ?? 'scheduled')
    .replace(/[^a-z0-9-]/gi, '')
    .slice(0, 24)
    .toLowerCase();
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${trigger || 'scheduled'}-${suffix}`;
}

/**
 * Accepts the shared secret in whichever way the caller can send it.
 *
 * Comparison is constant-time in every branch. The query-string form is
 * off unless explicitly enabled, because a secret in a URL is a secret in
 * an access log.
 */
function authorise(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Refuse rather than run unauthenticated: this endpoint spends money.
    log.error('CRON_SECRET is not configured; refusing to run the worker');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  const candidates = [
    header.startsWith('Bearer ') ? header.slice(7) : '',
    // Some schedulers reserve `Authorization` for their own use.
    request.headers.get('x-cron-secret') ?? '',
  ];

  if (process.env.CRON_ALLOW_QUERY_SECRET === 'true') {
    candidates.push(request.nextUrl.searchParams.get('token') ?? '');
  }

  for (const candidate of candidates) {
    if (candidate && safeEqual(candidate, secret)) return null;
  }

  return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
}
