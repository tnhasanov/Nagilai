import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderBook, type BookInput } from '@/services/pdf/book-renderer';
import { containRect, coverRect, fitTextSize, wrapText } from '@/services/pdf/layout';
import { StandardFonts } from 'pdf-lib';

/**
 * The PDF is a deliverable a customer pays for and a printer consumes, so
 * these tests check the things that would ruin a printed book: missing
 * glyphs for a launch language, a page count that does not match the
 * story, and a print variant without bleed.
 */

const STRINGS = {
  aStoryFor: 'Miray üçün bir nağıl',
  createdWith: 'Nagilai ilə hazırlanıb',
  theEnd: 'Son',
  forGrownUps: 'Böyüklər üçün',
  talkAbout: 'Danışmaq üçün',
};

function makeBook(overrides: Partial<BookInput> = {}): BookInput {
  return {
    title: 'Mirayın ulduzlu səyahəti',
    subtitle: 'Космическое приключение',
    summary: 'Miray gecə göyünə baxdı və ulduzların arasında bir işıq gördü.',
    dedication: 'Sevimli Miray üçün — şirin yuxular.',
    childDisplayName: 'Miray',
    languageCode: 'az-AZ',
    educationalTakeaway: 'Planetlər Günəşin ətrafında fırlanır, çünki Günəş onları özünə çəkir.',
    discussionQuestions: ['Sən hansı planetə getmək istərdin?', 'Gecə göyündə nə görürsən?'],
    cover: null,
    pages: [
      { pageNumber: 1, text: 'Miray pəncərədən baxdı. Göydə minlərlə ulduz parıldayırdı.', image: null },
      { pageNumber: 2, text: 'Гагарин сказал: «Поехали!» И они полетели к звёздам.', image: null },
      { pageNumber: 3, text: 'Yıldızlar ışıldadı ve Miray gülümsedi. Şimdi eve dönme zamanıydı.', image: null },
    ],
    strings: STRINGS,
    ...overrides,
  };
}

describe('book renderer', () => {
  it('produces a valid PDF with cover, title, dedication, story and closing pages', async () => {
    const result = await renderBook(makeBook(), {
      size: 'a5',
      variant: 'digital',
      includeBackCover: true,
    });

    expect(result.bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(result.bytes.subarray(0, 5)).toString()).toBe('%PDF-');

    // cover + title + dedication + 3 story pages + closing + back cover
    expect(result.pageCount).toBe(8);

    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(8);
    expect(reloaded.getTitle()).toBe('Mirayın ulduzlu səyahəti');
    expect(reloaded.getAuthor()).toBe('Nagilai');
  });

  it('omits the dedication page when there is no dedication', async () => {
    const result = await renderBook(makeBook({ dedication: null }), {
      size: 'a5',
      variant: 'digital',
      includeBackCover: false,
    });
    // cover + title + 3 story pages + closing
    expect(result.pageCount).toBe(6);
  });

  it('renders every launch language without dropping a glyph', async () => {
    // Azerbaijani ə/ğ/ı/İ/ş, Turkish ı/İ/ğ/ş, Russian Cyrillic. A font
    // without these would throw inside pdf-lib's encoder rather than
    // silently produce blanks, which is exactly the failure we want caught.
    const book = makeBook({
      title: 'Əşğıİ Ğüöçş — Привет — Merhaba',
      pages: [
        { pageNumber: 1, text: 'Azərbaycan dili: ə, ğ, ı, İ, ö, ş, ü, ç', image: null },
        { pageNumber: 2, text: 'Русский язык: Ё, ё, Ъ, ъ, Ы, ы, Э, э, Ю, ю, Я, я', image: null },
        { pageNumber: 3, text: 'Türkçe: ı, İ, ğ, Ğ, ş, Ş, ö, Ö, ü, Ü, ç, Ç', image: null },
      ],
    });

    const result = await renderBook(book, { size: 'a5', variant: 'digital', includeBackCover: false });
    expect(result.bytes.byteLength).toBeGreaterThan(1000);
  });

  it('adds bleed and a larger media box for the print variant', async () => {
    const digital = await renderBook(makeBook(), {
      size: 'a5',
      variant: 'digital',
      includeBackCover: false,
    });
    const print = await renderBook(makeBook(), { size: 'a5', variant: 'print', includeBackCover: false });

    const digitalDoc = await PDFDocument.load(digital.bytes);
    const printDoc = await PDFDocument.load(print.bytes);

    const digitalSize = digitalDoc.getPage(0).getSize();
    const printSize = printDoc.getPage(0).getSize();

    // 3 mm of bleed on each edge => 6 mm extra in each dimension.
    const sixMillimetresInPoints = (6 * 72) / 25.4;
    expect(printSize.width - digitalSize.width).toBeCloseTo(sixMillimetresInPoints, 1);
    expect(printSize.height - digitalSize.height).toBeCloseTo(sixMillimetresInPoints, 1);
  });

  it('renders A4 larger than A5', async () => {
    const a5 = await renderBook(makeBook(), { size: 'a5', variant: 'digital', includeBackCover: false });
    const a4 = await renderBook(makeBook(), { size: 'a4', variant: 'digital', includeBackCover: false });

    const a5Doc = await PDFDocument.load(a5.bytes);
    const a4Doc = await PDFDocument.load(a4.bytes);
    expect(a4Doc.getPage(0).getSize().width).toBeGreaterThan(a5Doc.getPage(0).getSize().width);
  });

  it('survives an unreadable illustration instead of failing the book', async () => {
    const book = makeBook({
      cover: { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/png' },
      pages: [{ pageNumber: 1, text: 'Bir səhifə.', image: { bytes: new Uint8Array([9, 9]), mimeType: 'image/png' } }],
    });

    const result = await renderBook(book, { size: 'a5', variant: 'digital', includeBackCover: false });
    expect(result.pageCount).toBe(5);
  });
});

describe('layout helpers', () => {
  it('wraps text to the measure', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = wrapText('the quick brown fox jumps over the lazy dog', font, 12, 80);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 12)).toBeLessThanOrEqual(80);
    }
  });

  it('breaks a word that is longer than the measure', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = wrapText('Muvaffakiyetsizlestiricilestiriveremeyebileceklerimizdenmissinizcesine', font, 12, 60);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 12)).toBeLessThanOrEqual(60);
    }
  });

  it('shrinks a title until it fits its box', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    const short = fitTextSize({
      text: 'Star',
      font,
      maxWidth: 200,
      maxHeight: 100,
      maxSize: 40,
      minSize: 10,
      lineHeightRatio: 1.2,
    });
    const long = fitTextSize({
      text: 'A considerably longer title that has to be made smaller to fit inside the same box',
      font,
      maxWidth: 200,
      maxHeight: 100,
      maxSize: 40,
      minSize: 10,
      lineHeightRatio: 1.2,
    });

    expect(short.fontSize).toBe(40);
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.lines.length * long.fontSize * 1.2).toBeLessThanOrEqual(100);
  });

  it('covers and contains images correctly', () => {
    const cover = coverRect(100, 50, 0, 0, 100, 100);
    expect(cover.width).toBeGreaterThanOrEqual(100);
    expect(cover.height).toBeGreaterThanOrEqual(100);

    const contain = containRect(100, 50, 0, 0, 100, 100);
    expect(contain.width).toBeLessThanOrEqual(100);
    expect(contain.height).toBeLessThanOrEqual(100);
    expect(contain.y).toBeGreaterThan(0);
  });
});
