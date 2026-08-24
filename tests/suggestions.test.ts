import { describe, expect, it } from 'vitest';
import { CHILD_SUGGESTIONS, GENDER_VALUES, getChildSuggestions } from '@/i18n/suggestions';
import { defaultStoryLanguage } from '@/i18n';
import { childInputSchema } from '@/features/children/schemas';
import { HARD_LIMITS, UI_LOCALES } from '@/config/constants';

/**
 * The tap-instead-of-type answers on the child form (§3, §13).
 *
 * These are not in `Dictionary`, so the parity guarantees the dictionary
 * tests provide do not cover them. They matter just as much: a locale
 * missing a list renders a field with no chips at all, and a chip the
 * schema rejects is a button that silently does nothing.
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
  it('ships every launch language', () => {
    for (const locale of UI_LOCALES) {
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
        // Same count, so no locale quietly offers a shorter menu.
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
        // A handful legitimately match ("robots" is "robotlar", but
        // "futbol" really is "futbol"). Most must not.
        const identical = suggestions[field].filter((value, index) => value === reference[field][index]);
        expect(
          identical.length,
          `${locale}.${field} looks untranslated: ${identical.join(', ')}`,
        ).toBeLessThan(3);
      }
    }
  });

  it('never repeats a value inside one field', () => {
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

  /**
   * A chip writes its text straight into the field, so anything the
   * schema would reject is a button that appears to work and does not.
   */
  it('offers only values the schema accepts', () => {
    for (const [locale, suggestions] of Object.entries(CHILD_SUGGESTIONS)) {
      for (const field of FIELDS) {
        for (const value of suggestions[field]) {
          expect(value.trim(), `${locale}.${field}`).toBe(value);
          expect(value.length, `${locale}.${field}: "${value}"`).toBeLessThanOrEqual(60);
          expect(value).not.toContain(',');
        }
      }
    }
  });

  it('fits inside the per-field cap, so every chip is tappable', () => {
    for (const suggestions of Object.values(CHILD_SUGGESTIONS)) {
      for (const field of FIELDS) {
        expect(suggestions[field].length).toBeLessThanOrEqual(HARD_LIMITS.maxInterestsPerField);
      }
    }
  });

  it('survives a round trip through the child schema', () => {
    const suggestions = getChildSuggestions('az-AZ');
    const parsed = childInputSchema.parse({
      name: 'Miray',
      preferredLanguage: 'az-AZ',
      interests: suggestions.interests.join(', '),
      favouriteAnimals: suggestions.favouriteAnimals.join(', '),
      gender: 'girl',
    });

    expect(parsed.interests).toEqual(suggestions.interests);
    expect(parsed.favouriteAnimals).toEqual(suggestions.favouriteAnimals);
    expect(parsed.gender).toBe('girl');
  });

  it('falls back to English for a locale it does not have', () => {
    expect(getChildSuggestions('de-DE' as never)).toBe(CHILD_SUGGESTIONS['en-US']);
  });
});

describe('gender', () => {
  /**
   * Stored canonically rather than as the localised label, so a profile
   * created in Azerbaijani builds the same prompt as one created in
   * English.
   */
  it('is a short list of values the schema accepts', () => {
    for (const value of GENDER_VALUES) {
      expect(value).toMatch(/^[a-z]+$/);
      expect(childInputSchema.parse({ name: 'A', preferredLanguage: 'en-US', gender: value }).gender).toBe(
        value,
      );
    }
  });

  it('treats an empty answer as a real one', () => {
    expect(childInputSchema.parse({ name: 'A', preferredLanguage: 'en-US', gender: '' }).gender).toBe('');
  });
});

/**
 * Story language is not catalogue order.
 *
 * Everything used to fall back to `languages[0]`, which the seed makes
 * Azerbaijani — for every parent, whichever language they were reading
 * the app in. The wizard pre-fills story language from the child profile,
 * so a Turkish parent who did not notice the select got a whole
 * Azerbaijani book and found out after the credits were gone.
 */
describe('defaultStoryLanguage', () => {
  const available = [{ code: 'az-AZ' }, { code: 'en-US' }, { code: 'ru-RU' }, { code: 'tr-TR' }];

  it('offers the language the parent is already reading', () => {
    expect(defaultStoryLanguage(available, 'tr-TR')).toBe('tr-TR');
    expect(defaultStoryLanguage(available, 'ru-RU')).toBe('ru-RU');
  });

  it('does not simply take the first row', () => {
    // The failure mode, pinned: az-AZ is first in the seeded catalogue.
    expect(defaultStoryLanguage(available, 'en-US')).not.toBe('az-AZ');
  });

  it('falls back to catalogue order when the locale is not a story language', () => {
    // An administrator can switch a language off for stories while it
    // remains a perfectly good interface language.
    expect(defaultStoryLanguage([{ code: 'az-AZ' }, { code: 'en-US' }], 'tr-TR')).toBe('az-AZ');
  });

  it('survives an empty catalogue rather than rendering undefined', () => {
    expect(defaultStoryLanguage([], 'tr-TR')).toBe('en-US');
  });
});
