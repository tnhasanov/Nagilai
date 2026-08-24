import { describe, expect, it } from 'vitest';
import { CHILD_SUGGESTIONS, getChildSuggestions } from '../src/i18n/suggestions';
import { LOCALES } from '../src/i18n/locales';

/**
 * The tap-instead-of-type answers on the child form.
 *
 * Mirrors `tests/suggestions.test.ts` in the web package, because the
 * word lists are a copy that no bundler can keep in sync for us. A locale
 * missing a list renders a field with no chips at all.
 */
const FIELDS = [
  'interests',
  'favouriteAnimals',
  'favouriteActivities',
  'favouriteCharacters',
  'personalityTraits',
  'learningInterests',
] as const;

describe('child suggestions', () => {
  it('ships every locale the app ships', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(CHILD_SUGGESTIONS)).toContain(locale);
    }
  });

  it('offers the same fields, the same number of times, in every language', () => {
    const reference = CHILD_SUGGESTIONS['en-US'];

    for (const [locale, suggestions] of Object.entries(CHILD_SUGGESTIONS)) {
      expect({ locale, fields: Object.keys(suggestions).sort() }).toEqual({
        locale,
        fields: [...FIELDS].sort(),
      });

      for (const field of FIELDS) {
        expect({ locale, field, count: suggestions[field].length }).toEqual({
          locale,
          field,
          count: reference[field].length,
        });
      }
    }
  });

  it('translates rather than copying the English through', () => {
    const reference = CHILD_SUGGESTIONS['en-US'];

    for (const [locale, suggestions] of Object.entries(CHILD_SUGGESTIONS)) {
      if (locale === 'en-US') continue;

      for (const field of FIELDS) {
        const identical = suggestions[field].filter(
          (value, index) => value === reference[field][index],
        );
        expect(
          identical.length,
          `${locale}.${field} looks untranslated: ${identical.join(', ')}`,
        ).toBeLessThan(3);
      }
    }
  });

  it('never repeats a value inside one field, so a chip cannot mean two things', () => {
    for (const [locale, suggestions] of Object.entries(CHILD_SUGGESTIONS)) {
      for (const field of FIELDS) {
        const lowered = suggestions[field].map((value) => value.toLocaleLowerCase());
        expect({ locale, field, unique: new Set(lowered).size }).toEqual({
          locale,
          field,
          unique: lowered.length,
        });
      }
    }
  });

  /** A chip is inserted into a comma-separated field verbatim. */
  it('contains no commas, which would split one answer into two', () => {
    for (const suggestions of Object.values(CHILD_SUGGESTIONS)) {
      for (const field of FIELDS) {
        for (const value of suggestions[field]) {
          expect(value).not.toContain(',');
          expect(value.trim()).toBe(value);
        }
      }
    }
  });

  it('falls back to English for a locale it does not have', () => {
    expect(getChildSuggestions('de-DE' as never)).toBe(CHILD_SUGGESTIONS['en-US']);
  });
});
