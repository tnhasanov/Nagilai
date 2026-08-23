import 'server-only';

import { AppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { countWords, estimateReadingMinutes } from '@/lib/utils';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getLengthSpec, getSetting } from '@/services/config/settings';
import { textProvider } from '@/services/providers';
import { TEXT_PROMPT_VERSION } from '@/services/ai/openai-text';
import { checkText } from '@/services/safety';
import * as credits from '@/services/credits';
import { recordUsage } from '@/services/usage/tracker';
import { markFailed, recomputeStatus, setStatus } from '@/services/stories/status';
import { enqueueMany } from '@/services/jobs/queue';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS } from '@/config/constants';
import type { ChildSnapshot, GeneratedStory, StoryRequest } from '@/types/domain';
import type { GenerationJob } from '@/types/domain';
import type { Json } from '@/types/database';

/**
 * Generates the text of a story (§5).
 *
 * Ordering matters here and is the reason this is a job rather than a
 * request handler:
 *
 *   charge → generate → moderate the output → persist → fan out images
 *
 * The charge happens before the provider call so a parent cannot start ten
 * concurrent generations on three credits; the idempotency key is derived
 * from the story version, so a retry of *this* job never charges twice.
 * A permanent failure refunds.
 */
const log = createLogger('jobs:story-text');

export async function handleStoryText(job: GenerationJob): Promise<Record<string, unknown>> {
  const admin = supabaseAdmin();

  if (!job.story_id || !job.version_id || !job.owner_id) {
    throw new AppError('validation_failed', 'story_text job is missing story, version or owner', {
      retryable: false,
    });
  }

  const { data: story, error: storyError } = await admin
    .from('stories')
    .select('*')
    .eq('id', job.story_id)
    .single();

  if (storyError || !story) {
    throw new AppError('not_found', `Story ${job.story_id} disappeared before generation`, { retryable: false });
  }

  await setStatus(story.id, 'generating_text', 'Writing the story');

  const request = await buildRequest(story);
  const spec = await getLengthSpec(story.length);
  const models = await getSetting('ai_models');

  const spendKey = `story:${story.id}:v${job.version_id}:text`;
  await credits.spend({
    ownerId: job.owner_id,
    kind: 'story_text',
    idempotencyKey: spendKey,
    storyId: story.id,
    jobId: job.id,
    note: 'Story text generation',
  });

  let generated: GeneratedStory;
  try {
    const result = await textProvider().generateStory(request, {
      model: models.text,
      maxOutputTokens: spec.maxOutputTokens,
      targetPages: spec.pages,
      wordsPerPage: spec.wordsPerPage,
    });
    generated = result.value;

    await recordUsage({
      ownerId: job.owner_id,
      storyId: story.id,
      versionId: job.version_id,
      jobId: job.id,
      operation: 'text_generation',
      usage: result.usage,
    });
  } catch (error) {
    // Only refund once we know we will not retry -- a retryable failure
    // reuses the same idempotency key and must not be paid for twice.
    if (job.attempts >= job.max_attempts) {
      await refundText(job, story.id);
      await markFailed(story.id, 'Story generation failed');
      await capture({
        name: ANALYTICS_EVENTS.storyGenerationFailed,
        ownerId: job.owner_id,
        properties: { stage: 'text', language: story.language_code, theme: story.theme_slug },
      });
    }
    throw error;
  }

  // §7: the generated text is moderated before it is stored, not after it
  // has already been shown to a child.
  const bodyText = generated.pages.map((page) => page.text).join('\n\n');
  const verdict = await checkText(`${generated.title}\n\n${bodyText}`, {
    ownerId: job.owner_id,
    storyId: story.id,
    jobId: job.id,
    stage: 'generated_text',
  });

  if (!verdict.allowed) {
    await refundText(job, story.id);
    await markFailed(story.id, 'The generated story did not pass our safety checks');
    throw new AppError('content_blocked', `Generated story blocked: ${verdict.categories.join(', ')}`, {
      retryable: false,
      userMessage:
        "We weren't happy with the story that came back, so we didn't keep it. Your credit has been returned - please try a different idea.",
    });
  }

  await persist({ story, versionId: job.version_id, generated, model: models.text });

  const features = await getSetting('features');
  const shouldIllustrate = features.illustrations_enabled && story.illustration_style_slug !== null;

  if (shouldIllustrate) {
    await setStatus(story.id, 'generating_images', 'Painting the pictures');
    await fanOutIllustrations({
      ownerId: job.owner_id,
      storyId: story.id,
      versionId: job.version_id,
      pageCount: generated.pages.length,
    });
  } else {
    await setStatus(story.id, 'ready');
  }

  await recomputeStatus(story.id);

  await capture({
    name: ANALYTICS_EVENTS.storyGenerated,
    ownerId: job.owner_id,
    properties: {
      language: story.language_code,
      theme: story.theme_slug,
      length: story.length,
      pages: generated.pages.length,
      illustrated: shouldIllustrate,
    },
  });

  log.info('story text generated', { storyId: story.id, pages: generated.pages.length });
  return { pages: generated.pages.length, title: generated.title };
}

async function refundText(job: GenerationJob, storyId: string): Promise<void> {
  if (!job.owner_id) return;
  const amount = await credits.costOf('story_text');
  await credits.refund({
    ownerId: job.owner_id,
    amount,
    idempotencyKey: `refund:${job.id}:text`,
    storyId,
    note: 'Story text generation failed',
  });
}

/** Assembles the generation request from the frozen story recipe. */
async function buildRequest(story: {
  child_snapshot: Json;
  language_code: string;
  theme_slug: string;
  objective_slug: string | null;
  length: 'short' | 'medium' | 'long';
  custom_instructions: string | null;
  remixed_from_story_id: string | null;
  remix_kind: string | null;
  child_id: string | null;
}): Promise<StoryRequest> {
  const admin = supabaseAdmin();

  const [{ data: language }, { data: theme }, { data: objective }] = await Promise.all([
    admin.from('languages').select('style_guidance').eq('code', story.language_code).maybeSingle(),
    admin.from('themes').select('prompt_guidance').eq('slug', story.theme_slug).maybeSingle(),
    story.objective_slug
      ? admin
          .from('educational_objectives')
          .select('prompt_guidance')
          .eq('slug', story.objective_slug)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const request: StoryRequest = {
    childId: story.child_id,
    child: story.child_snapshot as unknown as ChildSnapshot,
    languageCode: story.language_code,
    themeSlug: story.theme_slug,
    themeGuidance: theme?.prompt_guidance ?? null,
    objectiveSlug: story.objective_slug,
    objectiveGuidance: objective?.prompt_guidance ?? null,
    length: story.length,
    customInstructions: story.custom_instructions,
    languageGuidance: language?.style_guidance ?? null,
  };

  if (story.remixed_from_story_id && story.remix_kind) {
    const original = await loadOriginalForRemix(story.remixed_from_story_id);
    if (original) request.remixOf = { kind: story.remix_kind, ...original };
  }

  return request;
}

async function loadOriginalForRemix(originalStoryId: string) {
  const admin = supabaseAdmin();
  const { data: original } = await admin
    .from('stories')
    .select('title, summary, current_version_id')
    .eq('id', originalStoryId)
    .maybeSingle();

  if (!original?.current_version_id) return null;

  const { data: pages } = await admin
    .from('story_pages')
    .select('text')
    .eq('version_id', original.current_version_id)
    .order('page_number');

  return {
    originalTitle: original.title ?? '',
    originalSummary: original.summary ?? '',
    originalPages: (pages ?? []).map((page) => page.text),
  };
}

/** Writes the generated document into the relational schema (§23). */
async function persist(input: {
  story: { id: string };
  versionId: string;
  generated: GeneratedStory;
  model: string;
}): Promise<void> {
  const admin = supabaseAdmin();
  const { generated, versionId } = input;

  const wordCount = generated.pages.reduce((total, page) => total + countWords(page.text), 0);

  const { error: versionError } = await admin
    .from('story_versions')
    .update({
      title: generated.title,
      subtitle: generated.subtitle || null,
      summary: generated.summary || null,
      cover_concept: generated.coverConcept || null,
      educational_takeaway: generated.educationalTakeaway || null,
      discussion_questions: generated.discussionQuestions,
      character_bible: generated.characterBible as unknown as Json,
      generation_meta: {
        model: input.model,
        prompt_version: TEXT_PROMPT_VERSION,
        generated_at: new Date().toISOString(),
      } as Json,
      word_count: wordCount,
      reading_minutes: estimateReadingMinutes(wordCount),
      status: 'ready',
    })
    .eq('id', versionId);

  if (versionError) throw new AppError('internal', `Could not save story version: ${versionError.message}`);

  // Replace rather than append, so a retry after a partial write does not
  // leave duplicate pages behind.
  await admin.from('story_pages').delete().eq('version_id', versionId);

  const { error: pagesError } = await admin.from('story_pages').insert(
    generated.pages.map((page) => ({
      version_id: versionId,
      story_id: input.story.id,
      page_number: page.pageNumber,
      text: page.text,
      scene_summary: page.sceneSummary || null,
      illustration_prompt: page.illustrationPrompt || null,
      layout: page.pageNumber % 2 === 0 ? 'illustration_left' : 'illustration_right',
    })),
  );

  if (pagesError) throw new AppError('internal', `Could not save story pages: ${pagesError.message}`);

  const { error: storyError } = await admin
    .from('stories')
    .update({
      title: generated.title,
      subtitle: generated.subtitle || null,
      summary: generated.summary || null,
      dedication: generated.dedication || null,
    })
    .eq('id', input.story.id);

  if (storyError) throw new AppError('internal', `Could not update story: ${storyError.message}`);
}

/**
 * Enqueues one job per page plus the cover.
 *
 * The cover runs first (priority 10) because it is what the library card
 * and the share preview show, so the book looks finished sooner.
 */
async function fanOutIllustrations(input: {
  ownerId: string;
  storyId: string;
  versionId: string;
  pageCount: number;
}): Promise<void> {
  const admin = supabaseAdmin();

  const { data: pages } = await admin
    .from('story_pages')
    .select('id, page_number')
    .eq('version_id', input.versionId)
    .order('page_number');

  await enqueueMany([
    {
      type: 'story_cover',
      ownerId: input.ownerId,
      storyId: input.storyId,
      versionId: input.versionId,
      priority: 10,
      idempotencyKey: `illustration:${input.versionId}:cover`,
    },
    ...(pages ?? []).map((page) => ({
      type: 'story_illustration' as const,
      ownerId: input.ownerId,
      storyId: input.storyId,
      versionId: input.versionId,
      pageId: page.id,
      priority: 50 + page.page_number,
      idempotencyKey: `illustration:${input.versionId}:page:${page.id}`,
    })),
  ]);
}
