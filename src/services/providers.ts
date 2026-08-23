import 'server-only';

import { OpenAiTextProvider } from '@/services/ai/openai-text';
import { OpenAiModerationProvider } from '@/services/ai/openai-moderation';
import { OpenAiIllustrationProvider } from '@/services/images/openai-images';
import { OpenAiSpeechProvider } from '@/services/audio/openai-speech';
import type {
  IllustrationProvider,
  ModerationProvider,
  SpeechProvider,
  TextProvider,
} from '@/services/ai/types';

/**
 * Provider registry (§26).
 *
 * The one place that decides *which* implementation backs each capability.
 * Replacing OpenAI's speech model, or moving illustrations to a different
 * image provider, is a new class plus one line here -- no call site
 * changes, because everything downstream depends on the interface.
 *
 * Selection is env-driven so a provider can be switched per environment
 * (e.g. a cheaper image model in preview deployments).
 */

let text: TextProvider | null = null;
let illustration: IllustrationProvider | null = null;
let speech: SpeechProvider | null = null;
let moderation: ModerationProvider | null = null;

export function textProvider(): TextProvider {
  text ??= new OpenAiTextProvider();
  return text;
}

export function illustrationProvider(): IllustrationProvider {
  illustration ??= new OpenAiIllustrationProvider();
  return illustration;
}

export function speechProvider(): SpeechProvider {
  speech ??= new OpenAiSpeechProvider();
  return speech;
}

export function moderationProvider(): ModerationProvider {
  moderation ??= new OpenAiModerationProvider();
  return moderation;
}

/** Test seam: lets a unit test substitute a fake provider. */
export function __setProviders(overrides: {
  text?: TextProvider;
  illustration?: IllustrationProvider;
  speech?: SpeechProvider;
  moderation?: ModerationProvider;
}): void {
  if (overrides.text) text = overrides.text;
  if (overrides.illustration) illustration = overrides.illustration;
  if (overrides.speech) speech = overrides.speech;
  if (overrides.moderation) moderation = overrides.moderation;
}
