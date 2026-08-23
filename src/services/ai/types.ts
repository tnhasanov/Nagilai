/**
 * Provider-neutral AI interfaces (§26).
 *
 * Nothing outside `src/services/ai`, `src/services/images` and
 * `src/services/audio` may import the OpenAI SDK. Everything else talks to
 * these interfaces, so swapping a provider is a new file plus one line in
 * a factory -- not a rewrite.
 */

import type { GeneratedStory, StoryRequest } from '@/types/domain';

/** What a single provider call cost, in provider-native units. */
export interface UsageMetrics {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  imageCount?: number;
  imageSize?: string;
  imageQuality?: string;
  audioCharacters?: number;
  audioSeconds?: number;
  durationMs: number;
}

export interface ProviderResult<T> {
  value: T;
  usage: UsageMetrics;
}

/* ------------------------------------------------------------------ */

export interface StoryGenerationOptions {
  model: string;
  maxOutputTokens: number;
  targetPages: number;
  wordsPerPage: number;
}

export interface TextProvider {
  readonly name: string;
  generateStory(
    request: StoryRequest,
    options: StoryGenerationOptions,
  ): Promise<ProviderResult<GeneratedStory>>;
}

/* ------------------------------------------------------------------ */

export interface IllustrationRequest {
  prompt: string;
  negativePrompt?: string | null;
  size: string;
  quality: string;
  /** Opaque per-user identifier passed to the provider for abuse tracking. */
  endUserId?: string;
}

export interface IllustrationResult {
  bytes: Uint8Array;
  mimeType: string;
  width: number | null;
  height: number | null;
  revisedPrompt: string | null;
}

export interface IllustrationProvider {
  readonly name: string;
  generate(request: IllustrationRequest, model: string): Promise<ProviderResult<IllustrationResult>>;
}

/* ------------------------------------------------------------------ */

export interface SpeechRequest {
  text: string;
  voiceId: string;
  /** BCP-47 code of the story; used for pronunciation direction (§10). */
  languageCode: string;
  instructions?: string | null;
  speed?: number;
  format: 'mp3' | 'opus' | 'aac' | 'wav';
}

export interface SpeechResult {
  bytes: Uint8Array;
  mimeType: string;
  /** Estimated when the provider does not report a real duration. */
  durationSeconds: number | null;
}

export interface SpeechProvider {
  readonly name: string;
  synthesise(request: SpeechRequest, model: string): Promise<ProviderResult<SpeechResult>>;
}

/* ------------------------------------------------------------------ */

export interface ModerationVerdict {
  flagged: boolean;
  blocked: boolean;
  categories: string[];
  scores: Record<string, number>;
}

export interface ModerationProvider {
  readonly name: string;
  check(text: string, model: string, blockedCategories: string[]): Promise<ProviderResult<ModerationVerdict>>;
}
