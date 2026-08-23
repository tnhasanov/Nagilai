import 'server-only';

import { createLogger, describeError } from '@/lib/logger';
import { isRetryableOpenAiError, openaiClient } from './openai-client';
import { withRetry } from '@/lib/retry';
import type { ModerationProvider, ModerationVerdict, ProviderResult } from './types';

const log = createLogger('ai:moderation');

/**
 * The safety layer (§7).
 *
 * Fail-closed on anything that classifies as harmful; fail-*open* only
 * when the moderation service itself is unreachable, because refusing to
 * generate any story during a provider outage is a worse product outcome
 * than one unclassified prompt -- and the story prompt itself already
 * constrains content heavily. An unreachable classifier is recorded as a
 * flagged moderation event so it shows up in the admin area.
 */
export class OpenAiModerationProvider implements ModerationProvider {
  readonly name = 'openai';

  async check(
    text: string,
    model: string,
    blockedCategories: string[],
  ): Promise<ProviderResult<ModerationVerdict>> {
    const startedAt = Date.now();
    const client = openaiClient();

    try {
      const response = await withRetry(
        () => client.moderations.create({ model, input: text.slice(0, 20_000) }),
        { label: 'openai.moderations.create', attempts: 2, isRetryable: isRetryableOpenAiError },
      );

      const result = response.results[0];
      if (!result) {
        return this.unknownVerdict(model, startedAt, 'empty moderation response');
      }

      const categories = Object.entries(result.categories as unknown as Record<string, boolean | null>)
        .filter(([, value]) => value === true)
        .map(([key]) => key);

      const scores = Object.fromEntries(
        Object.entries(result.category_scores as unknown as Record<string, number | null>).map(([key, value]) => [
          key,
          value ?? 0,
        ]),
      );

      const blocked = categories.some((category) => blockedCategories.includes(category));

      return {
        value: { flagged: result.flagged, blocked, categories, scores },
        usage: {
          provider: this.name,
          model,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      log.warn('moderation unavailable, failing open', describeError(error));
      return this.unknownVerdict(model, startedAt, 'moderation provider unavailable');
    }
  }

  private unknownVerdict(model: string, startedAt: number, reason: string): ProviderResult<ModerationVerdict> {
    return {
      value: { flagged: true, blocked: false, categories: [`unavailable:${reason}`], scores: {} },
      usage: {
        provider: this.name,
        model,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startedAt,
      },
    };
  }
}
