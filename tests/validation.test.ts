import { describe, expect, it } from 'vitest';
import { childInputSchema } from '@/features/children/schemas';
import { createStoryInputSchema, shareSettingsSchema } from '@/features/stories/schemas';
import { HARD_LIMITS } from '@/config/constants';

/**
 * Input validation (§37: "validate API inputs").
 *
 * These schemas are the boundary between a form and the database. What is
 * being protected: length limits that keep prompts and storage bounded,
 * language codes that must exist, and the tag lists that go into a
 * generation prompt.
 */

function validChild() {
  return {
    name: 'Miray',
    preferredLanguage: 'az-AZ',
    interests: 'stars, dinosaurs',
    favouriteAnimals: [],
    favouriteActivities: [],
    favouriteCharacters: [],
    personalityTraits: [],
    learningInterests: [],
  };
}

describe('child input', () => {
  it('accepts a minimal profile and normalises comma-separated tags', () => {
    const result = childInputSchema.parse(validChild());

    expect(result.name).toBe('Miray');
    expect(result.interests).toEqual(['stars', 'dinosaurs']);
  });

  it('trims, de-duplicates and caps tag lists', () => {
    const many = Array.from({ length: 40 }, (_, i) => `interest ${i}`).join(', ');
    const result = childInputSchema.parse({
      ...validChild(),
      interests: `  Stars , stars ,  STARS , moon  `,
      favouriteAnimals: many,
    });

    expect(result.interests).toEqual(['Stars', 'moon']);
    expect(result.favouriteAnimals.length).toBeLessThanOrEqual(HARD_LIMITS.maxInterestsPerField);
  });

  it('rejects a blank name', () => {
    expect(() => childInputSchema.parse({ ...validChild(), name: '   ' })).toThrow();
  });

  it('rejects a name longer than the storage limit', () => {
    const tooLong = 'x'.repeat(HARD_LIMITS.maxChildNameChars + 1);
    expect(() => childInputSchema.parse({ ...validChild(), name: tooLong })).toThrow();
  });

  it('rejects an age outside the range the product is designed for', () => {
    expect(() => childInputSchema.parse({ ...validChild(), ageYears: 40 })).toThrow();
    expect(() => childInputSchema.parse({ ...validChild(), ageYears: -1 })).toThrow();
  });

  it('rejects a malformed language code', () => {
    expect(() => childInputSchema.parse({ ...validChild(), preferredLanguage: 'klingon' })).toThrow();
  });

  it('caps parent notes at the documented limit', () => {
    const tooLong = 'x'.repeat(HARD_LIMITS.maxParentNotesChars + 1);
    expect(() => childInputSchema.parse({ ...validChild(), parentNotes: tooLong })).toThrow();
  });
});

describe('story creation input', () => {
  const valid = {
    childId: '11111111-1111-4111-8111-111111111111',
    languageCode: 'ru-RU',
    themeSlug: 'space',
  };

  it('defaults the length to medium', () => {
    expect(createStoryInputSchema.parse(valid).length).toBe('medium');
  });

  it('requires a real child id', () => {
    expect(() => createStoryInputSchema.parse({ ...valid, childId: 'not-a-uuid' })).toThrow();
  });

  it('requires a theme', () => {
    expect(() => createStoryInputSchema.parse({ ...valid, themeSlug: '' })).toThrow();
  });

  it('rejects custom instructions longer than the prompt budget', () => {
    const tooLong = 'x'.repeat(HARD_LIMITS.maxCustomInstructionChars + 1);
    expect(() => createStoryInputSchema.parse({ ...valid, customInstructions: tooLong })).toThrow();
  });

  it('rejects an unknown length', () => {
    expect(() => createStoryInputSchema.parse({ ...valid, length: 'epic' })).toThrow();
  });
});

describe('share settings', () => {
  const storyId = '22222222-2222-4222-8222-222222222222';

  it('defaults to the conservative posture: no indexing, no download', () => {
    const result = shareSettingsSchema.parse({ storyId });

    expect(result.allowIndexing).toBe(false);
    expect(result.allowDownload).toBe(false);
    expect(result.allowAudio).toBe(true);
    expect(result.expiresInDays).toBe(0);
  });

  it('rejects an expiry beyond a year', () => {
    expect(() => shareSettingsSchema.parse({ storyId, expiresInDays: 400 })).toThrow();
  });
});
