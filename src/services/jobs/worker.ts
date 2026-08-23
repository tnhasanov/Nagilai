import 'server-only';

import { createLogger, describeError } from '@/lib/logger';
import { toAppError } from '@/lib/errors';
import * as queue from './queue';
import { handleStoryText } from './handlers/story-text';
import { handleIllustration } from './handlers/illustration';
import { handleNarration } from './handlers/narration';
import { handlePdf } from './handlers/pdf';
import { siteUrl } from '@/config/env';
import type { GenerationJob } from '@/types/domain';
import type { JobType } from '@/types/database';

/**
 * The job worker (§27).
 *
 * Runs in three situations, all of them the same code path:
 *   1. a Vercel cron tick, every minute
 *   2. an inline "kick" immediately after something is enqueued, so the
 *      first page appears in seconds rather than at the next tick
 *   3. an operator retrying a single job from the admin area
 *
 * The loop is bounded by both a job count and a wall-clock budget, because
 * a serverless invocation has a hard timeout: it is better to finish the
 * jobs in hand cleanly and let the next tick pick up the rest than to be
 * killed mid-write.
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
}

export async function runWorker(options: WorkerOptions): Promise<WorkerReport> {
  const startedAt = Date.now();
  const maxJobs = options.maxJobs ?? 12;
  const timeBudget = options.timeBudgetMs ?? 50_000;
  const batchSize = options.batchSize ?? 3;

  const reaped = await queue.reapStalled();

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;

  while (claimed < maxJobs && Date.now() - startedAt < timeBudget) {
    const remaining = Math.min(batchSize, maxJobs - claimed);
    const jobs = await queue.claim(remaining, options.workerId, options.types);
    if (jobs.length === 0) break;

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

  const report = { claimed, succeeded, failed, reaped, durationMs: Date.now() - startedAt };
  if (claimed > 0 || reaped > 0) log.info('worker finished', report);
  return report;
}

async function runOne(job: GenerationJob): Promise<boolean> {
  const handler = HANDLERS[job.type];

  try {
    const result = await handler(job);
    await queue.complete(job.id, result ?? {});
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
 * Fire-and-forget nudge to the worker endpoint.
 *
 * Deliberately not awaited by callers: a parent pressing "Create" should
 * get their redirect immediately, and the generation happens behind the
 * progress screen. Failure here is harmless -- the cron tick is the
 * backstop.
 */
export function kickWorker(): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;

  const url = `${siteUrl()}/api/jobs/worker`;
  void fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'inline-kick' }),
    // Never let the nudge hold the request open.
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    /* the cron tick will pick the work up */
  });
}
