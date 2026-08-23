import type {
  AssetStatus,
  Json,
  StoryLength,
  StoryStatus,
  Tables,
} from './database';

/**
 * Domain shapes used across the app. These sit above the generated
 * database row types and describe the objects the UI actually reads.
 */

/** A localised label map keyed by BCP-47 code, e.g. `{ "en-US": "Adventure" }`. */
export type LocalisedText = Record<string, string>;

export function localise(
  labels: Json | LocalisedText | null | undefined,
  locale: string,
  fallbackLocale = 'en-US',
): string {
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return '';
  const map = labels as Record<string, unknown>;
  const candidates = [locale, locale.split('-')[0] ?? locale, fallbackLocale, 'en-US'];
  for (const key of candidates) {
    const direct = map[key];
    if (typeof direct === 'string' && direct.length > 0) return direct;
    // Tolerate a stored bare language code where a full tag was asked for.
    const prefixed = Object.keys(map).find((k) => k.split('-')[0] === key.split('-')[0]);
    if (prefixed) {
      const value = map[prefixed];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  const first = Object.values(map).find((v) => typeof v === 'string' && v.length > 0);
  return typeof first === 'string' ? first : '';
}

/* ---------------------------------------------------------------------
 * Story generation
 * ------------------------------------------------------------------- */

/**
 * The redacted child details that are handed to the model and frozen onto
 * the story. Deliberately narrower than the `children` row: no birth date,
 * no photo path, no record id.
 */
export interface ChildSnapshot {
  display_name: string;
  age_years: number | null;
  gender: string | null;
  interests: string[];
  favourite_animals: string[];
  favourite_activities: string[];
  favourite_characters: string[];
  personality_traits: string[];
  learning_interests: string[];
  parent_notes: string | null;
  appearance_description: string | null;
}

export interface StoryRequest {
  childId: string | null;
  child: ChildSnapshot;
  languageCode: string;
  themeSlug: string;
  themeGuidance: string | null;
  objectiveSlug: string | null;
  objectiveGuidance: string | null;
  length: StoryLength;
  customInstructions: string | null;
  languageGuidance: string | null;
  /** Set when this generation is a remix of an existing story (§12). */
  remixOf?: {
    kind: string;
    originalTitle: string;
    originalSummary: string;
    originalPages: string[];
  };
}

/** The structured document the text model must return (§5). */
export interface GeneratedStory {
  title: string;
  subtitle: string;
  summary: string;
  dedication: string;
  coverConcept: string;
  characterBible: CharacterBible;
  pages: GeneratedPage[];
  educationalTakeaway: string;
  discussionQuestions: string[];
}

/**
 * The character sheet that keeps illustrations consistent across a book.
 * Generated once, then merged into every page's image prompt (§8).
 */
export interface CharacterBible {
  protagonist: {
    name: string;
    appearance: string;
    clothing: string;
    hairstyle: string;
    distinguishingFeatures: string;
  };
  supportingCharacters: Array<{ name: string; appearance: string }>;
  worldPalette: string;
  artDirection: string;
}

export interface GeneratedPage {
  pageNumber: number;
  text: string;
  sceneSummary: string;
  illustrationPrompt: string;
}

/* ---------------------------------------------------------------------
 * Reader
 * ------------------------------------------------------------------- */

export interface ReaderIllustration {
  id: string;
  url: string | null;
  width: number | null;
  height: number | null;
  status: AssetStatus;
}

export interface ReaderPage {
  id: string;
  pageNumber: number;
  text: string;
  layout: string;
  illustration: ReaderIllustration | null;
}

export interface ReaderNarration {
  id: string;
  url: string | null;
  durationSeconds: number | null;
  voiceSlug: string;
  status: AssetStatus;
  timings: NarrationTiming[] | null;
}

export interface NarrationTiming {
  pageNumber: number;
  startSeconds: number;
  endSeconds: number;
}

export interface ReaderStory {
  id: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  dedication: string | null;
  languageCode: string;
  themeSlug: string;
  status: StoryStatus;
  statusMessage: string | null;
  childDisplayName: string | null;
  educationalTakeaway: string | null;
  discussionQuestions: string[];
  isFavourite: boolean;
  createdAt: string;
  versionId: string;
  cover: ReaderIllustration | null;
  pages: ReaderPage[];
  narration: ReaderNarration | null;
  /** Present only for the owner; a shared reader gets `null`. */
  ownerControls: {
    canNarrate: boolean;
    canDownloadPdf: boolean;
    canShare: boolean;
    canRemix: boolean;
  } | null;
}

/* ---------------------------------------------------------------------
 * Library
 * ------------------------------------------------------------------- */

export interface LibraryCard {
  id: string;
  title: string;
  subtitle: string | null;
  status: StoryStatus;
  languageCode: string;
  themeSlug: string;
  childDisplayName: string | null;
  isFavourite: boolean;
  createdAt: string;
  coverUrl: string | null;
  pageCount: number;
  hasNarration: boolean;
  isShared: boolean;
}

/* ---------------------------------------------------------------------
 * Convenience aliases over generated rows
 * ------------------------------------------------------------------- */

export type Profile = Tables<'profiles'>;
export type Child = Tables<'children'>;
export type Story = Tables<'stories'>;
export type StoryVersion = Tables<'story_versions'>;
export type StoryPage = Tables<'story_pages'>;
export type StoryIllustration = Tables<'story_illustrations'>;
export type Narration = Tables<'narrations'>;
export type StoryPdf = Tables<'story_pdfs'>;
export type ShareLink = Tables<'share_links'>;
export type GenerationJob = Tables<'generation_jobs'>;
export type Theme = Tables<'themes'>;
export type Language = Tables<'languages'>;
export type Voice = Tables<'voices'>;
export type IllustrationStyle = Tables<'illustration_styles'>;
export type EducationalObjective = Tables<'educational_objectives'>;
