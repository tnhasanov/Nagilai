import { AppError, toAppError } from './errors';
import { createLogger, describeError } from './logger';

const log = createLogger('retry');

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label: string;
  /** Return false to give up immediately on this error. */
  isRetryable?: (error: unknown) => boolean;
}

function defaultIsRetryable(error: unknown): boolean {
  const appError = error instanceof AppError ? error : null;
  if (appError) return appError.retryable;

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('529')
  );
}

/**
 * Retries with exponential backoff and full jitter (§32).
 *
 * Jitter matters here: when a story fans out into ten illustration jobs
 * and the provider rate-limits, un-jittered backoff makes all ten retry
 * in lockstep and collide again.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelay = options.baseDelayMs ?? 500;
  const maxDelay = options.maxDelayMs ?? 8000;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryable(error)) break;

      const ceiling = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
      const delay = Math.round(Math.random() * ceiling);
      log.warn('retrying after failure', {
        label: options.label,
        attempt,
        attempts,
        delayMs: delay,
        ...describeError(error),
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw toAppError(lastError, 'provider_unavailable');
}
