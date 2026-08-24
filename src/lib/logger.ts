/**
 * Structured logging.
 *
 * Emits one JSON object per line so Vercel's log drain can index it.
 * `redact()` strips anything that could carry a child's personal
 * information or a provider key into the log stream (§24).
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'password',
  'token',
  'secret',
  'service_role_key',
  'parent_notes',
  'appearance_description',
  'photo_storage_path',
  'child_snapshot',
  'email',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(entry, depth + 1);
  }
  return out;
}

function emit(level: Level, scope: string, message: string, context?: Record<string, unknown>) {
  const line = {
    level,
    scope,
    message,
    time: new Date().toISOString(),
    ...(context ? { context: redact(context) } : {}),
  };

  const serialised = JSON.stringify(line);
  if (level === 'error') console.error(serialised);
  else if (level === 'warn') console.warn(serialised);
  else console.log(serialised);
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, context) => {
      if (process.env.NODE_ENV !== 'production') emit('debug', scope, message, context);
    },
    info: (message, context) => emit('info', scope, message, context),
    warn: (message, context) => emit('warn', scope, message, context),
    error: (message, context) => emit('error', scope, message, context),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}

/** Extracts a loggable summary from an unknown thrown value. */
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.cause instanceof Error ? { cause: error.cause.message } : {}),
    };
  }

  /*
   * Not everything thrown is an `Error`. Supabase rejects with a plain
   * `PostgrestError` — `{ message, details, hint, code }` — and
   * `String()` renders that as "[object Object]", which is how a
   * configuration read that was failing on every request for every key
   * went unnoticed in the logs. Anything object-shaped gets its own
   * fields out instead.
   */
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const described: Record<string, unknown> = {};
    for (const key of ['message', 'code', 'details', 'hint', 'name', 'status']) {
      const value = record[key];
      /* Empty strings are dropped too: PostgrestError fills `code` and
         `hint` with '' when it has nothing to say, and a log line is
         worth more without them. */
      if (value === undefined || value === null || value === '') continue;
      described[key] = value;
    }
    if (Object.keys(described).length > 0) return described;

    try {
      return { value: JSON.stringify(error).slice(0, 500) };
    } catch {
      return { value: '[unserialisable object]' };
    }
  }

  return { value: String(error) };
}
