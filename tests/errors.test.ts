import { describe, expect, it, vi } from 'vitest';
import { AppError, errors, isAppError, toAppError } from '@/lib/errors';
import { attempt, fail, ok } from '@/lib/result';
import { withRetry } from '@/lib/retry';
import { describeError } from '@/lib/logger';

/**
 * Error handling (§32).
 *
 * The rule the specification sets is that a customer never sees a raw
 * provider error. These tests assert the mechanism that guarantees it:
 * every error carries a separate parent-facing message, and unknown
 * throws are wrapped rather than passed through.
 */

describe('AppError', () => {
  it('gives every error a parent-facing message distinct from the technical one', () => {
    const error = new AppError('provider_unavailable', 'openai 529 overloaded_error');

    expect(error.message).toContain('529');
    expect(error.userMessage).not.toContain('529');
    expect(error.userMessage).toContain('busy');
  });

  it('maps each code to a sensible HTTP status', () => {
    expect(new AppError('unauthenticated', 'x').status).toBe(401);
    expect(new AppError('forbidden', 'x').status).toBe(403);
    expect(new AppError('not_found', 'x').status).toBe(404);
    expect(new AppError('insufficient_credits', 'x').status).toBe(402);
    expect(new AppError('rate_limited', 'x').status).toBe(429);
  });

  it('serialises without leaking the technical message', () => {
    const serialised = JSON.stringify(new AppError('internal', 'connection string leaked here'));

    expect(serialised).not.toContain('connection string');
    expect(serialised).toContain('Something went wrong');
  });

  it('knows which failures are worth retrying', () => {
    expect(new AppError('provider_unavailable', 'x').retryable).toBe(true);
    expect(new AppError('validation_failed', 'x').retryable).toBe(false);
    expect(errors.contentBlocked(['violence']).retryable).toBe(false);
  });

  it('wraps an unknown throw rather than letting it escape unclassified', () => {
    const wrapped = toAppError(new TypeError('undefined is not a function'));

    expect(isAppError(wrapped)).toBe(true);
    expect(wrapped.code).toBe('internal');
    expect(wrapped.userMessage).toContain('Something went wrong');
  });

  it('leaves an existing AppError untouched', () => {
    const original = errors.notFound('Story');
    expect(toAppError(original)).toBe(original);
  });
});

describe('action results', () => {
  it('returns data on success', () => {
    expect(ok({ id: 'x' })).toEqual({ ok: true, data: { id: 'x' } });
  });

  it('converts an error into a serialisable failure with a friendly message', () => {
    const result = fail(errors.insufficientCredits(3, 1));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('insufficient_credits');
      expect(result.error.message).toContain('credits');
      expect(result.error.details).toEqual({ needed: 3, available: 1 });
    }
  });

  it('catches a thrown error inside an action instead of crashing the render', async () => {
    const result = await attempt(async () => {
      throw errors.forbidden('nope');
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');
  });

  it('passes a successful action straight through', async () => {
    const result = await attempt(async () => 42);
    expect(result).toEqual({ ok: true, data: 42 });
  });
});

describe('retry with backoff', () => {
  it('returns the first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('done');
    await expect(withRetry(fn, { label: 'test' })).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new AppError('provider_unavailable', 'overloaded'))
      .mockResolvedValue('done');

    await expect(withRetry(fn, { label: 'test', baseDelayMs: 1, maxDelayMs: 2 })).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up immediately on a permanent failure', async () => {
    const fn = vi.fn().mockRejectedValue(new AppError('validation_failed', 'bad input'));

    await expect(withRetry(fn, { label: 'test', baseDelayMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops after the attempt budget and surfaces a provider error', async () => {
    const fn = vi.fn().mockRejectedValue(new AppError('provider_unavailable', 'still overloaded'));

    await expect(
      withRetry(fn, { label: 'test', attempts: 3, baseDelayMs: 1, maxDelayMs: 2 }),
    ).rejects.toMatchObject({ code: 'provider_unavailable' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('honours a caller-supplied retry predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('teapot'));

    await expect(
      withRetry(fn, { label: 'test', baseDelayMs: 1, isRetryable: () => false }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

/**
 * What reaches the log when something fails.
 *
 * Written after a configuration read failed on every request, for every
 * key, and logged `error: "[object Object]"` each time — because Supabase
 * rejects with a plain `PostgrestError` rather than an `Error`, and
 * `String()` has nothing useful to say about a plain object. The failure
 * was completely visible and completely unreadable.
 */
describe('describeError', () => {
  it('unpacks an Error, with its cause', () => {
    const error = new Error('outer', { cause: new Error('inner') });
    expect(describeError(error)).toEqual({ name: 'Error', message: 'outer', cause: 'inner' });
  });

  it('unpacks a Supabase PostgrestError, which is not an Error at all', () => {
    const postgrest = {
      message: 'permission denied for table app_settings',
      code: '42501',
      details: null,
      hint: '',
    };

    // `details: null` and `hint: ''` are dropped: PostgrestError fills
    // them in whether or not it has anything to say.
    expect(describeError(postgrest)).toEqual({
      message: 'permission denied for table app_settings',
      code: '42501',
    });
  });

  it('falls back to JSON for an object with no recognisable fields', () => {
    expect(describeError({ weird: true })).toEqual({ value: '{"weird":true}' });
  });

  it('survives something that cannot be serialised', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    expect(describeError(circular)).toEqual({ value: '[unserialisable object]' });
  });

  it('still handles a primitive', () => {
    expect(describeError('boom')).toEqual({ value: 'boom' });
    expect(describeError(null)).toEqual({ value: 'null' });
  });
});

/**
 * An exhausted OpenAI balance is not a rate limit.
 *
 * Written after a real story sat at "preparing" for a whole morning. The
 * account had no credit; OpenAI says so with a 429, which is the same
 * status a genuine rate limit uses. Classified as retryable, the job
 * re-queued for hours, the parent watched a spinner, and the credit
 * already charged for the story stayed charged — because the refund only
 * fires on a permanent failure.
 */
describe('OpenAI quota exhaustion', () => {
  class FakeApiError extends Error {
    status: number;
    code: string | null;
    constructor(status: number, message: string, code: string | null = null) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  it('is told apart from a genuine rate limit', async () => {
    const { isQuotaExhausted } = await import('@/services/ai/openai-client');
    const OpenAI = (await import('openai')).default;

    const quota = Object.assign(
      new OpenAI.APIError(429, undefined, 'You have no credits remaining.', undefined),
      { code: 'insufficient_quota' },
    );
    const throttled = Object.assign(
      new OpenAI.APIError(429, undefined, 'Rate limit reached for requests', undefined),
      { code: 'rate_limit_exceeded' },
    );

    expect(isQuotaExhausted(quota)).toBe(true);
    expect(isQuotaExhausted(throttled)).toBe(false);
  });

  it('ignores anything that is not a 429 from OpenAI', async () => {
    const { isQuotaExhausted } = await import('@/services/ai/openai-client');

    expect(isQuotaExhausted(new FakeApiError(429, 'no credits remaining'))).toBe(false);
    expect(isQuotaExhausted(new Error('no credits remaining'))).toBe(false);
    expect(isQuotaExhausted(null)).toBe(false);
  });

  it('stops the job on the first try, so the refund happens', async () => {
    const { isPermanentFailure } = await import('@/services/jobs/queue');
    const job = { attempts: 1, max_attempts: 3 } as Parameters<typeof isPermanentFailure>[0];

    // Non-retryable: permanent immediately, however many attempts remain.
    expect(isPermanentFailure(job, new AppError('not_configured', 'no balance'))).toBe(true);

    // Retryable: still has attempts, so it earns another try.
    expect(isPermanentFailure(job, new AppError('provider_unavailable', 'busy'))).toBe(false);

    // An unclassified throw keeps the old benefit of the doubt...
    expect(isPermanentFailure(job, new Error('who knows'))).toBe(false);
    // ...until the attempts run out.
    expect(
      isPermanentFailure({ attempts: 3, max_attempts: 3 } as typeof job, new Error('who knows')),
    ).toBe(true);
  });
});
