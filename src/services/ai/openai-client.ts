import 'server-only';

import OpenAI from 'openai';
import { serverEnv } from '@/config/env';

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
    timeout: 1000 * 240,
    maxRetries: 0, // retries are handled by `withRetry` so they are logged
  });
  return cached;
}

/** Translates an SDK error into something the retry helper understands. */
export function isRetryableOpenAiError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) return true;
    if (typeof error.status === 'number' && error.status >= 500) return true;
    return false;
  }
  return error instanceof OpenAI.APIConnectionError || error instanceof OpenAI.APIConnectionTimeoutError;
}
