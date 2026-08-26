import 'server-only';

import { AppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import type { GenerationJob } from '@/types/domain';
import type { Json, JobType } from '@/types/database';

/**
 * The generation job queue (§27).
 *
 * Postgres-backed rather than an external broker, deliberately:
 *
 *  - it is transactional with the rows the jobs are about, so a story and
 *    its first job are enqueued atomically;
 *  - `FOR UPDATE SKIP LOCKED` gives correct multi-worker semantics;
 *  - it works on Vercel with nothing to provision.
 *
 * If throughput ever outgrows this, `claim`/`complete`/`fail` are the only
 * three functions an external queue would need to replace.
 */
const log = createLogger('jobs:queue');

export interface EnqueueInput {
  type: JobType;
  ownerId: string;
  storyId?: string | null;
  versionId?: string | null;
  pageId?: string | null;
  payload?: Record<string, unknown>;
  priority?: number;
  runAfter?: Date;
  /**
   * Stable key derived from the work itself. Enqueueing the same unit of
   * work twice is a no-op, which is what makes retries and double-clicks
   * safe (§17: "safeguards against accidental repeated generation").
   */
  idempotencyKey: string;
}

export async function enqueue(input: EnqueueInput): Promise<GenerationJob | null> {
  const { data, error } = await supabaseAdmin()
    .from('generation_jobs')
    .upsert(
      {
        type: input.type,
        owner_id: input.ownerId,
        story_id: input.storyId ?? null,
        version_id: input.versionId ?? null,
        page_id: input.pageId ?? null,
        payload: (input.payload ?? {}) as Json,
        priority: input.priority ?? 100,
        run_after: (input.runAfter ?? new Date()).toISOString(),
        idempotency_key: input.idempotencyKey,
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();

  if (error) {
    throw new AppError('internal', `Could not enqueue ${input.type}: ${error.message}`);
  }

  if (data) {
    log.info('job enqueued', { type: input.type, jobId: data.id, storyId: input.storyId });
  }
  return data;
}

export async function enqueueMany(inputs: readonly EnqueueInput[]): Promise<void> {
  if (inputs.length === 0) return;

  const { error } = await supabaseAdmin()
    .from('generation_jobs')
    .upsert(
      inputs.map((input) => ({
        type: input.type,
        owner_id: input.ownerId,
        story_id: input.storyId ?? null,
        version_id: input.versionId ?? null,
        page_id: input.pageId ?? null,
        payload: (input.payload ?? {}) as Json,
        priority: input.priority ?? 100,
        run_after: (input.runAfter ?? new Date()).toISOString(),
        idempotency_key: input.idempotencyKey,
      })),
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );

  if (error) throw new AppError('internal', `Could not enqueue jobs: ${error.message}`);
  log.info('jobs enqueued', { count: inputs.length, type: inputs[0]?.type });
}

export async function claim(limit: number, workerId: string, types?: JobType[]): Promise<GenerationJob[]> {
  const { data, error } = await supabaseAdmin().rpc('claim_generation_jobs', {
    p_limit: limit,
    p_worker: workerId,
    p_types: types ?? null,
  });

  if (error) throw new AppError('internal', `Could not claim jobs: ${error.message}`);
  return (data ?? []) as GenerationJob[];
}

/**
 * How much work is waiting right now.
 *
 * The worker uses this to decide whether to wake itself again rather than
 * waiting for the next scheduler tick. That is what makes the scheduler's
 * *cadence* irrelevant: whether a tick arrives every minute or once a day,
 * a queue with work in it drains continuously once something starts it.
 *
 * `head` counts only jobs that are due now -- a job backing off after a
 * failure is pending but not runnable, and chaining the worker for it
 * would spin.
 */
export async function pending(): Promise<{ total: number; due: number }> {
  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const [total, due] = await Promise.all([
    admin.from('generation_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    admin
      .from('generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued')
      .lte('run_after', nowIso),
  ]);

  if (total.error || due.error) {
    log.error('could not count pending jobs', {
      error: (total.error ?? due.error)?.message ?? 'unknown',
    });
    return { total: 0, due: 0 };
  }

  return { total: total.count ?? 0, due: due.count ?? 0 };
}

export async function complete(jobId: string, result?: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('generation_jobs')
    .update({
      status: 'succeeded',
      result: (result ?? {}) as Json,
      finished_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      error_message: null,
    })
    .eq('id', jobId);

  if (error) log.error('could not mark job complete', { jobId, error: error.message });
}

/**
 * Whether a failure ends the job here, rather than earning another try.
 *
 * The handlers need this *before* `fail` runs, because refunding is their
 * job and paying a parent back twice is worse than not paying them back
 * at all. It answers the same question `fail` does, from the same two
 * facts: an error the AppError layer marked non-retryable, or a job that
 * has used its attempts.
 */
export function isPermanentFailure(job: GenerationJob, error: unknown): boolean {
  const retryable = error instanceof AppError ? error.retryable : true;
  return !retryable || job.attempts >= job.max_attempts;
}

/**
 * Records a failure and decides whether to retry.
 *
 * Backoff is exponential from 30 seconds. A job that exhausts its attempts
 * becomes `dead_letter` rather than disappearing, so the admin area can
 * show it and an operator can requeue it (§32).
 */
export async function fail(
  job: GenerationJob,
  error: unknown,
  options: { retryable?: boolean } = {},
): Promise<{ willRetry: boolean }> {
  const appError = error instanceof AppError ? error : null;
  const retryable = options.retryable ?? appError?.retryable ?? true;
  const willRetry = retryable && job.attempts < job.max_attempts;

  const backoffSeconds = 30 * 2 ** Math.min(job.attempts, 6);

  const { error: updateError } = await supabaseAdmin()
    .from('generation_jobs')
    .update({
      status: willRetry ? 'queued' : job.attempts >= job.max_attempts ? 'dead_letter' : 'failed',
      error_message: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
      error_detail: (appError ? { code: appError.code, details: appError.details ?? null } : null) as Json,
      run_after: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
      locked_at: null,
      locked_by: null,
      ...(willRetry ? {} : { finished_at: new Date().toISOString() }),
    })
    .eq('id', job.id);

  if (updateError) log.error('could not mark job failed', { jobId: job.id, error: updateError.message });

  log.warn('job failed', {
    jobId: job.id,
    type: job.type,
    attempts: job.attempts,
    willRetry,
    message: error instanceof Error ? error.message : String(error),
  });

  return { willRetry };
}

/** Requeues a dead-lettered or failed job from the admin area. */
export async function requeue(jobId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('generation_jobs')
    .update({
      status: 'queued',
      attempts: 0,
      run_after: new Date().toISOString(),
      error_message: null,
      error_detail: null,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId);

  if (error) throw new AppError('internal', `Could not requeue job: ${error.message}`);
}

export async function reapStalled(): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('reap_stalled_jobs', { p_stale_after: '10 minutes' });
  if (error) {
    log.error('could not reap stalled jobs', { error: error.message });
    return 0;
  }
  return typeof data === 'number' ? data : 0;
}
