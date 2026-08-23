import { z } from 'zod';
import { authenticated, body, preflight } from '@/services/api/handler';
import * as ops from '@/features/stories/operations';

/**
 * Renders (or reuses) a PDF and returns a signed download URL.
 *
 * The URL is returned rather than the bytes: a native client should hand
 * it to the platform downloader or the share sheet, and streaming a
 * multi-megabyte body through the API would be slower and less
 * resumable.
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

const schema = z.object({
  variant: z.enum(['digital', 'print']).default('digital'),
  pageSize: z.enum(['a5', 'a4', 'square']).default('a5'),
});

export const POST = authenticated<{ storyId: string }, unknown>(async ({ actor, request, params }) => {
  const input = await body(request, schema);

  return ops.buildPdf(
    actor.userId,
    { storyId: params.storyId, variant: input.variant, pageSize: input.pageSize },
    actor.db,
  );
});
