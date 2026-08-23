import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, errors, toAppError } from '@/lib/errors';
import { createLogger, describeError } from '@/lib/logger';
import { authenticate, type ApiActor } from './auth';

/**
 * The shared shape of every `/api/v1` route.
 *
 * Three things it guarantees, so no individual route has to remember
 * them:
 *
 *  1. A caller is authenticated before the handler body runs, and the
 *     handler receives a Supabase client already scoped to that user.
 *  2. Errors leave as the same JSON envelope the web app already uses,
 *     with a parent-facing message and never a provider stack trace
 *     (§32).
 *  3. Request bodies are validated, so a native client that ships a bug
 *     cannot write nonsense into the database.
 *
 * CORS is permissive because authentication is a bearer token rather
 * than a cookie: there is no ambient authority for another origin to
 * ride on, and Expo's web target needs it during development.
 */
const log = createLogger('api:v1');

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-version',
  'Access-Control-Max-Age': '86400',
};

export interface ApiContext<Params = Record<string, string>> {
  actor: ApiActor;
  request: Request;
  params: Params;
}

type Handler<Params, Result> = (context: ApiContext<Params>) => Promise<Result>;

/** Wraps an authenticated handler. */
export function authenticated<Params extends Record<string, string>, Result>(
  handler: Handler<Params, Result>,
) {
  return async (
    request: Request,
    segment?: { params: Promise<Params> },
  ): Promise<NextResponse> => {
    try {
      const actor = await authenticate(request);
      const params = ((await segment?.params) ?? {}) as Params;
      const result = await handler({ actor, request, params });

      return json(result ?? { ok: true });
    } catch (error) {
      return failure(error, request);
    }
  };
}

/** Wraps a handler that does not require a session (the catalogue). */
export function open<Params extends Record<string, string>, Result>(
  handler: (context: { request: Request; params: Params }) => Promise<Result>,
) {
  return async (request: Request, segment?: { params: Promise<Params> }): Promise<NextResponse> => {
    try {
      const params = ((await segment?.params) ?? {}) as Params;
      return json(await handler({ request, params }));
    } catch (error) {
      return failure(error, request);
    }
  };
}

/** Pre-flight, so Expo's web target can talk to the API in development. */
export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  });
}

function failure(error: unknown, request: Request): NextResponse {
  const appError = toAppError(error);

  // 5xx is our problem and worth a log line; 4xx is the caller's.
  if (appError.status >= 500) {
    log.error('unhandled api error', {
      url: request.url,
      code: appError.code,
      ...describeError(error),
    });
  }

  return NextResponse.json(appError.toJSON(), {
    status: appError.status,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  });
}

/**
 * Parses and validates a JSON body.
 *
 * Zod issues are flattened into a field map the client can render next to
 * the offending input rather than as one opaque sentence.
 */
export async function body<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.infer<Schema>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw errors.validation('Expected a JSON body.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new AppError('validation_failed', 'Request body failed validation', {
      details: { fields },
    });
  }
  return parsed.data;
}

/** Reads a bounded integer query parameter. */
export function intParam(request: Request, name: string, fallback: number, max: number): number {
  const raw = new URL(request.url).searchParams.get(name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}
