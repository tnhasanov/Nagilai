import { describe, expect, it, vi } from 'vitest';
import { AppError, errors, isAppError, toAppError } from '@/lib/errors';
import { attempt, fail, ok } from '@/lib/result';
import { withRetry } from '@/lib/retry';

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
