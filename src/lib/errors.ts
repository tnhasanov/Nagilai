/**
 * Application errors.
 *
 * §32: a customer never sees a raw provider error. Every failure carries
 * two messages -- a `userMessage` written for a parent, and the technical
 * `message` that goes to the logs and the admin area.
 */

export type AppErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'rate_limited'
  | 'insufficient_credits'
  | 'content_blocked'
  | 'provider_unavailable'
  | 'provider_invalid_response'
  | 'generation_failed'
  | 'conflict'
  | 'not_configured'
  | 'internal';

const DEFAULT_USER_MESSAGES: Record<AppErrorCode, string> = {
  unauthenticated: 'Please sign in to continue.',
  forbidden: "You don't have access to this.",
  not_found: "We couldn't find that.",
  validation_failed: 'Some details need fixing before we can continue.',
  rate_limited: "You've created a lot in a short time. Please try again shortly.",
  insufficient_credits: "You've used all your story credits for now.",
  content_blocked: "We couldn't create a story from that request. Try describing it a different way.",
  provider_unavailable: 'Nagilai is a little busy right now. Please try again in a moment.',
  provider_invalid_response: 'Something came back wrong while creating your story. Please try again.',
  generation_failed: "We couldn't finish creating this. You can retry just the part that failed.",
  conflict: 'That was already done.',
  not_configured: 'This feature is not switched on yet.',
  internal: 'Something went wrong on our side. We have been notified.',
};

const HTTP_STATUS: Record<AppErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  rate_limited: 429,
  insufficient_credits: 402,
  content_blocked: 422,
  provider_unavailable: 503,
  provider_invalid_response: 502,
  generation_failed: 500,
  conflict: 409,
  not_configured: 501,
  internal: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  /** Whether a retry of the same operation could plausibly succeed. */
  readonly retryable: boolean;

  constructor(
    code: AppErrorCode,
    message: string,
    options: {
      userMessage?: string;
      details?: Record<string, unknown>;
      cause?: unknown;
      retryable?: boolean;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = options.userMessage ?? DEFAULT_USER_MESSAGES[code];
    this.status = HTTP_STATUS[code];
    this.details = options.details;
    this.retryable =
      options.retryable ??
      (code === 'provider_unavailable' || code === 'provider_invalid_response' || code === 'internal');
  }

  toJSON() {
    return { error: { code: this.code, message: this.userMessage, details: this.details } };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Wraps any thrown value in an AppError so nothing unclassified reaches a
 * response body.
 */
export function toAppError(error: unknown, fallbackCode: AppErrorCode = 'internal'): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return new AppError(fallbackCode, error.message, { cause: error });
  }
  return new AppError(fallbackCode, String(error));
}

export const errors = {
  unauthenticated: (message = 'No authenticated user') => new AppError('unauthenticated', message),
  forbidden: (message = 'Not permitted') => new AppError('forbidden', message),
  notFound: (what = 'resource') => new AppError('not_found', `${what} not found`),
  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError('validation_failed', message, details ? { details } : {}),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError('rate_limited', 'Rate limit exceeded', {
      details: { retryAfterSeconds },
    }),
  /**
   * Names both numbers, because "you have used all your credits" is a lie
   * when the parent has three and the book costs twelve. The web wizard
   * localises this from `details`; this English sentence is what the API
   * and the logs carry.
   */
  insufficientCredits: (needed: number, available: number) =>
    new AppError('insufficient_credits', `Needs ${needed} credits, has ${available}`, {
      userMessage:
        `This story needs ${needed} ${needed === 1 ? 'credit' : 'credits'} and you have ` +
        `${available}. Try a shorter story, or one without pictures.`,
      details: { needed, available },
    }),
  contentBlocked: (categories: string[]) =>
    new AppError('content_blocked', `Blocked by moderation: ${categories.join(', ')}`, {
      details: { categories },
      retryable: false,
    }),
  notConfigured: (what: string) => new AppError('not_configured', `${what} is not configured`),
};
