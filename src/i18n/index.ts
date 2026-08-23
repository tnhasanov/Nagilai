import { DEFAULT_UI_LOCALE, type UiLocale } from '@/config/constants';
import { enUS, type Dictionary } from './dictionaries/en-US';
import { azAZ } from './dictionaries/az-AZ';
import { ruRU } from './dictionaries/ru-RU';
import { trTR } from './dictionaries/tr-TR';

/**
 * Interface localisation (§13).
 *
 * Interface language and story language are separate concerns: a parent
 * may read the app in Azerbaijani while making a Russian book. The
 * interface language lives in a cookie (and on the profile once signed
 * in); the story language lives on the story row.
 *
 * A cookie rather than a URL segment, deliberately -- it keeps one URL per
 * page, which matters for the share links and the SEO rules in §31.
 *
 * This module is import-safe from a client component. Resolving the
 * request's locale needs `next/headers`, so that lives in `./server`.
 */

const DICTIONARIES: Record<UiLocale, Dictionary> = {
  'en-US': enUS,
  'az-AZ': azAZ,
  'ru-RU': ruRU,
  'tr-TR': trTR,
};

export type { Dictionary };

export function getDictionary(locale: UiLocale): Dictionary {
  return DICTIONARIES[locale] ?? enUS;
}

/**
 * Picks the best supported locale from an Accept-Language header.
 * Exported separately from `resolveLocale` so it can be unit-tested
 * without a request context.
 */
export function negotiateLocale(acceptLanguage: string | null): UiLocale | null {
  if (!acceptLanguage) return null;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const quality = qParam ? Number.parseFloat(qParam.split('=')[1] ?? '1') : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  const supported = Object.keys(DICTIONARIES) as UiLocale[];

  for (const { tag } of ranked) {
    const exact = supported.find((locale) => locale.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;

    const base = tag.split('-')[0]?.toLowerCase();
    const match = supported.find((locale) => locale.split('-')[0]?.toLowerCase() === base);
    if (match) return match;
  }
  return null;
}

/**
 * Substitutes `{name}` placeholders.
 *
 * Deliberately minimal: the alternative is shipping an ICU message
 * formatter to the browser for a handful of counts. Where grammar
 * genuinely differs (Russian plurals), the translation is written to avoid
 * the problem -- "Просмотров: 3" rather than "3 просмотра".
 */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

export { DEFAULT_UI_LOCALE };
