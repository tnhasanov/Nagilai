import 'server-only';

import { AppError, errors } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getSetting } from '@/services/config/settings';
import * as credits from '@/services/credits';
import { enforce } from '@/services/ratelimit';
import { assertSafe, looksLikePromptInjection } from '@/services/safety';
import { enqueue } from '@/services/jobs/queue';
import { kickWorker } from '@/services/jobs/worker';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS } from '@/config/constants';
import type { ChildSnapshot } from '@/types/domain';
import type { Json, RemixKind, StoryLength } from '@/types/database';

/**
 * Story creation (§4, §5, §27).
 *
 * The whole point of this function is that it is *fast*. It validates,
 * takes a redacted snapshot of the child, writes the story and its first
 * version, and enqueues one job. Nothing here calls a model, so the parent
 * gets their progress screen immediately and the expensive work happens on
 * the worker.
 *
 * Order of guards is deliberate: rate limit, then safety, then
 * affordability. The cheapest rejection comes first, and no paid call is
 * made before all three pass.
 */
const log = createLogger('stories:create');

export interface CreateStoryParams {
  ownerId: string;
  childId: string;
  languageCode: string;
  themeSlug: string;
  objectiveSlug: string | null;
  illustrationStyleSlug: string | null;
  length: StoryLength;
  customInstructions: string | null;
  dedication: string | null;
  remix?: { fromStoryId: string; kind: RemixKind };
}

export async function createStory(params: CreateStoryParams): Promise<{ storyId: string }> {
  const admin = supabaseAdmin();

  await enforce('story_create', params.ownerId);

  const [child, theme, language, style, objective, features, limits] = await Promise.all([
    loadChild(params.ownerId, params.childId),
    loadTheme(params.themeSlug),
    loadLanguage(params.languageCode),
    params.illustrationStyleSlug ? loadStyle(params.illustrationStyleSlug) : Promise.resolve(null),
    params.objectiveSlug ? loadObjective(params.objectiveSlug) : Promise.resolve(null),
    getSetting('features'),
    getSetting('generation_limits'),
  ]);

  if (params.customInstructions) {
    if (looksLikePromptInjection(params.customInstructions)) {
      throw errors.validation(
        'Please describe the story you would like in your own words, rather than giving instructions to the system.',
      );
    }
    await assertSafe(params.customInstructions, { ownerId: params.ownerId, stage: 'user_input' });
  }

  // Check affordability before writing anything, so a parent out of
  // credits gets a clear message instead of a story stuck in `queued`.
  //
  // The estimate covers the *whole* book, not just its first job.
  // Illustrations are charged per image and a story fans out to one image
  // per page plus a cover, so checking only the text cost would let a
  // parent start a book that runs out of credits partway through -- and
  // `insufficient_credits` is not retryable, so those images would
  // dead-letter rather than wait.
  const illustrationsWanted = features.illustrations_enabled && style !== null;
  const [textCost, illustrationCost, balance] = await Promise.all([
    credits.costOf('story_text'),
    credits.costOf('story_illustration'),
    credits.getBalance(params.ownerId),
  ]);
  const estimate = credits.estimateStoryCost({
    pages: limits[params.length].pages,
    illustrated: illustrationsWanted,
    textCost,
    illustrationCost,
  });
  if (balance < estimate.total) {
    throw errors.insufficientCredits(estimate.total, balance);
  }

  const snapshot = redactChild(child);

  const { data: story, error: storyError } = await admin
    .from('stories')
    .insert({
      owner_id: params.ownerId,
      child_id: child.id,
      language_code: language.code,
      theme_id: theme.id,
      theme_slug: theme.slug,
      objective_id: objective?.id ?? null,
      objective_slug: objective?.slug ?? null,
      illustration_style_id: style?.id ?? null,
      illustration_style_slug: illustrationsWanted ? (style?.slug ?? null) : null,
      length: params.length,
      custom_instructions: params.customInstructions,
      dedication: params.dedication,
      child_snapshot: snapshot as unknown as Json,
      status: 'queued',
      status_message: 'Getting ready',
      remixed_from_story_id: params.remix?.fromStoryId ?? null,
      remix_kind: params.remix?.kind ?? null,
    })
    .select('id')
    .single();

  if (storyError || !story) {
    throw new AppError('internal', `Could not create story: ${storyError?.message}`);
  }

  const { data: version, error: versionError } = await admin
    .from('story_versions')
    .insert({ story_id: story.id, version_number: 1, status: 'pending' })
    .select('id')
    .single();

  if (versionError || !version) {
    throw new AppError('internal', `Could not create story version: ${versionError?.message}`);
  }

  await admin.from('stories').update({ current_version_id: version.id }).eq('id', story.id);

  await enqueue({
    type: 'story_text',
    ownerId: params.ownerId,
    storyId: story.id,
    versionId: version.id,
    priority: 10,
    idempotencyKey: `story_text:${version.id}`,
  });

  kickWorker();

  await capture({
    name: ANALYTICS_EVENTS.storyStarted,
    ownerId: params.ownerId,
    properties: {
      language: language.code,
      theme: theme.slug,
      length: params.length,
      illustrated: illustrationsWanted,
      remix: Boolean(params.remix),
    },
  });

  log.info('story created', { storyId: story.id, theme: theme.slug, language: language.code });
  return { storyId: story.id };
}

/**
 * Builds the frozen snapshot handed to the model (§5, §21).
 *
 * Only what the story genuinely needs. The child's record id, birth date
 * and photo path are all deliberately absent -- this object is the one
 * that survives onto the story row and is read by share pages.
 */
export function redactChild(child: {
  name: string;
  nickname: string | null;
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
}): ChildSnapshot {
  return {
    display_name: (child.nickname?.trim() || child.name).trim(),
    age_years: child.age_years,
    gender: child.gender,
    interests: child.interests,
    favourite_animals: child.favourite_animals,
    favourite_activities: child.favourite_activities,
    favourite_characters: child.favourite_characters,
    personality_traits: child.personality_traits,
    learning_interests: child.learning_interests,
    parent_notes: child.parent_notes,
    appearance_description: child.appearance_description,
  };
}

async function loadChild(ownerId: string, childId: string) {
  const { data, error } = await supabaseAdmin()
    .from('children')
    .select('*')
    .eq('id', childId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error || !data) throw errors.notFound('Child');
  return data;
}

async function loadTheme(slug: string) {
  const { data } = await supabaseAdmin()
    .from('themes')
    .select('id, slug, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (!data?.is_active) throw errors.validation('That story type is not available.');
  return data;
}

async function loadLanguage(code: string) {
  const { data } = await supabaseAdmin()
    .from('languages')
    .select('code, is_active, is_story_language')
    .eq('code', code)
    .maybeSingle();

  if (!data?.is_active || !data.is_story_language) {
    throw errors.validation('That language is not available yet.');
  }
  return data;
}

async function loadStyle(slug: string) {
  const { data } = await supabaseAdmin()
    .from('illustration_styles')
    .select('id, slug, is_active, is_premium')
    .eq('slug', slug)
    .maybeSingle();

  if (!data?.is_active) throw errors.validation('That illustration style is not available.');
  return data;
}

async function loadObjective(slug: string) {
  const { data } = await supabaseAdmin()
    .from('educational_objectives')
    .select('id, slug, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (!data?.is_active) throw errors.validation('That learning goal is not available.');
  return data;
}
