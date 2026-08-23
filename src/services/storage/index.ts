import 'server-only';

import { AppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import { SIGNED_URL_TTL_SECONDS, STORAGE_BUCKETS, type StorageBucket } from '@/config/constants';

/**
 * Object storage (§24, §30).
 *
 * Every bucket is private. Nothing is ever served from a public URL, so a
 * leaked path is not a leaked file. Reads go out as short-lived signed
 * URLs minted here, on the server.
 *
 * Object keys always begin with the owner's user id. That prefix is what
 * the storage RLS policies in migration 0008 match on, so a path built
 * incorrectly fails closed rather than exposing another family's asset.
 */
const log = createLogger('storage');

export function illustrationPath(input: {
  ownerId: string;
  storyId: string;
  versionId: string;
  pageNumber: number | null;
  fingerprint: string;
}): string {
  const leaf = input.pageNumber === null ? 'cover' : `page-${String(input.pageNumber).padStart(2, '0')}`;
  return `${input.ownerId}/${input.storyId}/${input.versionId}/${leaf}-${input.fingerprint.slice(0, 12)}.png`;
}

export function narrationPath(input: {
  ownerId: string;
  storyId: string;
  versionId: string;
  scope: string;
  hash: string;
  extension: string;
}): string {
  return `${input.ownerId}/${input.storyId}/${input.versionId}/${input.scope}-${input.hash.slice(0, 16)}.${input.extension}`;
}

export function pdfPath(input: {
  ownerId: string;
  storyId: string;
  versionId: string;
  variant: string;
  hash: string;
}): string {
  return `${input.ownerId}/${input.storyId}/${input.versionId}/${input.variant}-${input.hash.slice(0, 12)}.pdf`;
}

export function childPhotoPath(input: { ownerId: string; childId: string; extension: string }): string {
  return `${input.ownerId}/${input.childId}/${crypto.randomUUID()}.${input.extension}`;
}

export async function upload(input: {
  bucket: StorageBucket;
  path: string;
  bytes: Uint8Array;
  contentType: string;
  upsert?: boolean;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .storage.from(input.bucket)
    .upload(input.path, input.bytes as unknown as ArrayBuffer, {
      contentType: input.contentType,
      upsert: input.upsert ?? true,
      cacheControl: '31536000',
    });

  if (error) {
    throw new AppError('internal', `Storage upload failed for ${input.bucket}/${input.path}: ${error.message}`);
  }
}

const TTL_BY_BUCKET: Record<StorageBucket, number> = {
  [STORAGE_BUCKETS.illustrations]: SIGNED_URL_TTL_SECONDS.illustration,
  [STORAGE_BUCKETS.narrations]: SIGNED_URL_TTL_SECONDS.narration,
  [STORAGE_BUCKETS.storyPdfs]: SIGNED_URL_TTL_SECONDS.pdf,
  [STORAGE_BUCKETS.childPhotos]: SIGNED_URL_TTL_SECONDS.childPhoto,
  [STORAGE_BUCKETS.publicAssets]: SIGNED_URL_TTL_SECONDS.illustration,
};

export async function signedUrl(
  bucket: StorageBucket,
  path: string | null | undefined,
  options: { download?: string; expiresIn?: number } = {},
): Promise<string | null> {
  if (!path) return null;

  const expiresIn = options.expiresIn ?? TTL_BY_BUCKET[bucket];
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, expiresIn, options.download ? { download: options.download } : undefined);

  if (error) {
    log.warn('could not sign storage url', { bucket, path, error: error.message });
    return null;
  }
  return data.signedUrl;
}

/**
 * Signs many paths in one request. Used by the reader and the library,
 * where signing twenty illustrations one at a time would add a round trip
 * per page.
 */
export async function signedUrls(
  bucket: StorageBucket,
  paths: readonly (string | null | undefined)[],
  options: { expiresIn?: number } = {},
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;

  const expiresIn = options.expiresIn ?? TTL_BY_BUCKET[bucket];
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrls(unique, expiresIn);

  if (error || !data) {
    log.warn('could not batch-sign storage urls', { bucket, count: unique.length, error: error?.message });
    return result;
  }

  for (const entry of data) {
    if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

export async function download(bucket: StorageBucket, path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin().storage.from(bucket).download(path);
  if (error || !data) {
    throw new AppError('not_found', `Storage object missing: ${bucket}/${path}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function remove(bucket: StorageBucket, paths: readonly string[]): Promise<void> {
  const targets = paths.filter(Boolean);
  if (targets.length === 0) return;

  const { error } = await supabaseAdmin().storage.from(bucket).remove([...targets]);
  if (error) log.warn('storage cleanup failed', { bucket, count: targets.length, error: error.message });
}
