import { z } from 'zod';

/**
 * Environment configuration.
 *
 * Two schemas, deliberately separated:
 *
 *  - `clientEnv` holds only `NEXT_PUBLIC_*` values. These are inlined into
 *    the browser bundle, so nothing secret may ever appear here.
 *  - `serverEnv()` is lazy and throws if it is reached from the browser.
 *    Importing this module client-side is safe; *calling* `serverEnv()`
 *    is not, and fails loudly rather than leaking a key.
 *
 * Optional integrations (Stripe, Resend, PostHog, a print provider) are
 * genuinely optional: Phase 1 runs without them, and each service module
 * degrades to a no-op implementation when its keys are absent.
 */

const nonEmpty = z.string().trim().min(1);

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,

  OPENAI_API_KEY: nonEmpty,
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_TEXT_MODEL: z.string().optional(),
  OPENAI_IMAGE_MODEL: z.string().optional(),
  OPENAI_TTS_MODEL: z.string().optional(),
  OPENAI_MODERATION_MODEL: z.string().optional(),

  /**
   * Shared secret for the background worker endpoint. Vercel Cron sends it
   * as `Authorization: Bearer <CRON_SECRET>`; the app also uses it to kick
   * the worker inline after enqueueing.
   */
  CRON_SECRET: z.string().min(16).optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  PRINT_PROVIDER: z.enum(['manual', 'gelato', 'lulu']).default('manual'),
  GELATO_API_KEY: z.string().optional(),
  LULU_CLIENT_KEY: z.string().optional(),
  LULU_CLIENT_SECRET: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

/**
 * Client-visible configuration. Every key is spelled out literally so the
 * Next.js compiler can inline it -- `process.env[name]` would not work.
 */
function readClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment configuration:\n${formatIssues(parsed.error)}\n` +
        'Copy .env.example to .env.local and fill in the Supabase values.',
    );
  }
  return parsed.data;
}

let cachedClientEnv: ClientEnv | null = null;

export function clientEnv(): ClientEnv {
  cachedClientEnv ??= readClientEnv();
  return cachedClientEnv;
}

let cachedServerEnv: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. Server secrets must never reach the client.');
  }
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment configuration:\n${formatIssues(parsed.error)}\n` +
        'See .env.example for the full list.',
    );
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/** True when an optional integration is configured. */
export const integrations = {
  stripe: () => Boolean(process.env.STRIPE_SECRET_KEY),
  resend: () => Boolean(process.env.RESEND_API_KEY),
  posthog: () => Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
};

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  // Vercel sets this for preview deployments where the final URL is unknown.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}
