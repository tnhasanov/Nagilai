import { en, type Dictionary } from './dictionaries/en';
import { az } from './dictionaries/az';
import { ru } from './dictionaries/ru';
import { tr } from './dictionaries/tr';

/**
 * The locale list, the dictionaries, and the pure functions over them.
 *
 * Deliberately separate from `index.tsx`, which holds the React provider.
 * Nothing here imports React, React Native or an Expo module, so the
 * negotiation rules and the placeholder substitution can be tested
 * directly — and those are exactly the parts with edge cases worth
 * pinning down.
 */

export const LOCALES = ['az-AZ', 'en-US', 'ru-RU', 'tr-TR'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';

export const DICTIONARIES: Record<Locale, Dictionary> = {
  'az-AZ': az,
  'en-US': en,
  'ru-RU': ru,
  'tr-TR': tr,
};

/** Endonyms: a language picker that names languages in English is useless. */
export const LOCALE_NAMES: Record<Locale, string> = {
  'az-AZ': 'Azərbaycanca',
  'en-US': 'English',
  'ru-RU': 'Русский',
  'tr-TR': 'Türkçe',
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  'az-AZ': '🇦🇿',
  'en-US': '🇬🇧',
  'ru-RU': '🇷🇺',
  'tr-TR': '🇹🇷',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best supported locale for a list of language tags.
 *
 * Matches the exact tag first, then the base language, so a phone set to
 * `az`, `az-Latn-AZ` or `ru-KZ` all land somewhere sensible instead of
 * falling through to English. The two passes are separate on purpose: a
 * single pass would let a base-language match on the first tag beat an
 * exact match on the second.
 */
export function negotiateLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const exact = LOCALES.find((locale) => locale.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
  }
  for (const tag of tags) {
    const base = tag.split('-')[0]?.toLowerCase();
    if (!base) continue;
    const match = LOCALES.find((locale) => locale.split('-')[0]?.toLowerCase() === base);
    if (match) return match;
  }
  return null;
}

/**
 * Substitutes `{name}` placeholders.
 *
 * Deliberately minimal, for the same reason the website's is: the
 * alternative is an ICU message formatter in a phone bundle for a handful
 * of counts. Where grammar genuinely differs — Russian plurals — the
 * translation is written to sidestep it ("Страниц: 3" rather than
 * "3 страницы").
 *
 * An unknown placeholder is left in place rather than blanked, so a
 * missing value shows up as `{count}` in review instead of as a hole in a
 * sentence that reads fine.
 */
export function format(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/** Looks a string up by `section.key`, falling back to English. */
export function translate(
  dictionary: Dictionary,
  key: string,
  values?: Record<string, string | number>,
): string {
  const [section, entry] = key.split('.') as [keyof Dictionary, string];
  const table = dictionary[section] as Record<string, string> | undefined;
  const fallback = (en[section] as Record<string, string> | undefined)?.[entry];
  return format(table?.[entry] ?? fallback ?? key, values);
}

export type { Dictionary };
