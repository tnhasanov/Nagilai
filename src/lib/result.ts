import { AppError, toAppError } from './errors';

/**
 * A serialisable result type for server actions.
 *
 * Server actions cross the network boundary, so throwing an AppError would
 * reach the client as a redacted "An error occurred in the Server
 * Components render". Returning an `ActionResult` instead lets the form
 * show the real, parent-friendly message.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  const appError = toAppError(error);
  return {
    ok: false,
    error: {
      code: appError.code,
      message: appError.userMessage,
      ...(appError.details ? { details: appError.details } : {}),
    },
  };
}

/** Runs an action and converts any thrown error into a failed result. */
export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    if (!(error instanceof AppError)) {
      // Unexpected errors are worth a log line; AppErrors are already
      // deliberate and logged where they are raised.
      console.error('[action] unhandled error', error);
    }
    return fail(error);
  }
}
