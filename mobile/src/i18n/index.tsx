import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { en, type Dictionary } from './dictionaries/en';
import { az } from './dictionaries/az';
import { ru } from './dictionaries/ru';
import { tr } from './dictionaries/tr';

/**
 * Interface language for the native app.
 *
 * **Interface language is not story language.** This file decides what the
 * buttons say. What language a *book* is written, narrated and printed in
 * comes from the story row, which a parent chooses per book and which
 * defaults from the child's profile. A parent may read the app in
 * Azerbaijani and make a book in Russian, and nothing here touches that.
 *
 * The locale is resolved from three sources, most specific first:
 *
 *  1. **What the parent chose in this app**, stored on the device. This
 *     wins, because it is the most recent explicit instruction.
 *  2. **Their profile's `ui_locale`**, so a parent who set their language
 *     on the website finds the app already in it after signing in.
 *  3. **The phone's own language**, which is the right guess before
 *     anyone has said anything -- and the reason a first launch in Baku
 *     is in Azerbaijani rather than English.
 *
 * Changing it writes back to the profile as well as to the device, so the
 * two surfaces converge rather than drifting.
 */

export const LOCALES = ['az-AZ', 'en-US', 'ru-RU', 'tr-TR'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';

const DICTIONARIES: Record<Locale, Dictionary> = {
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

const STORAGE_KEY = 'nagilai.locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best supported locale for a list of language tags.
 *
 * Matches the exact tag first, then the base language, so a phone set to
 * `az` or `az-Latn-AZ` or `ru-KZ` all land somewhere sensible instead of
 * falling through to English.
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

/** The phone's language preference, in order. */
export function deviceLocale(): Locale {
  try {
    const tags = Localization.getLocales().map((entry) => entry.languageTag);
    return negotiateLocale(tags) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Substitutes `{name}` placeholders.
 *
 * Deliberately minimal, for the same reason the website's is: the
 * alternative is an ICU message formatter in a phone bundle for a handful
 * of counts. Where grammar genuinely differs -- Russian plurals -- the
 * translation is written to sidestep it ("Страниц: 3" rather than
 * "3 страницы").
 */
export function format(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/* ------------------------------------------------------------------ */

interface I18nValue {
  locale: Locale;
  dictionary: Dictionary;
  /** Whether the stored preference has been read yet. */
  ready: boolean;
  /**
   * `t('reader.pageOf', { page: 2, total: 10 })`.
   *
   * A dotted key rather than `dictionary.reader.pageOf` so a screen reads
   * as prose and a missing key is one lookup rather than a crash.
   */
  t: (key: DictionaryKey, values?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => Promise<void>;
  /** Adopts the profile's locale unless the parent already chose one here. */
  adoptProfileLocale: (locale: string | null | undefined) => void;
}

type DictionaryKey = {
  [Section in keyof Dictionary]: `${Section & string}.${keyof Dictionary[Section] & string}`;
}[keyof Dictionary];

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Deliberately knows nothing about the API client.
 *
 * That is what lets it wrap the sign-in screen, where there is no session
 * and no profile to read a locale from. Pushing a change back to the
 * profile is the settings screen's job, because that screen has both the
 * picker and the API client in hand.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  const [ready, setReady] = useState(false);
  const [chosenHere, setChosenHere] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (isLocale(stored)) {
          setLocaleState(stored);
          setChosenHere(true);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    setChosenHere(true);
    await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const adoptProfileLocale = useCallback(
    (profileLocale: string | null | undefined) => {
      // An explicit choice on this device outranks the profile: it is the
      // more recent instruction, and overriding it would make the picker
      // appear to do nothing.
      if (chosenHere || !isLocale(profileLocale)) return;
      setLocaleState(profileLocale);
    },
    [chosenHere],
  );

  const dictionary = DICTIONARIES[locale] ?? en;

  const t = useCallback(
    (key: DictionaryKey, values?: Record<string, string | number>) => {
      const [section, entry] = key.split('.') as [keyof Dictionary, string];
      const table = dictionary[section] as Record<string, string> | undefined;
      const fallback = (en[section] as Record<string, string> | undefined)?.[entry];
      return format(table?.[entry] ?? fallback ?? key, values);
    },
    [dictionary],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, dictionary, ready, t, setLocale, adoptProfileLocale }),
    [locale, dictionary, ready, t, setLocale, adoptProfileLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside an I18nProvider');
  return value;
}

/** Shorthand for the common case. */
export function useT(): I18nValue['t'] {
  return useI18n().t;
}

export type { Dictionary };
