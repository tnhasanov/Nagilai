import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * No English hiding in the interface (§13).
 *
 * The dictionaries were complete and the parity tests were green, and the
 * app still showed an Azerbaijani parent an English footer, an English
 * install banner, an English error screen, and English labels on the menu
 * button and the language switcher. Every one of those was a string typed
 * straight into JSX, so no test that only compares dictionaries could
 * ever have seen them.
 *
 * These two rules catch the shapes that actually went wrong. They are
 * deliberately narrow: a heuristic that flags every capitalised string in
 * the codebase would be turned off within a week.
 */

const ROOT = resolve(import.meta.dirname, '..');

function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((path) => path.endsWith('.tsx'));
}

/** Proper nouns are the same in every language. */
const ALLOWED_LITERALS = new Set(['Nagilai home']);

describe('interface text', () => {
  /**
   * An `aria-label` is interface copy that only a screen-reader user
   * hears — which is exactly why it gets forgotten. Written as a literal
   * it can never be translated, so the rule is simply that it must be an
   * expression.
   */
  it('has no hard-coded aria-label outside the allowed proper nouns', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      for (const match of source.matchAll(/aria-label="([^"]+)"/g)) {
        const value = match[1] ?? '';
        // A long sentence describing an illustration is alt text for a
        // decorative graphic, not a control's name.
        if (ALLOWED_LITERALS.has(value) || value.split(' ').length > 6) continue;
        offenders.push(`${file}: aria-label="${value}"`);
      }
    }

    expect(offenders, 'use a dictionary string instead of a literal').toEqual([]);
  });

  /**
   * The shared chrome is on every page, so English there reaches every
   * parent. These files may not contain a bare English sentence in JSX.
   */
  it('keeps the shared chrome free of literal sentences', () => {
    const chrome = [
      'src/components/site/site-footer.tsx',
      'src/components/site/site-header.tsx',
      'src/components/site/pwa.tsx',
      'src/app/error.tsx',
      'src/app/(auth)/layout.tsx',
    ];

    const offenders: string[] = [];

    for (const file of chrome) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      // Text sitting between JSX tags: >Some words here<
      for (const match of source.matchAll(/>\s*([A-Z][A-Za-z][^<>{}\n]{12,})\s*</g)) {
        offenders.push(`${file}: "${(match[1] ?? '').trim().slice(0, 60)}"`);
      }
    }

    expect(offenders, 'move this into the dictionaries').toEqual([]);
  });
});
