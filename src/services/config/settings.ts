import 'server-only';

import { z } from 'zod';
import { createLogger, describeError } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';

/**
 * Reads business configuration out of `app_settings` (§18).
 *
 * Every value has a schema and a compiled-in default, so a missing or
 * malformed row degrades to a sane value instead of taking the site down.
 * Results are cached for a short window: an admin edit takes effect within
 * a minute without a deployment, and a hot request path does not hit the
 * database for every setting it needs.
 */
const log = createLogger('config');

const CACHE_TTL_MS = 60_000;

const creditsSchema = z.object({
  signup_grant: z.number().int().min(0).default(3),
  story_text: z.number().int().min(0).default(1),
  story_illustration: z.number().int().min(0).default(1),
  story_narration: z.number().int().min(0).default(1),
  story_pdf_hq: z.number().int().min(0).default(0),
});

const modelsSchema = z.object({
  text: z.string().default('gpt-5'),
  text_fallback: z.string().default('gpt-5-mini'),
  image: z.string().default('gpt-image-1'),
  image_size: z.string().default('1024x1024'),
  image_quality: z.string().default('medium'),
  tts: z.string().default('gpt-4o-mini-tts'),
  tts_format: z.enum(['mp3', 'opus', 'aac', 'wav']).default('mp3'),
  moderation: z.string().default('omni-moderation-latest'),
});

const tokenPriceSchema = z.object({
  input_micro_usd_per_1k: z.number().min(0).default(0),
  output_micro_usd_per_1k: z.number().min(0).default(0),
  cached_input_micro_usd_per_1k: z.number().min(0).default(0),
});

const pricingSchema = z.object({
  text: z.record(z.string(), tokenPriceSchema).default({}),
  image: z.record(z.string(), z.record(z.string(), z.number().min(0))).default({}),
  speech: z
    .record(z.string(), z.object({ micro_usd_per_1k_characters: z.number().min(0).default(0) }))
    .default({}),
});

const lengthSpecSchema = z.object({
  pages: z.number().int().min(1).max(64),
  words_per_page: z.number().int().min(5).max(400),
  max_output_tokens: z.number().int().min(500).max(64_000),
});

const generationLimitsSchema = z.object({
  short: lengthSpecSchema.default({ pages: 6, words_per_page: 40, max_output_tokens: 3000 }),
  medium: lengthSpecSchema.default({ pages: 10, words_per_page: 70, max_output_tokens: 6000 }),
  long: lengthSpecSchema.default({ pages: 16, words_per_page: 110, max_output_tokens: 12000 }),
  max_pages: z.number().int().min(1).max(64).default(24),
  max_custom_instruction_chars: z.number().int().min(50).max(4000).default(600),
});

const rateLimitEntrySchema = z.object({
  limit: z.number().int().min(1),
  window_seconds: z.number().int().min(1),
});

const rateLimitsSchema = z.object({
  story_create: rateLimitEntrySchema.default({ limit: 10, window_seconds: 3600 }),
  illustration: rateLimitEntrySchema.default({ limit: 60, window_seconds: 3600 }),
  narration: rateLimitEntrySchema.default({ limit: 40, window_seconds: 3600 }),
  pdf: rateLimitEntrySchema.default({ limit: 20, window_seconds: 3600 }),
  share_create: rateLimitEntrySchema.default({ limit: 30, window_seconds: 3600 }),
  auth: rateLimitEntrySchema.default({ limit: 20, window_seconds: 900 }),
});

const featuresSchema = z.object({
  illustrations_enabled: z.boolean().default(true),
  narration_enabled: z.boolean().default(true),
  pdf_enabled: z.boolean().default(true),
  sharing_enabled: z.boolean().default(true),
  child_photo_upload_enabled: z.boolean().default(false),
  remix_enabled: z.boolean().default(true),
  payments_enabled: z.boolean().default(false),
  printing_enabled: z.boolean().default(false),
  guest_preview_enabled: z.boolean().default(true),
  /**
   * Off until a real Expo project id and store push credentials exist.
   * The native app asks the server before prompting, so a parent is never
   * asked for a permission the product cannot yet honour.
   */
  push_notifications_enabled: z.boolean().default(false),
});

const planLimitEntrySchema = z.object({
  max_children: z.number().int().min(1).default(2),
  max_stories_per_month: z.number().int().min(0).default(3),
  allow_premium_styles: z.boolean().default(false),
  max_length: z.enum(['short', 'medium', 'long']).default('medium'),
});

const planLimitsSchema = z.object({
  free: planLimitEntrySchema.default({
    max_children: 2,
    max_stories_per_month: 3,
    allow_premium_styles: false,
    max_length: 'medium',
  }),
  family: planLimitEntrySchema.default({
    max_children: 5,
    max_stories_per_month: 30,
    allow_premium_styles: true,
    max_length: 'long',
  }),
  premium: planLimitEntrySchema.default({
    max_children: 10,
    max_stories_per_month: 100,
    allow_premium_styles: true,
    max_length: 'long',
  }),
});

const safetySchema = z.object({
  blocked_input_categories: z.array(z.string()).default([]),
  min_child_age: z.number().int().min(0).default(2),
  max_child_age: z.number().int().min(1).default(12),
});

const brandingSchema = z.object({
  tagline: z.record(z.string(), z.string()).default({}),
  support_email: z.string().default('hello@nagilai.com'),
});

const SETTINGS = {
  credits: creditsSchema,
  ai_models: modelsSchema,
  ai_pricing: pricingSchema,
  generation_limits: generationLimitsSchema,
  rate_limits: rateLimitsSchema,
  features: featuresSchema,
  plan_limits: planLimitsSchema,
  safety: safetySchema,
  branding: brandingSchema,
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]>;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as SettingValue<K>;
  }

  const schema = SETTINGS[key];
  let raw: unknown = {};

  try {
    const { data, error } = await supabaseAdmin()
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    raw = data?.value ?? {};
  } catch (error) {
    log.warn('falling back to default configuration', { key, ...describeError(error) });
  }

  const parsed = schema.safeParse(raw);
  const value = parsed.success ? parsed.data : schema.parse({});

  if (!parsed.success) {
    log.error('stored configuration failed validation, using defaults', {
      key,
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value as SettingValue<K>;
}

/** Invalidates the cache after an admin writes a setting. */
export function invalidateSettingsCache(key?: SettingKey): void {
  if (key) cache.delete(key);
  else cache.clear();
}

/** Convenience: the length specification for a story length choice. */
export async function getLengthSpec(length: 'short' | 'medium' | 'long') {
  const limits = await getSetting('generation_limits');
  const spec = limits[length];
  return {
    pages: Math.min(spec.pages, limits.max_pages),
    wordsPerPage: spec.words_per_page,
    maxOutputTokens: spec.max_output_tokens,
  };
}
