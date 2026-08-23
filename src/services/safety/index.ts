import 'server-only';

import { errors } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { truncate } from '@/lib/utils';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getSetting } from '@/services/config/settings';
import { recordUsage } from '@/services/usage/tracker';
import { moderationProvider } from '@/services/providers';
import type { ModerationOutcome, ModerationStage } from '@/types/database';

/**
 * The AI safety layer (§7).
 *
 * Called at three points:
 *   1. on the parent's free-text request, before any paid call is made
 *   2. on the generated story text, before it is stored or shown
 *   3. on each illustration prompt, before it reaches the image model
 *
 * Every check is logged as a `moderation_event` -- including the allowed
 * ones at the input stage -- so the admin area shows real signal about
 * what people are asking for.
 */
const log = createLogger('safety');

export interface ModerationContext {
  ownerId: string | null;
  storyId?: string | null;
  jobId?: string | null;
  stage: ModerationStage;
}

export interface SafetyCheckResult {
  allowed: boolean;
  categories: string[];
}

export async function checkText(text: string, context: ModerationContext): Promise<SafetyCheckResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { allowed: true, categories: [] };

  const [models, safety] = await Promise.all([getSetting('ai_models'), getSetting('safety')]);
  const provider = moderationProvider();

  const { value, usage } = await provider.check(trimmed, models.moderation, safety.blocked_input_categories);

  const outcome: ModerationOutcome = value.blocked ? 'blocked' : value.flagged ? 'flagged' : 'allowed';

  await Promise.all([
    recordUsage({
      ownerId: context.ownerId,
      storyId: context.storyId ?? null,
      jobId: context.jobId ?? null,
      operation: 'moderation',
      usage,
    }),
    recordModerationEvent({ ...context, outcome, value, excerpt: trimmed }),
  ]);

  if (value.blocked) {
    log.warn('content blocked', { stage: context.stage, categories: value.categories });
  }

  return { allowed: !value.blocked, categories: value.categories };
}

/** Checks and throws, for call sites where a block must stop the flow. */
export async function assertSafe(text: string, context: ModerationContext): Promise<void> {
  const result = await checkText(text, context);
  if (!result.allowed) throw errors.contentBlocked(result.categories);
}

async function recordModerationEvent(input: {
  ownerId: string | null;
  storyId?: string | null;
  jobId?: string | null;
  stage: ModerationStage;
  outcome: ModerationOutcome;
  value: { categories: string[]; scores: Record<string, number> };
  excerpt: string;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from('moderation_events')
      .insert({
        owner_id: input.ownerId,
        story_id: input.storyId ?? null,
        job_id: input.jobId ?? null,
        stage: input.stage,
        outcome: input.outcome,
        provider: 'openai',
        categories: input.value.categories,
        scores: input.value.scores,
        // Only enough text for a reviewer to understand the flag. The
        // full offending input is never persisted (§24).
        excerpt: input.outcome === 'allowed' ? null : truncate(input.excerpt, 400),
      });
    if (error) throw error;
  } catch (error) {
    log.error('could not record moderation event', { error: String(error) });
  }
}

/**
 * A cheap structural check on the parent's free-text instructions, run
 * before the moderation call. Catches prompt-injection shapes that are not
 * "harmful content" but should still not steer the generator.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any )?(previous|prior|above) instructions/i,
  /disregard (the )?(system|previous) (prompt|instructions)/i,
  /you are (now|actually) (a|an) /i,
  /\bsystem prompt\b/i,
  /<\|.*?\|>/,
];

export function looksLikePromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
