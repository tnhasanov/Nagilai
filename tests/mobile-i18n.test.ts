import { describe, expect, it } from 'vitest';
import { en } from '../mobile/src/i18n/dictionaries/en';
import { az } from '../mobile/src/i18n/dictionaries/az';
import { ru } from '../mobile/src/i18n/dictionaries/ru';
import { tr } from '../mobile/src/i18n/dictionaries/tr';

/**
 * The native app's four interface languages.
 *
 * Tested from the web suite deliberately: the mobile package has no test
 * runner of its own, the dictionaries are plain data with no React Native
 * imports, and a missing Azerbaijani string should fail CI rather than
 * ship. TypeScript already enforces that the *keys* match; what it cannot
 * check is whether a "translation" is the English text pasted across, or
 * whether a placeholder survived.
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
