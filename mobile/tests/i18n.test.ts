import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/dictionaries/en';
import { az } from '../src/i18n/dictionaries/az';
import { ru } from '../src/i18n/dictionaries/ru';
import { tr } from '../src/i18n/dictionaries/tr';
import { format, isLocale, negotiateLocale, translate, LOCALES } from '../src/i18n/locales';

/**
 * The native app's four interface languages.
 *
 * TypeScript already enforces that the *keys* match across locales. What
 * it cannot check is whether a "translation" is the English text pasted
 * across, or whether a placeholder survived the translation — both of
 * which read fine in review and are obvious on a phone.
 *
 * Azerbaijani is the primary market, so "we shipped English to Baku" is
 * the specific failure worth a test.
 */

const TRANSLATIONS = { az, ru, tr } as const;

type Section = keyof typeof en;

function entries(dictionary: Record<string, Record<string, string>>): [string, string][] {
  return Object.entries(dictionary).flatMap(([section, table]) =>
    Object.entries(table).map(([key, value]): [string, string] => [`${section}.${key}`, value]),
  );
}

const englishEntries = entries(en as unknown as Record<string, Record<string, string>>);

describe('mobile dictionaries', () => {
  it('cover every section of the English source', () => {
    const sections = Object.keys(en) as Section[];
    for (const [name, dictionary] of Object.entries(TRANSLATIONS)) {
      expect(Object.keys(dictionary).sort(), name).toEqual([...sections].sort());
    }
  });

  it('define every key, with nothing empty', () => {
    for (const [name, dictionary] of Object.entries(TRANSLATIONS)) {
      const translated = new Map(
        entries(dictionary as unknown as Record<string, Record<string, string>>),
      );

      for (const [key] of englishEntries) {
        const value = translated.get(key);
        expect(value, `${name} is missing ${key}`).toBeDefined();
        expect(value?.trim().length, `${name}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('keep every placeholder the English string uses', () => {
    // A dropped `{count}` is a sentence that reads fine in review and
    // renders as "You have  saved on this device." on a phone.
    for (const [name, dictionary] of Object.entries(TRANSLATIONS)) {
      const translated = new Map(
        entries(dictionary as unknown as Record<string, Record<string, string>>),
      );

      for (const [key, english] of englishEntries) {
        const expected = [...english.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        if (expected.length === 0) continue;

        const actual = [...(translated.get(key) ?? '').matchAll(/\{(\w+)\}/g)]
          .map((match) => match[1])
          .sort();

        expect(actual, `${name}.${key} placeholders`).toEqual(expected);
      }
    }
  });

  it('are actually translated rather than English pasted across', () => {
    // Proper nouns, and strings where the same word is genuinely correct
    // in more than one language.
    const SHARED = new Set([
      'common.appName',
      'common.offline',
      'auth.email',
      'auth.emailPlaceholder',
      'create.pagesSuffix',
      'settings.booksSummary',
    ]);

    for (const [name, dictionary] of Object.entries(TRANSLATIONS)) {
      const translated = new Map(
        entries(dictionary as unknown as Record<string, Record<string, string>>),
      );

      const identical = englishEntries.filter(
        ([key, english]) => !SHARED.has(key) && translated.get(key) === english,
      );

      expect(identical.map(([key]) => key), `${name} has untranslated strings`).toEqual([]);
    }
  });

  it('translate the strings a parent sees first', () => {
    // A smoke check with real expectations rather than a shape assertion:
    // if these are wrong, the app opened in Baku is wrong.
    expect(az.tabs.library).toBe('Kitabxana');
    expect(ru.tabs.library).toBe('Библиотека');
    expect(tr.tabs.library).toBe('Kitaplık');

    expect(az.auth.signIn).toBe('Daxil ol');
    expect(ru.auth.signIn).toBe('Войти');
    expect(tr.auth.signIn).toBe('Giriş yap');
  });

  it('say that the language picker changes the interface, not the stories', () => {
    // The one piece of copy in the app that has to be unambiguous: a
    // language control in a storytelling app will otherwise be read as
    // "what language are my books in".
    for (const dictionary of [en, az, ru, tr]) {
      expect(dictionary.settings.languageHint.length).toBeGreaterThan(20);
      expect(dictionary.create.storyLanguageHint.length).toBeGreaterThan(20);
    }
  });
});

describe('locale negotiation', () => {
  it('prefers an exact tag', () => {
    expect(negotiateLocale(['ru-RU'])).toBe('ru-RU');
    expect(negotiateLocale(['az-AZ'])).toBe('az-AZ');
  });

  it('is case-insensitive about the region', () => {
    expect(negotiateLocale(['ru-ru'])).toBe('ru-RU');
    expect(negotiateLocale(['AZ-az'])).toBe('az-AZ');
  });

  it('falls back to the base language', () => {
    // A phone set to plain `az`, or to Azerbaijani with a script subtag,
    // must still get Azerbaijani rather than English.
    expect(negotiateLocale(['az'])).toBe('az-AZ');
    expect(negotiateLocale(['az-Latn-AZ'])).toBe('az-AZ');
    expect(negotiateLocale(['ru-KZ'])).toBe('ru-RU');
    expect(negotiateLocale(['tr-CY'])).toBe('tr-TR');
  });

  it('lets an exact match on a later tag beat a base match on an earlier one', () => {
    // The reason negotiation is two passes rather than one: a device
    // listing "ru-KZ, az-AZ" wants Azerbaijani exactly, not Russian by
    // approximation.
    expect(negotiateLocale(['ru-KZ', 'az-AZ'])).toBe('az-AZ');
  });

  it('respects the order of the phone preference list', () => {
    expect(negotiateLocale(['tr-TR', 'ru-RU'])).toBe('tr-TR');
    expect(negotiateLocale(['ru-RU', 'tr-TR'])).toBe('ru-RU');
  });

  it('returns null when nothing matches, rather than guessing', () => {
    expect(negotiateLocale(['de-DE', 'fr-FR'])).toBeNull();
    expect(negotiateLocale([])).toBeNull();
  });

  it('recognises exactly the four shipped locales', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
    expect(isLocale('de-DE')).toBe(false);
    expect(isLocale('az')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('placeholder substitution', () => {
  it('fills every named value', () => {
    expect(format('Page {page} of {total}', { page: 2, total: 10 })).toBe('Page 2 of 10');
  });

  it('substitutes a placeholder used more than once', () => {
    expect(format('{a} and {a}', { a: 'x' })).toBe('x and x');
  });

  it('leaves an unknown placeholder visible rather than blanking it', () => {
    // A hole in a sentence reads as finished copy; `{count}` does not.
    expect(format('You have {count} books', {})).toBe('You have {count} books');
  });

  it('is a no-op with no values', () => {
    expect(format('No placeholders here')).toBe('No placeholders here');
  });
});

describe('lookup', () => {
  it('resolves a dotted key', () => {
    expect(translate(az, 'tabs.library')).toBe('Kitabxana');
  });

  it('falls back to English for a key a locale somehow lacks', () => {
    const partial = { ...az, tabs: {} } as unknown as typeof az;
    expect(translate(partial, 'tabs.library')).toBe(en.tabs.library);
  });

  it('returns the key itself rather than throwing on nonsense', () => {
    expect(translate(az, 'nope.missing')).toBe('nope.missing');
  });
});
