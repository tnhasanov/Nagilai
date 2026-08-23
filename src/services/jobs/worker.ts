import 'server-only';

import { createLogger, describeError } from '@/lib/logger';
import { toAppError } from '@/lib/errors';
import * as queue from './queue';
import { handleStoryText } from './handlers/story-text';
import { handleIllustration } from './handlers/illustration';
import { handleNarration } from './handlers/narration';
import { handlePdf } from './handlers/pdf';
import { notifyStoryReady } from '@/services/notifications';
import { siteUrl } from '@/config/env';
import { WORKER_DEFAULTS } from '@/config/constants';
import type { GenerationJob } from '@/types/domain';
import type { JobType } from '@/types/database';

/**
 * The job worker (§27).
 *
 * **The scheduler is a doorbell, not a component.** Nothing in this file
 * knows or cares what woke it: Vercel Cron, Supabase `pg_cron` calling
 * `net.http_post`, a GitHub Actions schedule, a container's own crontab,
 * an uptime pinger, or an operator pressing a button in the admin area.
 * All of them do exactly one thing -- call the endpoint -- and the
 * behaviour of the queue is identical either way.
 *
 * Three properties make that true, and they are worth stating because
 * each one is a thing that would otherwise become a cadence assumption:
 *
 *  1. **Claiming is atomic.** `claim_generation_jobs` uses `FOR UPDATE
 *     SKIP LOCKED`, so two schedulers firing at the same instant, or
 *     fifty, produce no duplicate work.
 *  2. **The worker chains itself.** When the run stops with work still
 *     due, it wakes itself again. A queue therefore drains at its own
 *     pace rather than at the scheduler's -- the difference between a
 *     once-a-minute tick and a once-a-day tick is when a book *starts*,
 *     never whether it finishes.
 *  3. **Nothing is lost if a tick is missed.** Stalled jobs are reaped by
 *     wall-clock age, and retries are scheduled by `run_after` timestamp.
 *     Both are absolute times, not tick counts.
 *
 * The loop is bounded by a job count and a wall-clock budget because a
 * serverless invocation has a hard timeout. Both are arguments, so a host
 * that can run for ten minutes is not held to Vercel's sixty seconds.
 */
const log = createLogger('jobs:worker');

const HANDLERS: Record<JobType, (job: GenerationJob) => Promise<Record<string, unknown> | void>> = {
  story_text: handleStoryText,
  story_illustration: handleIllustration,
  story_cover: handleIllustration,
  story_narration: handleNarration,
  story_pdf: handlePdf,
  print_submission: async () => {
    // Phase 3. The manual print provider queues orders for the admin
    // fulfilment list rather than calling an external API.
    log.info('print_submission is handled manually in the current phase');
  },
};

/**
 * Job types whose completion could mean the book is now finished.
 *
 * Narration and PDF are on-demand extras that do not change whether a
 * story is readable, so finishing one is not news.
 */
const NOTIFYING_JOB_TYPES = new Set<JobType>(['story_text', 'story_illustration', 'story_cover']);

export interface WorkerOptions {
  workerId: string;
  maxJobs?: number;
  timeBudgetMs?: number;
  types?: JobType[];
  batchSize?: number;
}

export interface WorkerReport {
  claimed: number;
  succeeded: number;
  failed: number;
  reaped: number;
  durationMs: number;
  /** Jobs still queued and due when this run stopped. */
  dueRemaining: number;
  /** Jobs queued at all, including ones backing off after a failure. */
  queuedRemaining: number;
  /** Why the loop stopped: useful when diagnosing a queue that lags. */
  stoppedBecause: 'drained' | 'job-limit' | 'time-limit';
}

export async function runWorker(options: WorkerOptions): Promise<WorkerReport> {
  const startedAt = Date.now();
  const maxJobs = options.maxJobs ?? WORKER_DEFAULTS.maxJobs;
  const timeBudget = options.timeBudgetMs ?? WORKER_DEFAULTS.timeBudgetMs;
  const batchSize = options.batchSize ?? WORKER_DEFAULTS.batchSize;

  const reaped = await queue.reapStalled();

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let stoppedBecause: WorkerReport['stoppedBecause'] = 'drained';

  for (;;) {
    if (claimed >= maxJobs) {
      stoppedBecause = 'job-limit';
      break;
    }
    if (Date.now() - startedAt >= timeBudget) {
      stoppedBecause = 'time-limit';
      break;
    }

    const remaining = Math.min(batchSize, maxJobs - claimed);
    const jobs = await queue.claim(remaining, options.workerId, options.types);
    if (jobs.length === 0) {
      stoppedBecause = 'drained';
      break;
    }

    claimed += jobs.length;

    // Jobs in a batch are independent (different pages, different
    // stories), so running them concurrently is what makes a ten-page
    // book illustrate in parallel rather than in series.
    const outcomes = await Promise.allSettled(jobs.map((job) => runOne(job)));
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled' && outcome.value) succeeded += 1;
      else failed += 1;
    }
  }

  const remaining = await queue.pending();

  const report: WorkerReport = {
    claimed,
    succeeded,
    failed,
    reaped,
    durationMs: Date.now() - startedAt,
    dueRemaining: remaining.due,
    queuedRemaining: remaining.total,
    stoppedBecause,
  };

  if (claimed > 0 || reaped > 0) log.info('worker finished', { ...report });
  return report;
}

async function runOne(job: GenerationJob): Promise<boolean> {
  const handler = HANDLERS[job.type];

  try {
    const result = await handler(job);
    await queue.complete(job.id, result ?? {});

    // A finished book is the one thing a parent is actually waiting for,
    // so it is also the one thing worth interrupting them about.
    //
    // Fired after every job that could have been the last one rather than
    // from a single "the story is done" moment, because there is no such
    // moment: eleven illustration jobs finish independently and out of
    // order. `notifyStoryReady` re-reads the *derived* status and dedupes
    // on a key, so calling it twelve times sends at most one notification.
    if (job.story_id && job.owner_id && NOTIFYING_JOB_TYPES.has(job.type)) {
      await notifyStoryReady({ ownerId: job.owner_id, storyId: job.story_id }).catch((error: unknown) => {
        log.warn('story-ready notification failed', describeError(error));
      });
    }
    return true;
  } catch (error) {
    const appError = toAppError(error);
    log.error('job handler threw', {
      jobId: job.id,
      type: job.type,
      code: appError.code,
      ...describeError(error),
    });
    await queue.fail(job, appError);
    return false;
  }
}

/**
 * Wakes the worker endpoint over HTTP, without waiting for it.
 *
 * Used in two places: right after work is enqueued, so the first page
 * appears in seconds rather than at the next tick; and by the worker
 * itself when a run ends with jobs still due, which is what decouples the
 * queue from the scheduler's cadence.
 *
 * Deliberately not awaited: a parent pressing "Create" should get their
 * redirect immediately. Failure here is harmless as long as *some*
 * scheduler exists -- which is why `docs/OPERATIONS.md` insists on one.
 */
export function kickWorker(options: { reason?: string; continuation?: number } = {}): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Without a secret the endpoint refuses to run at all, so a nudge
    // would only produce a 503. Say so once rather than failing quietly:
    // an install with no CRON_SECRET and no scheduler generates nothing.
    log.warn('CRON_SECRET is not set, so the worker cannot be woken over HTTP');
    return;
  }

  const url = `${siteUrl()}/api/jobs/worker`;
  void fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: options.reason ?? 'inline-kick',
      continuation: options.continuation ?? 0,
    }),
    // Never let the nudge hold the request open.
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    /* whatever scheduler exists will pick the work up */
  });
}

/**
 * Decides whether a finished run should wake itself again.
 *
 * Bounded, so a permanently-failing job cannot produce an endless chain of
 * invocations: past the limit the run simply ends and the next scheduler
 * tick -- whenever that is -- picks the work up. Nothing is lost either
 * way, the queue is durable.
 */
export function shouldContinue(report: WorkerReport, continuation: number): boolean {
  if (report.dueRemaining <= 0) return false;
  if (continuation >= WORKER_DEFAULTS.maxContinuations) return false;
  // A run that claimed nothing but still reports due work means every
  // remaining job is locked by another worker. Chaining would spin.
  return report.claimed > 0;
}
