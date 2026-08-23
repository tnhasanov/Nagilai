import { describe, expect, it } from 'vitest';
import {
  buildIllustrationPrompt,
  buildNarrationInstructions,
  buildSystemPrompt,
  buildUserPrompt,
  characterSheetLine,
} from '@/services/ai/prompts';
import { generatedStorySchema, STORY_JSON_SCHEMA } from '@/services/ai/schema';
import type { StoryRequest } from '@/types/domain';

/**
 * Prompt construction (§6, §8, §10).
 *
 * Story quality is not directly testable, but the *inputs* to it are. These
 * assert the properties the specification is explicit about: the story
 * language reaches the model, the parent's request reaches the model, the
 * per-language guidance is applied, and the character sheet is repeated in
 * every illustration prompt so the child looks the same page to page.
 */

function request(overrides: Partial<StoryRequest> = {}): StoryRequest {
  return {
    childId: 'child-1',
    child: {
      display_name: 'Miray',
      age_years: 6,
      gender: null,
      interests: ['stars', 'digging'],
      favourite_animals: ['cats'],
      favourite_activities: [],
      favourite_characters: [],
      personality_traits: ['curious'],
      learning_interests: ['space'],
      parent_notes: null,
      appearance_description: null,
    },
    languageCode: 'az-AZ',
    themeSlug: 'space',
    themeGuidance: 'Wonder first, facts second.',
    objectiveSlug: 'curiosity',
    objectiveGuidance: 'A question drives the plot.',
    length: 'medium',
    customInstructions: null,
    languageGuidance: 'Use the full Azerbaijani alphabet correctly.',
    ...overrides,
  };
}

describe('system prompt', () => {
  const prompt = buildSystemPrompt(request(), 10, 70);

  it('names the story language and the per-language guidance', () => {
    expect(prompt).toContain('az-AZ');
    expect(prompt).toContain('Use the full Azerbaijani alphabet correctly.');
  });

  it('states the page count and target length', () => {
    expect(prompt).toContain('Exactly 10 pages');
    expect(prompt).toContain('70 words per page');
  });

  it('bans the failure modes the specification calls out', () => {
    expect(prompt).toContain('Once upon a time');
    expect(prompt.toLowerCase()).toContain('moral');
    expect(prompt).toContain('Do not repeat a distinctive phrase');
  });

  it('keeps the child central and forbids frightening content', () => {
    expect(prompt).toContain('The child is the protagonist');
    expect(prompt.toLowerCase()).toContain('no injury');
  });

  it('adapts the register to the age', () => {
    const forToddler = buildSystemPrompt(
      request({ child: { ...request().child, age_years: 3 } }),
      6,
      40,
    );
    const forOlderChild = buildSystemPrompt(
      request({ child: { ...request().child, age_years: 11 } }),
      16,
      110,
    );

    expect(forToddler).toContain('very short sentences');
    expect(forOlderChild).toContain('fluent young reader');
  });

  it('requires illustration prompts in English so the image model can read them', () => {
    expect(prompt).toContain('must be written in English');
  });
});

describe('user prompt', () => {
  it('includes the child’s details for the story to draw on', () => {
    const prompt = buildUserPrompt(request());

    expect(prompt).toContain('Miray');
    expect(prompt).toContain('stars, digging');
    expect(prompt).toContain('curious');
  });

  it('passes the parent’s own request through', () => {
    const prompt = buildUserPrompt(
      request({ customInstructions: 'Miray travels to space and meets a shy comet.' }),
    );

    expect(prompt).toContain('shy comet');
    expect(prompt).toContain('What the parent asked for');
  });

  it('truncates an over-long request rather than sending it whole', () => {
    const prompt = buildUserPrompt(request({ customInstructions: 'x'.repeat(5000) }));
    expect(prompt).not.toContain('x'.repeat(700));
  });

  it('carries the theme and the learning goal', () => {
    const prompt = buildUserPrompt(request());

    expect(prompt).toContain('Wonder first, facts second.');
    expect(prompt).toContain('A question drives the plot.');
    expect(prompt).toContain('never stated');
  });

  it('gives the model the original when this is a remix', () => {
    const prompt = buildUserPrompt(
      request({
        remixOf: {
          kind: 'alternate_ending',
          originalTitle: 'Mirayın kosmik səyahəti',
          originalSummary: 'Miray goes to space.',
          originalPages: ['Page one text', 'Page two text'],
        },
      }),
    );

    expect(prompt).toContain('Mirayın kosmik səyahəti');
    expect(prompt).toContain('Page two text');
    expect(prompt).toContain('not a paraphrase');
  });

  it('invents an appearance when none was supplied, rather than leaving it open', () => {
    expect(buildUserPrompt(request())).toContain('Invent a warm, appealing appearance');
  });

  it('uses the parent’s description when there is one', () => {
    const prompt = buildUserPrompt(
      request({ child: { ...request().child, appearance_description: 'Dark curly hair' } }),
    );

    expect(prompt).toContain('Dark curly hair');
    expect(prompt).not.toContain('Invent a warm, appealing appearance');
  });
});

describe('illustration prompts', () => {
  const bible = {
    protagonist: {
      name: 'Miray',
      appearance: 'A six-year-old with warm brown skin',
      clothing: 'A mustard raincoat',
      hairstyle: 'Short dark curls',
      distinguishingFeatures: 'A small star badge',
    },
  };

  it('condenses the character sheet into one repeatable line', () => {
    const line = characterSheetLine(bible);

    expect(line).toContain('warm brown skin');
    expect(line).toContain('mustard raincoat');
    expect(line).toContain('star badge');
  });

  it('repeats the character sheet in every page prompt', () => {
    const sheet = characterSheetLine(bible);
    const page = buildIllustrationPrompt({
      stylePrefix: 'A warm classic picture-book illustration.',
      scenePrompt: 'The child waves at the moon.',
      characterSheet: sheet,
      worldPalette: 'Twilight blues',
      artDirection: 'Wide, calm composition',
      isCover: false,
    });

    expect(page).toContain(sheet);
    expect(page).toContain('Interior picture-book illustration.');
    expect(page).toContain('The child waves at the moon.');
  });

  it('marks the cover differently but keeps the same character sheet', () => {
    const cover = buildIllustrationPrompt({
      stylePrefix: 'Watercolour.',
      scenePrompt: 'The child on a hill.',
      characterSheet: characterSheetLine(bible),
      worldPalette: '',
      artDirection: '',
      isCover: true,
    });

    expect(cover).toContain('Book cover illustration.');
    expect(cover).toContain('mustard raincoat');
  });

  it('always forbids text in the image and anything unsafe', () => {
    const prompt = buildIllustrationPrompt({
      stylePrefix: 'Watercolour.',
      scenePrompt: 'A scene.',
      characterSheet: 'A child.',
      worldPalette: '',
      artDirection: '',
      isCover: false,
    });

    expect(prompt).toContain('No text, no letters, no numbers');
    expect(prompt).toContain('No injury, weapons, blood or menace.');
  });
});

describe('narration instructions', () => {
  it('names the story language for pronunciation', () => {
    const instructions = buildNarrationInstructions({
      languageCode: 'ru-RU',
      voiceGuidance: null,
      themeSlug: 'adventure',
    });

    expect(instructions).toContain('ru-RU');
    expect(instructions).toContain('native pronunciation');
  });

  it('slows down for a bedtime story', () => {
    const bedtime = buildNarrationInstructions({
      languageCode: 'az-AZ',
      voiceGuidance: null,
      themeSlug: 'bedtime',
    });

    expect(bedtime).toContain('bedtime story');
    expect(bedtime).toContain('soften towards the end');
  });

  it('uses the voice’s own delivery guidance when configured', () => {
    const instructions = buildNarrationInstructions({
      languageCode: 'tr-TR',
      voiceGuidance: 'Read very softly and slowly.',
      themeSlug: 'friendship',
    });

    expect(instructions).toContain('Read very softly and slowly.');
  });
});

describe('structured output contract', () => {
  it('requires every field, as OpenAI strict mode demands', () => {
    expect(STORY_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(STORY_JSON_SCHEMA.required).toEqual(Object.keys(STORY_JSON_SCHEMA.properties));
  });

  it('accepts a well-formed story', () => {
    const story = {
      title: 'Mirayın səyahəti',
      subtitle: '',
      summary: 'A short summary.',
      dedication: 'Miray üçün.',
      coverConcept: 'The child on a hill under stars.',
      characterBible: {
        protagonist: {
          name: 'Miray',
          appearance: 'Warm brown skin',
          clothing: 'Mustard raincoat',
          hairstyle: 'Short dark curls',
          distinguishingFeatures: 'Star badge',
        },
        supportingCharacters: [],
        worldPalette: 'Twilight',
        artDirection: 'Calm',
      },
      pages: [{ pageNumber: 1, text: 'Miray ulduzlara baxdı.', sceneSummary: 'Looking up', illustrationPrompt: 'A child looks up' }],
      educationalTakeaway: 'Curiosity is worth following.',
      discussionQuestions: ['Nə görürsən?'],
    };

    expect(generatedStorySchema.safeParse(story).success).toBe(true);
  });

  it('rejects a story with an empty page', () => {
    const bad = {
      title: 'T',
      subtitle: '',
      summary: '',
      dedication: '',
      coverConcept: '',
      characterBible: {
        protagonist: { name: '', appearance: '', clothing: '', hairstyle: '', distinguishingFeatures: '' },
        supportingCharacters: [],
        worldPalette: '',
        artDirection: '',
      },
      pages: [{ pageNumber: 1, text: '', sceneSummary: '', illustrationPrompt: '' }],
      educationalTakeaway: '',
      discussionQuestions: [],
    };

    expect(generatedStorySchema.safeParse(bad).success).toBe(false);
  });
});
