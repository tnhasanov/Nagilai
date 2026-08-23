import { z } from 'zod';
import { authenticated, body, preflight } from '@/services/api/handler';
import * as ops from '@/features/stories/operations';

/**
 * Share links (§21).
 *
 * Private by default; a link exists only once a parent asks for one, and
 * `DELETE` retires the token permanently rather than disabling it.
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

const schema = z.object({
  allowAudio: z.boolean().default(true),
  allowDownload: z.boolean().default(false),
  allowIndexing: z.boolean().default(false),
  expiresInDays: z.number().int().min(0).max(365).default(0),
});

export const GET = authenticated<{ storyId: string }, unknown>(async ({ actor, params }) => ({
  share: await ops.getShareLink(actor.userId, params.storyId, actor.db),
}));

export const POST = authenticated<{ storyId: string }, unknown>(async ({ actor, request, params }) => {
  const input = await body(request, schema);
  return { share: await ops.upsertShareLink(actor.userId, { storyId: params.storyId, ...input }, actor.db) };
});

export const DELETE = authenticated<{ storyId: string }, unknown>(async ({ actor, params }) =>
  ops.revokeShare(actor.userId, params.storyId, actor.db),
);
