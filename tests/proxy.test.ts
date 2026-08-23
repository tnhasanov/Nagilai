import { describe, expect, it } from 'vitest';
import { config } from '@/proxy';
import { AUTH_PREFIXES, PRIVATE_PREFIXES } from '@/services/supabase/session';

/**
 * The proxy matcher and the prefixes it acts on must not drift apart.
 *
 * Next.js requires `config.matcher` to be a static literal, so it cannot
 * be built from the same arrays the handler uses. That leaves two lists
 * that have to agree by hand — and a prefix added to one but not the
 * other is a redirect that silently stops happening, with no error
 * anywhere.
 *
 * The matcher is also checked for the opposite mistake. It used to be a
 * single catch-all — "everything except static assets" — which made this
 * one file a single point of failure for every page on the site.
 */

const matcher = config.matcher as readonly string[];

/** The literal prefix a matcher entry guards, ignoring its parameters. */
function prefixOf(entry: string): string {
  return entry.replace(/\/:path\*$/, '');
}

describe('proxy matcher', () => {
  it('covers every private prefix', () => {
    const covered = new Set(matcher.map(prefixOf));
    for (const prefix of PRIVATE_PREFIXES) {
      expect(covered.has(prefix), `${prefix} is guarded but not matched`).toBe(true);
    }
  });

  it('covers every auth prefix', () => {
    const covered = new Set(matcher.map(prefixOf));
    for (const prefix of AUTH_PREFIXES) {
      expect(covered.has(prefix), `${prefix} redirects but is not matched`).toBe(true);
    }
  });

  it('matches sub-paths of each private area, not just the bare prefix', () => {
    // `/library/[storyId]` has to be guarded too, not only `/library`.
    for (const prefix of PRIVATE_PREFIXES) {
      expect(matcher, `${prefix} sub-paths are unmatched`).toContain(`${prefix}/:path*`);
    }
  });

  it('matches nothing beyond what it acts on', () => {
    // Every entry must correspond to a prefix the handler actually uses.
    // This is what stops the matcher creeping back toward a catch-all.
    const known = new Set<string>([...PRIVATE_PREFIXES, ...AUTH_PREFIXES]);
    const strays = matcher.filter((entry) => !known.has(prefixOf(entry)));
    expect(strays, 'matcher entries the handler does nothing with').toEqual([]);
  });

  it('is not a catch-all', () => {
    // The shape that took the whole site down: one regex swallowing every
    // path, so a proxy the platform could not wire up 404'd the lot.
    const catchAll = matcher.filter((entry) => entry.includes('(?!') || entry === '/:path*');
    expect(catchAll, 'a catch-all makes the proxy a single point of failure').toEqual([]);
  });

  it('leaves the marketing pages and the API alone', () => {
    // These must render without a Supabase round trip.
    const shouldNotMatch = ['/', '/pricing', '/about', '/robots.txt', '/sitemap.xml', '/api/v1/me'];
    const covered = new Set(matcher.map(prefixOf));
    for (const path of shouldNotMatch) {
      expect(covered.has(path), `${path} should not go through the proxy`).toBe(false);
    }
  });
});
