import 'server-only';

import { AppError } from '@/lib/errors';
import { withRetry } from '@/lib/retry';
import { isRetryableOpenAiError, openaiClient } from '@/services/ai/openai-client';
import type { ProviderResult, SpeechProvider, SpeechRequest, SpeechResult } from '@/services/ai/types';

const MIME_BY_FORMAT: Record<SpeechRequest['format'], string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

/**
 * Narration on OpenAI's current speech API (§10).
 *
 * Explicitly *not* the Google TTS the Bubble prototype used. Pronunciation
 * comes from the text plus the `instructions` field, which names the story
 * language -- there is no separate language parameter to pass around, and
 * per the specification's closing note no language code travels in a URL.
 */
export class OpenAiSpeechProvider implements SpeechProvider {
  readonly name = 'openai';

  async synthesise(request: SpeechRequest, model: string): Promise<ProviderResult<SpeechResult>> {
    const client = openaiClient();
    const startedAt = Date.now();

    if (request.text.trim().length === 0) {
      throw new AppError('validation_failed', 'Cannot synthesise empty text');
    }

    const response = await withRetry(
      () =>
        client.audio.speech.create({
          model,
          voice: request.voiceId,
          input: request.text,
          response_format: request.format,
          ...(request.instructions ? { instructions: request.instructions } : {}),
          ...(request.speed && request.speed !== 1 ? { speed: request.speed } : {}),
        }),
      { label: 'openai.audio.speech.create', attempts: 3, isRetryable: isRetryableOpenAiError },
    );

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new AppError('provider_invalid_response', 'Speech model returned an empty audio file');
    }

    return {
      value: {
        bytes,
        mimeType: MIME_BY_FORMAT[request.format],
        durationSeconds: estimateDurationSeconds(request.text, request.speed ?? 1),
      },
      usage: {
        provider: this.name,
        model,
        audioCharacters: request.text.length,
        audioSeconds: estimateDurationSeconds(request.text, request.speed ?? 1),
        durationMs: Date.now() - startedAt,
      },
    };
  }
}

/**
 * The speech API does not report a duration, and decoding an MP3 header on
 * a serverless function to find one is not worth it. ~14 characters per
 * second is close for read-aloud pace across the four launch languages;
 * the audio element reports the exact duration once it loads, and the
 * stored value is only used for the library card and progress estimate.
 */
export function estimateDurationSeconds(text: string, speed: number): number {
  const charactersPerSecond = 14 * (speed || 1);
  return Math.max(1, Math.round((text.length / charactersPerSecond) * 10) / 10);
}
