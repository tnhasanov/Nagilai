import { z } from 'zod';
import { HARD_LIMITS } from '@/config/constants';

/**
 * Story creation validation (§4).
 *
 * Note what is *not* here: no model name, no token budget, no image size,
 * no language for narration. The wizard collects intent; every technical
 * parameter is resolved server-side from configuration and from the story
 * itself.
 */

export const storyLengthSchema = z.enum(['short', 'medium', 'long']);

export const createStoryInputSchema = z.object({
  childId: z.string().uuid('Choose a child.'),
  languageCode: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Choose a language.'),
  themeSlug: z.string().trim().min(1, 'Choose a story type.').max(64),
  objectiveSlug: z.string().trim().max(64).nullable().optional(),
  illustrationStyleSlug: z.string().trim().max(64).nullable().optional(),
  length: storyLengthSchema.default('medium'),
  customInstructions: z
    .string()
    .trim()
    .max(HARD_LIMITS.maxCustomInstructionChars, 'Please keep this a little shorter.')
    .optional()
    .or(z.literal('')),
  dedication: z.string().trim().max(HARD_LIMITS.maxDedicationChars).optional().or(z.literal('')),
});

export type CreateStoryInput = z.infer<typeof createStoryInputSchema>;

export const remixKindSchema = z.enum([
  'alternate_ending',
  'new_adventure',
  'shorter',
  'longer',
  'different_lesson',
  'different_language',
  'different_style',
]);

export const remixInputSchema = z.object({
  storyId: z.string().uuid(),
  kind: remixKindSchema,
  /** Only meaningful for `different_language`. */
  languageCode: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).nullable().optional(),
  /** Only meaningful for `different_lesson`. */
  objectiveSlug: z.string().trim().max(64).nullable().optional(),
  /** Only meaningful for `different_style`. */
  illustrationStyleSlug: z.string().trim().max(64).nullable().optional(),
});

export type RemixInput = z.infer<typeof remixInputSchema>;

export const narrationRequestSchema = z.object({
  storyId: z.string().uuid(),
  voiceSlug: z.string().trim().max(64).nullable().optional(),
  speed: z.coerce.number().min(0.5).max(2).default(1),
});

export const pdfRequestSchema = z.object({
  storyId: z.string().uuid(),
  variant: z.enum(['digital', 'print']).default('digital'),
  pageSize: z.enum(['a5', 'a4', 'square']).default('a5'),
});

export const shareSettingsSchema = z.object({
  storyId: z.string().uuid(),
  allowAudio: z.boolean().default(true),
  allowDownload: z.boolean().default(false),
  allowIndexing: z.boolean().default(false),
  expiresInDays: z.coerce.number().int().min(0).max(365).default(0),
});
