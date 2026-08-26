import 'server-only';

import OpenAI from 'openai';
import { AppError } from '@/lib/errors';
import { withRetry } from '@/lib/retry';
import { serverEnv } from '@/config/env';
import { WORKER_DEFAULTS } from '@/config/constants';

/**
 * The single place the OpenAI SDK is constructed.
 *
 * The key is read from the server environment and never crosses to the
 * browser (§5, §24). Timeouts are deliberately generous: a long story with
 * a reasoning model can take a while, and a premature client-side abort
 * still bills for the tokens.
 */
let cached: OpenAI | null = null;

export function openaiClient(): OpenAI {
  if (cached) return cached;

  const env = serverEnv();
  cached = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
    // Bounded by the worker's budget, not the SDK's four-minute default:
    // a call that outlives the serverless function takes the function
    // down with it and leaves the job locked. See WORKER_DEFAULTS.
    timeout: WORKER_DEFAULTS.providerTimeoutMs,
    maxRetries: 0, // retries are handled by `withRetry` so they are logged
  });
  return cached;
}

/**
 * Whether the OpenAI account has run out of money.
 *
 * This arrives as a 429, exactly like a rate limit, and the two could not
 * be more different: a rate limit clears in seconds, an empty balance
 * clears when a human visits the billing page. Retrying it burns the
 * job's attempts over hours, dead-letters the story, and shows the parent
 * a spinner the whole time — which is precisely what happened the first
 * time this product met a real OpenAI account.
 *
 * OpenAI separates them by `code`, so we can too.
 */
export function isQuotaExhausted(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false;
  if (error.status !== 429) return false;

  const code = typeof error.code === 'string' ? error.code : '';
  const type = (error.error as { type?: unknown } | undefined)?.type;
  return (
    code === 'insufficient_quota' ||
    type === 'insufficient_quota' ||
    /no credits remaining|exceeded your current quota|billing/i.test(error.message)
  );
}

/**
 * Runs an OpenAI call with this codebase's retry policy, and turns an
 * exhausted balance into a proper `AppError`.
 *
 * The translation is what matters. Left as a raw SDK error, a 429 reaches
 * `queue.fail`, which cannot classify what it is not given and so
 * defaults to retryable — so a story whose account has no money re-queued
 * every few minutes for hours while the parent watched a spinner, and the
 * credit it had already charged sat unrefunded because the refund only
 * fires on a permanent failure. Non-retryable here means the job stops on
 * the first try and the parent is paid back immediately.
 */
export async function callOpenAi<T>(
  fn: () => Promise<T>,
  options: { label: string; attempts?: number },
): Promise<T> {
  try {
    return await withRetry(fn, { ...options, isRetryable: isRetryableOpenAiError });
  } catch (error) {
    if (isQuotaExhausted(error)) {
      throw new AppError(
        'not_configured',
        `OpenAI rejected the request: the account has no remaining balance (${options.label})`,
        { cause: error, retryable: false },
      );
    }
    throw error;
  }
}

/** Translates an SDK error into something the retry helper understands. */
export function isRetryableOpenAiError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    // An exhausted balance is a 429 that will never clear on its own.
    if (isQuotaExhausted(error)) return false;
    if (error.status === 429) return true;
    if (typeof error.status === 'number' && error.status >= 500) return true;
    return false;
  }
  return error instanceof OpenAI.APIConnectionError || error instanceof OpenAI.APIConnectionTimeoutError;
}
