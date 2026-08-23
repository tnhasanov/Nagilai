import { z } from 'zod';
import { HARD_LIMITS } from '@/config/constants';

/**
 * Child profile validation (§3).
 *
 * Shared by the form and the server action, so the browser and the server
 * agree on what is acceptable and the server never trusts the browser
 * (§37: "validate API inputs").
 */

const tagList = (max: number) =>
  z
    .array(z.string().trim().min(1).max(60))
    .max(max)
    .default([])
    .transform((values) => {
      const seen = new Set<string>();
      return values.filter((value) => {
        const key = value.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

/** Accepts either a real array or the comma-separated string a form sends. */
export const tagInput = (max: number) =>
  z.preprocess((value) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return value ?? [];
  }, tagList(max));

export const childInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Please enter your child’s name.')
    .max(HARD_LIMITS.maxChildNameChars, 'That name is a little too long.'),
  nickname: z.string().trim().max(HARD_LIMITS.maxChildNameChars).optional().or(z.literal('')),
  ageYears: z.coerce
    .number()
    .int()
    .min(0, 'Age must be zero or more.')
    .max(17, 'Nagilai is designed for children up to 12.')
    .nullable()
    .optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.')
    .nullable()
    .optional()
    .or(z.literal('')),
  gender: z.string().trim().max(40).optional().or(z.literal('')),
  preferredLanguage: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Choose a language.'),
  interests: tagInput(HARD_LIMITS.maxInterestsPerField),
  favouriteAnimals: tagInput(HARD_LIMITS.maxInterestsPerField),
  favouriteActivities: tagInput(HARD_LIMITS.maxInterestsPerField),
  favouriteCharacters: tagInput(HARD_LIMITS.maxInterestsPerField),
  personalityTraits: tagInput(HARD_LIMITS.maxInterestsPerField),
  learningInterests: tagInput(HARD_LIMITS.maxInterestsPerField),
  parentNotes: z.string().trim().max(HARD_LIMITS.maxParentNotesChars).optional().or(z.literal('')),
  avatarColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .or(z.literal('')),
  /**
   * An appearance description the parent writes themselves. Preferred over
   * a photograph: it gives the illustrator the consistency it needs
   * without storing a picture of a child (§3, §24).
   */
  appearanceDescription: z.string().trim().max(600).optional().or(z.literal('')),
});

export type ChildInput = z.infer<typeof childInputSchema>;

export const childIdSchema = z.string().uuid('That child could not be found.');
