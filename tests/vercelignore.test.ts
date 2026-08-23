import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * `.vercelignore` must not delete anything the build needs.
 *
 * This test exists because that is exactly what happened. The file listed
 * `supabase/` intending the migrations directory at the repository root.
 * Ignore patterns without a leading slash match a directory of that name
 * at **any depth**, so it also removed `src/services/supabase/` — five
 * modules imported by 48 files. The deployment failed with 48 unresolved
 * imports; `npm run build` locally was completely unaffected, because
 * `.vercelignore` has no effect outside Vercel's upload step.
 *
 * That is the gap this closes: a file whose mistakes are invisible to
 * every local check and only appear in production.
 */

const ROOT = resolve(import.meta.dirname, '..');
const IGNORE_FILE = resolve(ROOT, '.vercelignore');

/** Every tracked file the Next.js build could plausibly need. */
function buildInputs(): string[] {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

  return tracked.filter(
    (path) =>
      path.startsWith('src/') ||
      path.startsWith('public/') ||
      /^(package\.json|package-lock\.json|next\.config\.ts|tsconfig\.json|postcss\.config\.mjs|vercel\.json)$/.test(
        path,
      ),
  );
}

function patterns(): string[] {
  return readFileSync(IGNORE_FILE, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * Whether a gitignore-style pattern excludes a path.
 *
 * Deliberately implements only the rule that caused the outage — an
 * unanchored pattern matches at any depth, an anchored one does not —
 * rather than pulling in a full matcher. Getting *this* rule right is the
 * entire point, and a dependency would put the rule somewhere I cannot
 * see it.
 */
export function excludes(pattern: string, path: string): boolean {
  const anchored = pattern.startsWith('/');
  const cleaned = pattern.replace(/^\//, '').replace(/\/$/, '');
  if (cleaned === '') return false;

  const segments = path.split('/');

  if (anchored) {
    // Matches only from the repository root.
    const prefix = cleaned.split('/');
    return prefix.every((part, index) => segments[index] === part);
  }

  // Unanchored: the pattern matches any segment, at any depth. This is
  // the behaviour that is easy to forget and expensive to discover.
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/');
    return segments.some((_, start) => parts.every((part, i) => segments[start + i] === part));
  }
  return segments.includes(cleaned);
}

describe('.vercelignore', () => {
  it('exists', () => {
    expect(existsSync(IGNORE_FILE)).toBe(true);
  });

  it('excludes nothing the build imports', () => {
    const inputs = buildInputs();
    expect(inputs.length, 'expected to find build inputs to check').toBeGreaterThan(50);

    const casualties = inputs.filter((path) =>
      patterns().some((pattern) => excludes(pattern, path)),
    );

    expect(casualties, `.vercelignore would delete these from the deployment`).toEqual([]);
  });

  it('anchors every pattern to the repository root', () => {
    // An unanchored pattern is not always wrong, but it is always a
    // loaded gun in a repository where `src/services/supabase/` exists.
    const unanchored = patterns().filter((pattern) => !pattern.startsWith('/'));
    expect(unanchored, 'add a leading slash so the pattern cannot match at depth').toEqual([]);
  });
});

describe('the matcher itself', () => {
  it('treats an unanchored directory as matching at any depth', () => {
    // The exact bug, pinned.
    expect(excludes('supabase/', 'supabase/migrations/0001.sql')).toBe(true);
    expect(excludes('supabase/', 'src/services/supabase/admin.ts')).toBe(true);
    expect(excludes('tests/', 'src/features/tests/thing.ts')).toBe(true);
  });

  it('treats an anchored directory as matching only at the root', () => {
    expect(excludes('/supabase/', 'supabase/migrations/0001.sql')).toBe(true);
    expect(excludes('/supabase/', 'src/services/supabase/admin.ts')).toBe(false);
    expect(excludes('/mobile/', 'mobile/src/api.ts')).toBe(true);
    expect(excludes('/mobile/', 'src/mobile/api.ts')).toBe(false);
  });

  it('handles multi-segment patterns', () => {
    expect(excludes('/src/services', 'src/services/supabase/admin.ts')).toBe(true);
    expect(excludes('services/supabase', 'src/services/supabase/admin.ts')).toBe(true);
    expect(excludes('/services/supabase', 'src/services/supabase/admin.ts')).toBe(false);
  });

  it('ignores an empty pattern rather than matching everything', () => {
    expect(excludes('/', 'src/anything.ts')).toBe(false);
  });
});
