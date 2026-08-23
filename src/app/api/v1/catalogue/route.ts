import { open, preflight } from '@/services/api/handler';
import { getCatalogue } from '@/features/stories/catalogue';
import { getSetting } from '@/services/config/settings';
import { isUiLocale, DEFAULT_UI_LOCALE } from '@/config/constants';

/**
 * Everything the story wizard needs to render: languages, themes,
 * learning goals, art styles and voices, localised into the requested
 * interface language.
 *
 * Unauthenticated on purpose — it is the same configuration the marketing
 * site shows, and a native client needs it before sign-in to render an
 * onboarding preview.
 *
 * Also returns the credit costs and feature flags, so the app never
 * hard-codes a price or ships a button for a switched-off feature.
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const GET = open(async ({ request }) => {
  const url = new URL(request.url);
  const requested = url.searchParams.get('locale');
  const locale = isUiLocale(requested) ? requested : DEFAULT_UI_LOCALE;

  const ageParam = url.searchParams.get('age');
  const age = ageParam ? Number.parseInt(ageParam, 10) : Number.NaN;

  const [catalogue, credits, features, limits] = await Promise.all([
    getCatalogue(locale, Number.isFinite(age) ? age : null),
    getSetting('credits'),
    getSetting('features'),
    getSetting('generation_limits'),
  ]);

  return {
    locale,
    ...catalogue,
    credits: {
      storyText: credits.story_text,
      storyIllustration: credits.story_illustration,
      storyNarration: credits.story_narration,
    },
    features,
    lengths: {
      short: { pages: limits.short.pages },
      medium: { pages: limits.medium.pages },
      long: { pages: limits.long.pages },
    },
  };
});
