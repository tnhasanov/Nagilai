import { z } from 'zod';

/**
 * The contract for a generated story (§5).
 *
 * Two representations of the same shape, deliberately:
 *
 *  - `STORY_JSON_SCHEMA` is sent to the model as a strict structured-output
 *    schema, so the provider itself refuses to return anything else.
 *  - `generatedStorySchema` re-validates the parsed result in our own
 *    process. Never trust a provider to have honoured its own contract --
 *    §37's "do not silently swallow API failures" cuts both ways.
 */

export const generatedPageSchema = z.object({
  pageNumber: z.number().int().min(1).max(64),
  text: z.string().trim().min(1).max(4000),
  sceneSummary: z.string().trim().max(500),
  illustrationPrompt: z.string().trim().max(2000),
});

export const characterBibleSchema = z.object({
  protagonist: z.object({
    name: z.string().trim().max(120),
    appearance: z.string().trim().max(600),
    clothing: z.string().trim().max(400),
    hairstyle: z.string().trim().max(300),
    distinguishingFeatures: z.string().trim().max(400),
  }),
  supportingCharacters: z
    .array(z.object({ name: z.string().trim().max(120), appearance: z.string().trim().max(600) }))
    .max(8),
  worldPalette: z.string().trim().max(400),
  artDirection: z.string().trim().max(600),
});

export const generatedStorySchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(200),
  summary: z.string().trim().max(800),
  dedication: z.string().trim().max(300),
  coverConcept: z.string().trim().max(1000),
  characterBible: characterBibleSchema,
  pages: z.array(generatedPageSchema).min(1).max(64),
  educationalTakeaway: z.string().trim().max(500),
  discussionQuestions: z.array(z.string().trim().max(300)).max(6),
});

/**
 * JSON Schema for OpenAI structured outputs.
 *
 * Strict mode requires `additionalProperties: false` and every property
 * listed in `required`, which is why nothing here is optional -- fields
 * that may be empty are empty strings or empty arrays instead.
 */
export const STORY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'subtitle',
    'summary',
    'dedication',
    'coverConcept',
    'characterBible',
    'pages',
    'educationalTakeaway',
    'discussionQuestions',
  ],
  properties: {
    title: { type: 'string', description: 'The book title, in the story language.' },
    subtitle: { type: 'string', description: 'A short subtitle, or an empty string.' },
    summary: { type: 'string', description: 'Two or three sentences describing the book, for the library card.' },
    dedication: {
      type: 'string',
      description: 'A one-line dedication to the child, in the story language. May be an empty string.',
    },
    coverConcept: {
      type: 'string',
      description: 'English description of the cover illustration: one striking image, no text.',
    },
    characterBible: {
      type: 'object',
      additionalProperties: false,
      required: ['protagonist', 'supportingCharacters', 'worldPalette', 'artDirection'],
      properties: {
        protagonist: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'appearance', 'clothing', 'hairstyle', 'distinguishingFeatures'],
          properties: {
            name: { type: 'string' },
            appearance: { type: 'string', description: 'English. Skin tone, build, face, eyes, age read.' },
            clothing: { type: 'string', description: 'English. Worn on every page without variation.' },
            hairstyle: { type: 'string', description: 'English. Colour, length, style.' },
            distinguishingFeatures: { type: 'string', description: 'English. One or two memorable details.' },
          },
        },
        supportingCharacters: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'appearance'],
            properties: {
              name: { type: 'string' },
              appearance: { type: 'string', description: 'English.' },
            },
          },
        },
        worldPalette: { type: 'string', description: 'English. The colour world of the book.' },
        artDirection: { type: 'string', description: 'English. Composition, light and mood notes.' },
      },
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pageNumber', 'text', 'sceneSummary', 'illustrationPrompt'],
        properties: {
          pageNumber: { type: 'integer' },
          text: { type: 'string', description: 'The page text, in the story language.' },
          sceneSummary: { type: 'string', description: 'English. One line describing what happens.' },
          illustrationPrompt: { type: 'string', description: 'English. One image, no text in the image.' },
        },
      },
    },
    educationalTakeaway: {
      type: 'string',
      description: 'One sentence for the parent, in the story language, about what the book explores.',
    },
    discussionQuestions: {
      type: 'array',
      description: 'Two or three questions a parent can ask afterwards, in the story language.',
      items: { type: 'string' },
    },
  },
} as const;
