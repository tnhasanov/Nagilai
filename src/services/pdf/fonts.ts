import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Book fonts for PDF generation.
 *
 * The four launch languages need Latin, Latin Extended (Azerbaijani's ə,
 * ğ, ı, İ, ş and Turkish's dotted/dotless i) and Cyrillic in one file.
 * Literata and Nunito both cover all three, which is why they were chosen
 * over prettier faces with Latin-only coverage -- a missing glyph in a
 * printed book is not recoverable.
 *
 * The files are read from disk rather than bundled as base64 so the PDF
 * route stays small; `outputFileTracingIncludes` in next.config.ts keeps
 * them in the serverless bundle.
 */
export type FontRole = 'bodyRegular' | 'bodyBold' | 'displayRegular' | 'displayBold';

const FILES: Record<FontRole, string> = {
  bodyRegular: 'Literata-Regular.ttf',
  bodyBold: 'Literata-Bold.ttf',
  displayRegular: 'Nunito-Regular.ttf',
  displayBold: 'Nunito-Bold.ttf',
};

const cache = new Map<FontRole, Uint8Array>();

export async function loadFont(role: FontRole): Promise<Uint8Array> {
  const cached = cache.get(role);
  if (cached) return cached;

  const filePath = path.join(process.cwd(), 'src', 'services', 'pdf', 'fonts', FILES[role]);
  const bytes = new Uint8Array(await readFile(filePath));
  cache.set(role, bytes);
  return bytes;
}

export async function loadAllFonts(): Promise<Record<FontRole, Uint8Array>> {
  const roles = Object.keys(FILES) as FontRole[];
  const loaded = await Promise.all(roles.map((role) => loadFont(role)));
  return Object.fromEntries(roles.map((role, index) => [role, loaded[index]!])) as Record<
    FontRole,
    Uint8Array
  >;
}
