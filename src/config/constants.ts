/**
 * Compile-time constants.
 *
 * Anything a business owner might want to change (prices, credit costs,
 * themes, models, limits) lives in the `app_settings` table instead --
 * see `src/services/config`. What stays here is structural: cache
 * lifetimes, storage bucket names, canonical fallbacks.
 */

export const APP_NAME = 'Nagilai';

export const STORAGE_BUCKETS = {
  childPhotos: 'child-photos',
  illustrations: 'illustrations',
  narrations: 'narrations',
  storyPdfs: 'story-pdfs',
  publicAssets: 'public-assets',
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/**
 * Signed-URL lifetimes. Short enough that a leaked URL expires quickly,
 * long enough that a parent can finish reading a book without the images
 * going dark mid-session.
 */
export const SIGNED_URL_TTL_SECONDS = {
  illustration: 60 * 60,      // 1 hour
  narration: 60 * 60 * 2,     // 2 hours - audio may be paused for a while
  pdf: 60 * 5,                // 5 minutes - the browser downloads immediately
  childPhoto: 60 * 10,
} as const;

/** Interface languages the UI ships translations for (§13). */
export const UI_LOCALES = ['az-AZ', 'en-US', 'ru-RU', 'tr-TR'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const DEFAULT_UI_LOCALE: UiLocale = 'en-US';

export function isUiLocale(value: string | null | undefined): value is UiLocale {
  return typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value);
}

export const LOCALE_COOKIE = 'nagilai_locale';

/** How long the reader polls while a story is still being generated. */
export const GENERATION_POLL_INTERVAL_MS = 2500;
export const GENERATION_POLL_TIMEOUT_MS = 1000 * 60 * 8;

/** Upper bounds enforced regardless of admin configuration. */
export const HARD_LIMITS = {
  maxStoryPages: 24,
  maxChildrenPerAccount: 20,
  maxCustomInstructionChars: 600,
  maxChildNameChars: 60,
  maxParentNotesChars: 1000,
  maxDedicationChars: 300,
  maxInterestsPerField: 12,
  maxPhotoBytes: 8 * 1024 * 1024,
  maxJobAttempts: 3,
} as const;

/** Product analytics event names (§19). */
export const ANALYTICS_EVENTS = {
  signupCompleted: 'signup_completed',
  childCreated: 'child_created',
  storyStarted: 'story_started',
  storyGenerated: 'story_generated',
  storyGenerationFailed: 'story_generation_failed',
  storyOpened: 'story_opened',
  storyCompleted: 'story_completed',
  narrationStarted: 'narration_started',
  narrationCompleted: 'narration_completed',
  pdfDownloaded: 'pdf_downloaded',
  storyShared: 'story_shared',
  printClicked: 'print_clicked',
  checkoutStarted: 'checkout_started',
  purchaseCompleted: 'purchase_completed',
  subscriptionStarted: 'subscription_started',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
