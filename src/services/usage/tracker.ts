import 'server-only';

import { createLogger } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getSetting } from '@/services/config/settings';
import type { AiOperation } from '@/types/database';
import type { UsageMetrics } from '@/services/ai/types';

/**
 * AI usage and cost tracking (§17).
 *
 * Every billable provider call lands here. Cost is computed from the rate
 * card in `app_settings.ai_pricing` and stored in integer micro-USD, along
 * with a snapshot of the rates used -- so a later price change does not
 * silently rewrite last month's reported margin.
 *
 * Recording usage must never fail the operation it is measuring: a broken
 * cost row is an admin problem, not a customer-facing one.
 */
const log = createLogger('usage');

export interface RecordUsageInput {
  ownerId: string | null;
  storyId?: string | null;
  versionId?: string | null;
  jobId?: string | null;
  operation: AiOperation;
  usage: UsageMetrics;
  succeeded?: boolean;
  errorCode?: string | null;
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const { costMicroUsd, unitCosts } = await estimateCost(input.operation, input.usage);

    const { error } = await supabaseAdmin()
      .from('usage_events')
      .insert({
        owner_id: input.ownerId,
        story_id: input.storyId ?? null,
        version_id: input.versionId ?? null,
        job_id: input.jobId ?? null,
        provider: input.usage.provider,
        model: input.usage.model,
        operation: input.operation,
        input_tokens: input.usage.inputTokens ?? null,
        output_tokens: input.usage.outputTokens ?? null,
        cached_input_tokens: input.usage.cachedInputTokens ?? null,
        reasoning_tokens: input.usage.reasoningTokens ?? null,
        image_count: input.usage.imageCount ?? null,
        image_size: input.usage.imageSize ?? null,
        audio_characters: input.usage.audioCharacters ?? null,
        audio_seconds: input.usage.audioSeconds ?? null,
        estimated_cost_micro_usd: costMicroUsd,
        unit_costs: unitCosts,
        duration_ms: input.usage.durationMs,
        succeeded: input.succeeded ?? true,
        error_code: input.errorCode ?? null,
      });

    if (error) throw error;
  } catch (error) {
    log.error('failed to record usage', { operation: input.operation, error: String(error) });
  }
}

/**
 * Converts provider-native units into micro-USD.
 *
 * Returns zero rather than guessing when a model has no configured rate:
 * a visible zero in the admin cost report is a prompt to add the rate,
 * whereas an invented number quietly corrupts the margin figures.
 */
export async function estimateCost(
  operation: AiOperation,
  usage: UsageMetrics,
): Promise<{ costMicroUsd: number; unitCosts: Record<string, number> | null }> {
  const pricing = await getSetting('ai_pricing');

  if (operation === 'text_generation') {
    const rate = pricing.text[usage.model];
    if (!rate) return { costMicroUsd: 0, unitCosts: null };

    const cachedInput = usage.cachedInputTokens ?? 0;
    const freshInput = Math.max(0, (usage.inputTokens ?? 0) - cachedInput);
    const output = usage.outputTokens ?? 0;

    const cost =
      (freshInput / 1000) * rate.input_micro_usd_per_1k +
      (cachedInput / 1000) * rate.cached_input_micro_usd_per_1k +
      (output / 1000) * rate.output_micro_usd_per_1k;

    return { costMicroUsd: Math.round(cost), unitCosts: rate };
  }

  if (operation === 'image_generation') {
    const modelRates = pricing.image[usage.model];
    if (!modelRates) return { costMicroUsd: 0, unitCosts: null };
    const quality = usage.imageQuality ?? 'medium';
    const perImage = modelRates[quality] ?? modelRates['medium'] ?? 0;
    return {
      costMicroUsd: Math.round(perImage * (usage.imageCount ?? 1)),
      unitCosts: { per_image_micro_usd: perImage },
    };
  }

  if (operation === 'speech_synthesis') {
    const rate = pricing.speech[usage.model];
    if (!rate) return { costMicroUsd: 0, unitCosts: null };
    const characters = usage.audioCharacters ?? 0;
    return {
      costMicroUsd: Math.round((characters / 1000) * rate.micro_usd_per_1k_characters),
      unitCosts: rate,
    };
  }

  // Moderation is currently free; embeddings are not used in Phase 1.
  return { costMicroUsd: 0, unitCosts: null };
}
