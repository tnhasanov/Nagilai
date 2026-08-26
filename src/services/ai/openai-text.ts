import 'server-only';

import { AppError } from '@/lib/errors';
import { createLogger, describeError } from '@/lib/logger';
import type { GeneratedStory, StoryRequest } from '@/types/domain';
import { callOpenAi, openaiClient } from './openai-client';
import { buildSystemPrompt, buildUserPrompt, PROMPT_VERSION } from './prompts';
import { generatedStorySchema, STORY_JSON_SCHEMA } from './schema';
import type { ProviderResult, StoryGenerationOptions, TextProvider } from './types';

const log = createLogger('ai:openai-text');

/**
 * Story text generation on the OpenAI Responses API with structured
 * outputs.
 *
 * The provider guarantees the JSON *shape*; this module still validates
 * the *content* (page numbering, page count, non-empty text) because a
 * schema-valid but nonsensical response would otherwise reach a child.
 */
export class OpenAiTextProvider implements TextProvider {
  readonly name = 'openai';

  async generateStory(
    request: StoryRequest,
    options: StoryGenerationOptions,
  ): Promise<ProviderResult<GeneratedStory>> {
    const client = openaiClient();
    const system = buildSystemPrompt(request, options.targetPages, options.wordsPerPage);
    const user = buildUserPrompt(request);
    const startedAt = Date.now();

    const response = await callOpenAi(
      () =>
        client.responses.create({
          model: options.model,
          instructions: system,
          input: [{ role: 'user', content: user }],
          max_output_tokens: options.maxOutputTokens,
          ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
          text: {
            format: {
              type: 'json_schema',
              name: 'children_picture_book',
              strict: true,
              schema: STORY_JSON_SCHEMA as unknown as Record<string, unknown>,
            },
          },
        }),
      { label: 'openai.responses.create', attempts: 3 },
    );

    const durationMs = Date.now() - startedAt;

    if (response.status === 'incomplete') {
      throw new AppError(
        'provider_invalid_response',
        `Story generation stopped early: ${response.incomplete_details?.reason ?? 'unknown'}`,
        {
          userMessage: 'Your story was cut short while being written. Please try again.',
          retryable: true,
        },
      );
    }

    const text = response.output_text;
    if (!text) {
      throw new AppError('provider_invalid_response', 'Model returned no text output');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      log.error('model returned invalid JSON', { ...describeError(error), preview: text.slice(0, 300) });
      throw new AppError('provider_invalid_response', 'Model returned malformed JSON');
    }

    const result = generatedStorySchema.safeParse(parsed);
    if (!result.success) {
      log.error('model output failed validation', {
        issues: result.error.issues.slice(0, 8).map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      throw new AppError('provider_invalid_response', 'Model output did not match the story contract');
    }

    const story = normaliseStory(result.data, options.targetPages);

    return {
      value: story,
      usage: {
        provider: this.name,
        model: response.model ?? options.model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
        reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
        durationMs,
      },
    };
  }
}

/**
 * Repairs the things a model plausibly gets wrong even under a strict
 * schema: duplicate or gapped page numbers, blank pages, and a page count
 * that drifted from what was asked for.
 */
function normaliseStory(story: GeneratedStory, targetPages: number): GeneratedStory {
  const pages = story.pages
    .filter((page) => page.text.trim().length > 0)
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page, index) => ({ ...page, pageNumber: index + 1 }));

  if (pages.length === 0) {
    throw new AppError('provider_invalid_response', 'Model returned a story with no pages');
  }

  // A book that came back far shorter than requested is a quality failure,
  // not something to silently accept.
  if (pages.length < Math.ceil(targetPages / 2)) {
    throw new AppError(
      'provider_invalid_response',
      `Model returned ${pages.length} pages when ${targetPages} were requested`,
      { retryable: true },
    );
  }

  return {
    ...story,
    title: story.title.trim(),
    pages,
    discussionQuestions: story.discussionQuestions.map((q) => q.trim()).filter(Boolean),
  };
}

export const TEXT_PROMPT_VERSION = PROMPT_VERSION;
