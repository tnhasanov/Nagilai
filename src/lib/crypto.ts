import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Hashing and token helpers.
 *
 * The fingerprints here are the mechanism behind §17's "don't pay twice":
 * an illustration, a narration or a PDF is keyed by a hash of everything
 * that determines its content, so an identical request is a cache hit.
 */

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/** A stable hash over an object, insensitive to key order. */
export function stableHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * A share token (§21). 32 random bytes rendered base64url: 256 bits of
 * entropy, unguessable, and safe in a URL path.
 */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateIdempotencyKey(prefix: string): string {
  return `${prefix}:${randomBytes(16).toString('hex')}`;
}

/** Constant-time comparison for shared secrets (cron, webhooks). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still compare something of equal length so the timing does not
    // reveal the expected length.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
