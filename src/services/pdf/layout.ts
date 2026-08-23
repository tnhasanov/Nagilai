import type { PDFFont } from 'pdf-lib';

/**
 * Typesetting helpers shared by the book renderer.
 *
 * pdf-lib draws text; it does not lay it out. Everything to do with line
 * breaking, fitting a block into a box, and hanging punctuation lives
 * here so the renderer reads as a sequence of pages rather than a mass of
 * measurement arithmetic.
 */

export const MM_TO_PT = 72 / 25.4;

export interface PageGeometry {
  width: number;
  height: number;
  /** Extra area outside the trim, for commercial printing. */
  bleed: number;
  margin: number;
}

export const PAGE_SIZES = {
  a5: { width: 148 * MM_TO_PT, height: 210 * MM_TO_PT },
  a4: { width: 210 * MM_TO_PT, height: 297 * MM_TO_PT },
  square: { width: 210 * MM_TO_PT, height: 210 * MM_TO_PT },
} as const;

export type PageSizeName = keyof typeof PAGE_SIZES;

export function geometryFor(size: PageSizeName, variant: 'digital' | 'print'): PageGeometry {
  const base = PAGE_SIZES[size];
  const bleed = variant === 'print' ? 3 * MM_TO_PT : 0;
  return {
    width: base.width,
    height: base.height,
    bleed,
    margin: (size === 'a4' ? 18 : 14) * MM_TO_PT,
  };
}

/**
 * Breaks text into lines that fit `maxWidth`.
 *
 * Falls back to breaking mid-word for a single token longer than the
 * measure -- rare in children's prose, but a long compound in Turkish or
 * Azerbaijani would otherwise overflow the page silently.
 */
export function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);

      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        current = word;
      } else {
        const pieces = breakLongWord(word, font, fontSize, maxWidth);
        lines.push(...pieces.slice(0, -1));
        current = pieces[pieces.length - 1] ?? '';
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function breakLongWord(word: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = '';

  for (const character of word) {
    const candidate = current + character;
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Finds the largest font size (within bounds) at which `text` fits inside
 * a box. Used for titles and page text, so a long Russian title shrinks
 * rather than running off the cover.
 */
export function fitTextSize(input: {
  text: string;
  font: PDFFont;
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  lineHeightRatio: number;
}): { fontSize: number; lines: string[] } {
  for (let size = input.maxSize; size >= input.minSize; size -= 0.5) {
    const lines = wrapText(input.text, input.font, size, input.maxWidth);
    const height = lines.length * size * input.lineHeightRatio;
    if (height <= input.maxHeight) return { fontSize: size, lines };
  }

  const fontSize = input.minSize;
  const lines = wrapText(input.text, input.font, fontSize, input.maxWidth);
  const maxLines = Math.max(1, Math.floor(input.maxHeight / (fontSize * input.lineHeightRatio)));
  return { fontSize, lines: lines.slice(0, maxLines) };
}

/** Scales an image to cover a box, returning the draw rectangle. */
export function coverRect(
  imageWidth: number,
  imageHeight: number,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: boxX + (boxWidth - width) / 2,
    y: boxY + (boxHeight - height) / 2,
    width,
    height,
  };
}

/** Scales an image to fit entirely inside a box. */
export function containRect(
  imageWidth: number,
  imageHeight: number,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: boxX + (boxWidth - width) / 2,
    y: boxY + (boxHeight - height) / 2,
    width,
    height,
  };
}
