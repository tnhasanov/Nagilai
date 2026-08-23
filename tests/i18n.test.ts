import { describe, expect, it } from 'vitest';
import { format, getDictionary, negotiateLocale } from '@/i18n';
import { enUS } from '@/i18n/dictionaries/en-US';
import { azAZ } from '@/i18n/dictionaries/az-AZ';
import { ruRU } from '@/i18n/dictionaries/ru-RU';
import { trTR } from '@/i18n/dictionaries/tr-TR';
import { bookStringsFor } from '@/services/pdf/book-strings';
import { localise } from '@/types/domain';
import { UI_LOCALES } from '@/config/constants';

/**
 * Interface localisation (§13).
 *
 * The dictionaries are typed against the English one, so *missing* keys
 * are a compile error. What a compiler cannot catch is a key that was
 * copied across untranslated, or a placeholder that was dropped in
 * translation — a "{count}" that vanishes silently renders as a sentence
 * with a hole in it.
 */

const DICTIONARIES = { 'en-US': enUS, 'az-AZ': azAZ, 'ru-RU': ruRU, 'tr-TR': trTR } as const;

describe('dictionaries', () => {
  it('ships every launch language', () => {
    for (const locale of UI_LOCALES) {
      expect(Object.keys(DICTIONARIES)).toContain(locale);
    }
  });

  it('has the same keys in every language', () => {
    const reference = flatten(enUS);

    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      expect({ locale, keys: Object.keys(flatten(dictionary)).sort() }).toEqual({
        locale,
        keys: Object.keys(reference).sort(),
      });
    }
  });

  it('preserves every placeholder in every translation', () => {
    const reference = flatten(enUS);

    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      if (locale === 'en-US') continue;
      const translated = flatten(dictionary);

      for (const [key, englishValue] of Object.entries(reference)) {
        const placeholders = [...englishValue.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        if (placeholders.length === 0) continue;

        const translatedPlaceholders = [...(translated[key] ?? '').matchAll(/\{(\w+)\}/g)]
          .map((m) => m[1])
          .sort();

        expect({ locale, key, placeholders: translatedPlaceholders }).toEqual({
          locale,
          key,
          placeholders,
        });
      }
    }
  });

  it('actually translates rather than copying the English through', () => {
    // A handful of strings are legitimately identical across languages
    // (brand names, "Premium", "×"). Everything else should differ.
    const shared = new Set(['appName', 'premiumBadge', 'title']);
    const reference = flatten(enUS);

    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      if (locale === 'en-US') continue;
      const translated = flatten(dictionary);

      const untranslated = Object.entries(reference).filter(([key, value]) => {
        const leaf = key.split('.').pop() ?? '';
        if (shared.has(leaf)) return false;
        return translated[key] === value && value.length > 12;
      });

      expect({ locale, untranslated: untranslated.map(([key]) => key) }).toEqual({
        locale,
        untranslated: [],
      });
    }
  });
});

describe('dictionary lookup', () => {
  it('returns the dictionary for a supported locale', () => {
    expect(getDictionary('az-AZ').nav.library).toBe('Kitabxanam');
    expect(getDictionary('tr-TR').nav.library).toBe('Kitaplığım');
  });

  it('falls back to English for anything unexpected', () => {
    expect(getDictionary('de-DE' as never).nav.library).toBe('My Library');
  });
});

describe('locale negotiation', () => {
  it('matches an exact tag', () => {
    expect(negotiateLocale('az-AZ')).toBe('az-AZ');
  });

  it('matches on the base language', () => {
    expect(negotiateLocale('ru')).toBe('ru-RU');
    expect(negotiateLocale('tr-CY')).toBe('tr-TR');
  });

  it('respects quality ordering rather than document order', () => {
    expect(negotiateLocale('de;q=0.9, az;q=1.0')).toBe('az-AZ');
    expect(negotiateLocale('fr, ru;q=0.8')).toBe('ru-RU');
  });

  it('returns null when nothing is supported, so the caller can default', () => {
    expect(negotiateLocale('de-DE, fr-FR')).toBeNull();
    expect(negotiateLocale(null)).toBeNull();
    expect(negotiateLocale('')).toBeNull();
  });
});

describe('placeholder formatting', () => {
  it('substitutes named values', () => {
    expect(format('{count} credits left', { count: 3 })).toBe('3 credits left');
    expect(format('Page {current} of {total}', { current: 2, total: 10 })).toBe('Page 2 of 10');
  });

  it('leaves an unknown placeholder visible rather than printing "undefined"', () => {
    expect(format('Hello {name}', {})).toBe('Hello {name}');
  });
});

describe('localised labels from the database', () => {
  const labels = { 'en-US': 'Adventure', 'az-AZ': 'Macəra', 'ru-RU': 'Приключение' };

  it('returns the requested language', () => {
    expect(localise(labels, 'az-AZ')).toBe('Macəra');
  });

  it('falls back through the base language, then English', () => {
    expect(localise(labels, 'ru')).toBe('Приключение');
    expect(localise(labels, 'tr-TR')).toBe('Adventure');
  });

  it('survives a null or malformed value', () => {
    expect(localise(null, 'en-US')).toBe('');
    expect(localise('not an object' as unknown as null, 'en-US')).toBe('');
  });
});

describe('printed book furniture', () => {
  it('is written in the story language, not the interface language', () => {
    expect(bookStringsFor('az-AZ', 'Miray').theEnd).toBe('Son');
    expect(bookStringsFor('ru-RU', 'Мирай').theEnd).toBe('Конец');
    expect(bookStringsFor('tr-TR', 'Miray').theEnd).toBe('Son');
    expect(bookStringsFor('en-US', 'Miray').theEnd).toBe('The End');
  });

  it('personalises the dedication line with the child’s name', () => {
    expect(bookStringsFor('en-US', 'Miray').aStoryFor).toBe('A story for Miray');
    expect(bookStringsFor('ru-RU', 'Мирай').aStoryFor).toBe('Сказка для Мирай');
  });

  it('reads sensibly when there is no name', () => {
    expect(bookStringsFor('en-US', null).aStoryFor).toBe('A story just for you');
  });

  it('falls back to English for an unknown language', () => {
    expect(bookStringsFor('de-DE', 'Lena').theEnd).toBe('The End');
  });
});

function flatten(dictionary: Record<string, Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [section, entries] of Object.entries(dictionary)) {
    for (const [key, value] of Object.entries(entries)) {
      out[`${section}.${key}`] = value;
    }
  }
  return out;
}
