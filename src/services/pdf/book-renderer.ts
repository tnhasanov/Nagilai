import 'server-only';

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { createLogger } from '@/lib/logger';
import { loadAllFonts } from './fonts';
import {
  containRect,
  coverRect,
  fitTextSize,
  geometryFor,
  MM_TO_PT,
  wrapText,
  type PageGeometry,
  type PageSizeName,
} from './layout';

/**
 * Print-quality book renderer (§14).
 *
 * Built on pdf-lib rather than by printing an HTML page, for the reasons
 * the specification gives: a real PDF can carry embedded subsetted fonts,
 * full-bleed images, crop marks and a trim box, none of which survive a
 * browser print. It also runs in a serverless function with no headless
 * Chrome to cold-start.
 *
 * Two variants come off the same renderer:
 *   digital → trimmed page, no bleed, for reading and home printing
 *   print   → 3 mm bleed on every edge plus crop marks, for a commercial
 *             printer
 */
const log = createLogger('pdf:renderer');

const PALETTE = {
  ink: rgb(0.17, 0.13, 0.1),
  softInk: rgb(0.42, 0.35, 0.29),
  paper: rgb(0.996, 0.988, 0.976),
  accent: rgb(0.85, 0.55, 0.24),
  overlay: rgb(0.12, 0.09, 0.07),
};

export interface BookPageInput {
  pageNumber: number;
  text: string;
  image: { bytes: Uint8Array; mimeType: string } | null;
}

export interface BookInput {
  title: string;
  subtitle: string | null;
  summary: string | null;
  dedication: string | null;
  childDisplayName: string | null;
  languageCode: string;
  educationalTakeaway: string | null;
  discussionQuestions: string[];
  cover: { bytes: Uint8Array; mimeType: string } | null;
  pages: BookPageInput[];
  /** Localised furniture strings, so the book is not half-English. */
  strings: BookStrings;
}

export interface BookStrings {
  aStoryFor: string;      // "A story for {name}"
  createdWith: string;    // "Made with Nagilai"
  theEnd: string;         // "The End"
  forGrownUps: string;    // "For grown-ups"
  talkAbout: string;      // "Things to talk about"
}

export interface RenderOptions {
  size: PageSizeName;
  variant: 'digital' | 'print';
  includeBackCover: boolean;
}

export interface RenderedBook {
  bytes: Uint8Array;
  pageCount: number;
}

export async function renderBook(book: BookInput, options: RenderOptions): Promise<RenderedBook> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const fontBytes = await loadAllFonts();
  const fonts = {
    body: await pdf.embedFont(fontBytes.bodyRegular, { subset: true }),
    bodyBold: await pdf.embedFont(fontBytes.bodyBold, { subset: true }),
    display: await pdf.embedFont(fontBytes.displayRegular, { subset: true }),
    displayBold: await pdf.embedFont(fontBytes.displayBold, { subset: true }),
    fallback: await pdf.embedFont(StandardFonts.Helvetica),
  };

  pdf.setTitle(book.title);
  pdf.setAuthor('Nagilai');
  pdf.setSubject(book.summary ?? 'A personalised children\'s story');
  pdf.setProducer('Nagilai');
  pdf.setCreator('Nagilai');
  pdf.setCreationDate(new Date());
  pdf.setLanguage(book.languageCode);

  const geometry = geometryFor(options.size, options.variant);
  const context: RenderContext = { pdf, fonts, geometry, variant: options.variant };

  await drawCover(context, book);
  drawTitlePage(context, book);
  if (book.dedication) drawDedicationPage(context, book);

  for (const page of book.pages) {
    await drawStoryPage(context, book, page);
  }

  drawClosingPage(context, book);
  if (options.includeBackCover) drawBackCover(context, book);

  const bytes = await pdf.save({ useObjectStreams: true });
  log.info('book rendered', {
    pages: pdf.getPageCount(),
    bytes: bytes.byteLength,
    variant: options.variant,
    size: options.size,
  });

  return { bytes, pageCount: pdf.getPageCount() };
}

/* ------------------------------------------------------------------ */

interface RenderContext {
  pdf: PDFDocument;
  fonts: {
    body: PDFFont;
    bodyBold: PDFFont;
    display: PDFFont;
    displayBold: PDFFont;
    fallback: PDFFont;
  };
  geometry: PageGeometry;
  variant: 'digital' | 'print';
}

/**
 * Adds a page sized to include bleed, and returns both the full media box
 * and the trim box the content should respect.
 */
function addPage(context: RenderContext): {
  page: PDFPage;
  trim: { x: number; y: number; width: number; height: number };
} {
  const { width, height, bleed } = context.geometry;
  const page = context.pdf.addPage([width + bleed * 2, height + bleed * 2]);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: width + bleed * 2,
    height: height + bleed * 2,
    color: PALETTE.paper,
  });

  const trim = { x: bleed, y: bleed, width, height };
  if (bleed > 0) drawCropMarks(page, trim, bleed);
  return { page, trim };
}

/** Crop marks sit in the bleed area and tell the printer where to cut. */
function drawCropMarks(
  page: PDFPage,
  trim: { x: number; y: number; width: number; height: number },
  bleed: number,
): void {
  const length = bleed * 0.8;
  const thickness = 0.25;
  const marks: Array<{ x: number; y: number; w: number; h: number }> = [
    { x: 0, y: trim.y, w: length, h: thickness },
    { x: 0, y: trim.y + trim.height, w: length, h: thickness },
    { x: trim.x + trim.width + bleed - length, y: trim.y, w: length, h: thickness },
    { x: trim.x + trim.width + bleed - length, y: trim.y + trim.height, w: length, h: thickness },
    { x: trim.x, y: 0, w: thickness, h: length },
    { x: trim.x + trim.width, y: 0, w: thickness, h: length },
    { x: trim.x, y: trim.y + trim.height + bleed - length, w: thickness, h: length },
    { x: trim.x + trim.width, y: trim.y + trim.height + bleed - length, w: thickness, h: length },
  ];

  for (const mark of marks) {
    page.drawRectangle({ x: mark.x, y: mark.y, width: mark.w, height: mark.h, color: PALETTE.softInk });
  }
}

async function embedImage(
  context: RenderContext,
  image: { bytes: Uint8Array; mimeType: string } | null,
): Promise<PDFImage | null> {
  if (!image || image.bytes.byteLength === 0) return null;
  try {
    return image.mimeType === 'image/jpeg'
      ? await context.pdf.embedJpg(image.bytes)
      : await context.pdf.embedPng(image.bytes);
  } catch (error) {
    // A single corrupt asset must not fail the whole book.
    log.warn('could not embed image, continuing without it', { error: String(error) });
    return null;
  }
}

async function drawCover(context: RenderContext, book: BookInput): Promise<void> {
  const { page, trim } = addPage(context);
  const bleed = context.geometry.bleed;
  const image = await embedImage(context, book.cover);

  if (image) {
    // Cover art extends into the bleed so there is no white edge after trimming.
    const rect = coverRect(
      image.width,
      image.height,
      0,
      0,
      trim.width + bleed * 2,
      trim.height + bleed * 2,
    );
    page.drawImage(image, rect);
  } else {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: trim.width + bleed * 2,
      height: trim.height + bleed * 2,
      color: rgb(0.96, 0.93, 0.87),
    });
  }

  // A translucent band keeps the title readable over any artwork.
  const bandHeight = trim.height * 0.3;
  page.drawRectangle({
    x: 0,
    y: bleed,
    width: trim.width + bleed * 2,
    height: bandHeight,
    color: PALETTE.overlay,
    opacity: 0.55,
  });

  const inset = context.geometry.margin;
  const titleBox = { width: trim.width - inset * 2, height: bandHeight * 0.55 };
  const title = fitTextSize({
    text: book.title,
    font: context.fonts.displayBold,
    maxWidth: titleBox.width,
    maxHeight: titleBox.height,
    maxSize: context.geometry.width * 0.075,
    minSize: 14,
    lineHeightRatio: 1.15,
  });

  let cursorY = bleed + bandHeight - inset * 0.6 - title.fontSize;
  for (const line of title.lines) {
    const width = context.fonts.displayBold.widthOfTextAtSize(line, title.fontSize);
    page.drawText(line, {
      x: trim.x + (trim.width - width) / 2,
      y: cursorY,
      size: title.fontSize,
      font: context.fonts.displayBold,
      color: rgb(1, 1, 1),
    });
    cursorY -= title.fontSize * 1.15;
  }

  if (book.childDisplayName) {
    const label = book.strings.aStoryFor;
    const size = Math.max(9, context.geometry.width * 0.028);
    const width = context.fonts.display.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: trim.x + (trim.width - width) / 2,
      y: bleed + inset * 0.7,
      size,
      font: context.fonts.display,
      color: rgb(1, 1, 1),
      opacity: 0.9,
    });
  }
}

function drawTitlePage(context: RenderContext, book: BookInput): void {
  const { page, trim } = addPage(context);
  const inset = context.geometry.margin;
  const centreY = trim.y + trim.height * 0.62;

  const title = fitTextSize({
    text: book.title,
    font: context.fonts.displayBold,
    maxWidth: trim.width - inset * 2,
    maxHeight: trim.height * 0.25,
    maxSize: context.geometry.width * 0.06,
    minSize: 13,
    lineHeightRatio: 1.2,
  });

  let cursorY = centreY;
  for (const line of title.lines) {
    const width = context.fonts.displayBold.widthOfTextAtSize(line, title.fontSize);
    page.drawText(line, {
      x: trim.x + (trim.width - width) / 2,
      y: cursorY,
      size: title.fontSize,
      font: context.fonts.displayBold,
      color: PALETTE.ink,
    });
    cursorY -= title.fontSize * 1.2;
  }

  if (book.subtitle) {
    const size = Math.max(9, context.geometry.width * 0.028);
    const lines = wrapText(book.subtitle, context.fonts.body, size, trim.width - inset * 2);
    cursorY -= size * 0.8;
    for (const line of lines) {
      const width = context.fonts.body.widthOfTextAtSize(line, size);
      page.drawText(line, {
        x: trim.x + (trim.width - width) / 2,
        y: cursorY,
        size,
        font: context.fonts.body,
        color: PALETTE.softInk,
      });
      cursorY -= size * 1.4;
    }
  }

  page.drawRectangle({
    x: trim.x + trim.width / 2 - 18,
    y: cursorY - 16,
    width: 36,
    height: 1.2,
    color: PALETTE.accent,
  });

  if (book.childDisplayName) {
    const label = book.strings.aStoryFor;
    const size = Math.max(9, context.geometry.width * 0.026);
    const width = context.fonts.display.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: trim.x + (trim.width - width) / 2,
      y: cursorY - 40,
      size,
      font: context.fonts.display,
      color: PALETTE.softInk,
    });
  }

  drawBrandMark(context, page, trim);
}

function drawDedicationPage(context: RenderContext, book: BookInput): void {
  const { page, trim } = addPage(context);
  const inset = context.geometry.margin * 1.8;
  const size = Math.max(11, context.geometry.width * 0.034);
  const lines = wrapText(book.dedication ?? '', context.fonts.body, size, trim.width - inset * 2);
  const blockHeight = lines.length * size * 1.6;

  let cursorY = trim.y + trim.height / 2 + blockHeight / 2;
  for (const line of lines) {
    const width = context.fonts.body.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: trim.x + (trim.width - width) / 2,
      y: cursorY,
      size,
      font: context.fonts.body,
      color: PALETTE.softInk,
    });
    cursorY -= size * 1.6;
  }
}

async function drawStoryPage(context: RenderContext, book: BookInput, input: BookPageInput): Promise<void> {
  const { page, trim } = addPage(context);
  const inset = context.geometry.margin;
  const image = await embedImage(context, input.image);

  const contentTop = trim.y + trim.height - inset;
  const contentBottom = trim.y + inset * 1.6;
  let textTop = contentTop;

  if (image) {
    const imageBoxHeight = trim.height * 0.52;
    const rect = containRect(
      image.width,
      image.height,
      trim.x + inset,
      contentTop - imageBoxHeight,
      trim.width - inset * 2,
      imageBoxHeight,
    );

    // A hairline frame stops a pale illustration from bleeding into the page.
    page.drawRectangle({
      x: rect.x - 2,
      y: rect.y - 2,
      width: rect.width + 4,
      height: rect.height + 4,
      color: rgb(0.93, 0.9, 0.85),
    });
    page.drawImage(image, rect);
    textTop = rect.y - inset * 0.9;
  }

  const availableHeight = textTop - contentBottom;
  const fitted = fitTextSize({
    text: input.text,
    font: context.fonts.body,
    maxWidth: trim.width - inset * 2,
    maxHeight: availableHeight,
    maxSize: Math.max(12, context.geometry.width * 0.038),
    minSize: 8.5,
    lineHeightRatio: 1.55,
  });

  let cursorY = textTop - fitted.fontSize;
  for (const line of fitted.lines) {
    page.drawText(line, {
      x: trim.x + inset,
      y: cursorY,
      size: fitted.fontSize,
      font: context.fonts.body,
      color: PALETTE.ink,
    });
    cursorY -= fitted.fontSize * 1.55;
  }

  const numberSize = Math.max(7.5, context.geometry.width * 0.022);
  const numberText = String(input.pageNumber);
  const numberWidth = context.fonts.display.widthOfTextAtSize(numberText, numberSize);
  page.drawText(numberText, {
    x: trim.x + (trim.width - numberWidth) / 2,
    y: trim.y + inset * 0.55,
    size: numberSize,
    font: context.fonts.display,
    color: PALETTE.softInk,
  });

  void book;
}

function drawClosingPage(context: RenderContext, book: BookInput): void {
  const { page, trim } = addPage(context);
  const inset = context.geometry.margin;
  let cursorY = trim.y + trim.height - inset * 2.2;

  const endSize = Math.max(14, context.geometry.width * 0.05);
  const endWidth = context.fonts.displayBold.widthOfTextAtSize(book.strings.theEnd, endSize);
  page.drawText(book.strings.theEnd, {
    x: trim.x + (trim.width - endWidth) / 2,
    y: cursorY,
    size: endSize,
    font: context.fonts.displayBold,
    color: PALETTE.ink,
  });
  cursorY -= endSize * 2.4;

  // §14's "optional final educational message" -- addressed to the parent,
  // deliberately after the story so it never intrudes on the reading.
  if (book.educationalTakeaway || book.discussionQuestions.length > 0) {
    page.drawRectangle({
      x: trim.x + inset,
      y: trim.y + inset * 2,
      width: trim.width - inset * 2,
      height: cursorY - trim.y - inset * 1.4,
      color: rgb(0.98, 0.96, 0.92),
    });

    cursorY -= inset * 0.6;
    const labelSize = Math.max(8, context.geometry.width * 0.024);
    page.drawText(book.strings.forGrownUps.toUpperCase(), {
      x: trim.x + inset * 1.6,
      y: cursorY,
      size: labelSize,
      font: context.fonts.displayBold,
      color: PALETTE.accent,
    });
    cursorY -= labelSize * 2.2;

    const bodySize = Math.max(9.5, context.geometry.width * 0.03);
    if (book.educationalTakeaway) {
      const lines = wrapText(
        book.educationalTakeaway,
        context.fonts.body,
        bodySize,
        trim.width - inset * 3.2,
      );
      for (const line of lines) {
        page.drawText(line, {
          x: trim.x + inset * 1.6,
          y: cursorY,
          size: bodySize,
          font: context.fonts.body,
          color: PALETTE.ink,
        });
        cursorY -= bodySize * 1.5;
      }
      cursorY -= bodySize * 0.8;
    }

    if (book.discussionQuestions.length > 0) {
      page.drawText(book.strings.talkAbout, {
        x: trim.x + inset * 1.6,
        y: cursorY,
        size: bodySize,
        font: context.fonts.bodyBold,
        color: PALETTE.ink,
      });
      cursorY -= bodySize * 1.8;

      for (const question of book.discussionQuestions.slice(0, 4)) {
        const lines = wrapText(`· ${question}`, context.fonts.body, bodySize, trim.width - inset * 3.4);
        for (const line of lines) {
          if (cursorY < trim.y + inset * 2.6) break;
          page.drawText(line, {
            x: trim.x + inset * 1.8,
            y: cursorY,
            size: bodySize,
            font: context.fonts.body,
            color: PALETTE.softInk,
          });
          cursorY -= bodySize * 1.45;
        }
        cursorY -= bodySize * 0.35;
      }
    }
  }

  drawBrandMark(context, page, trim);
}

function drawBackCover(context: RenderContext, book: BookInput): void {
  const { page, trim } = addPage(context);
  const bleed = context.geometry.bleed;
  const inset = context.geometry.margin;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: trim.width + bleed * 2,
    height: trim.height + bleed * 2,
    color: rgb(0.96, 0.93, 0.87),
  });

  if (book.summary) {
    const size = Math.max(10, context.geometry.width * 0.03);
    const lines = wrapText(book.summary, context.fonts.body, size, trim.width - inset * 3);
    let cursorY = trim.y + trim.height * 0.62;
    for (const line of lines) {
      const width = context.fonts.body.widthOfTextAtSize(line, size);
      page.drawText(line, {
        x: trim.x + (trim.width - width) / 2,
        y: cursorY,
        size,
        font: context.fonts.body,
        color: PALETTE.ink,
      });
      cursorY -= size * 1.6;
    }
  }

  drawBrandMark(context, page, trim);
}

/** The Nagilai wordmark that appears on the title, closing and back pages (§14). */
function drawBrandMark(
  context: RenderContext,
  page: PDFPage,
  trim: { x: number; y: number; width: number; height: number },
): void {
  const size = Math.max(8, context.geometry.width * 0.024);
  const brand = 'Nagilai';
  const width = context.fonts.displayBold.widthOfTextAtSize(brand, size);

  page.drawText(brand, {
    x: trim.x + (trim.width - width) / 2,
    y: trim.y + context.geometry.margin * 0.55,
    size,
    font: context.fonts.displayBold,
    color: PALETTE.softInk,
  });
}

export { MM_TO_PT };
