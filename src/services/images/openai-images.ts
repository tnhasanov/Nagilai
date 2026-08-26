import 'server-only';

import { AppError } from '@/lib/errors';
import { callOpenAi, openaiClient } from '@/services/ai/openai-client';
import type {
  IllustrationProvider,
  IllustrationRequest,
  IllustrationResult,
  ProviderResult,
} from '@/services/ai/types';

/**
 * Illustration generation on OpenAI's image model.
 *
 * Returns raw bytes rather than a provider URL: provider-hosted image URLs
 * expire, and §30 wants the asset in our own CDN-backed storage anyway.
 */
export class OpenAiIllustrationProvider implements IllustrationProvider {
  readonly name = 'openai';

  async generate(request: IllustrationRequest, model: string): Promise<ProviderResult<IllustrationResult>> {
    const client = openaiClient();
    const startedAt = Date.now();

    const prompt = request.negativePrompt
      ? `${request.prompt}\n\nAvoid entirely: ${request.negativePrompt}`
      : request.prompt;

    const response = await callOpenAi(
      () =>
        client.images.generate({
          model,
          prompt,
          n: 1,
          size: request.size as '1024x1024',
          quality: request.quality as 'medium',
          output_format: 'png',
          // The image model applies its own safety filter on top of our
          // moderation pass; `low` here means "the default filter", not
          // "less safe" -- our prompts are already constrained.
          moderation: 'auto',
          ...(request.endUserId ? { user: request.endUserId } : {}),
        }),
      { label: 'openai.images.generate', attempts: 3 },
    );

    const image = response.data?.[0];
    if (!image?.b64_json) {
      throw new AppError('provider_invalid_response', 'Image model returned no image data');
    }

    const bytes = Buffer.from(image.b64_json, 'base64');
    const [width, height] = parseSize(response.size ?? request.size);

    return {
      value: {
        bytes,
        mimeType: 'image/png',
        width,
        height,
        revisedPrompt: image.revised_prompt ?? null,
      },
      usage: {
        provider: this.name,
        model,
        imageCount: 1,
        imageSize: response.size ?? request.size,
        imageQuality: response.quality ?? request.quality,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        durationMs: Date.now() - startedAt,
      },
    };
  }
}

function parseSize(size: string): [number | null, number | null] {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match?.[1] || !match[2]) return [null, null];
  return [Number(match[1]), Number(match[2])];
}
