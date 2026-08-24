import { describe, expect, it } from 'vitest';
import { estimateStoryCost } from '../src/credits';

/**
 * The contract shared with the web package.
 *
 * `src/credits.ts` mirrors `src/services/credits/estimate.ts` in the web
 * app, and the two cannot import each other. These are the same worked
 * examples `tests/cost-and-credits.test.ts` pins over there, so a change
 * to either copy breaks the other side's build.
 */
describe('estimateStoryCost', () => {
  it('counts one image per page plus the cover', () => {
    const estimate = estimateStoryCost({
      pages: 10,
      illustrated: true,
      textCost: 1,
      illustrationCost: 1,
    });

    expect(estimate.imageCount).toBe(11);
    expect(estimate.illustrations).toBe(11);
    expect(estimate.total).toBe(12);
  });

  it('charges for text alone when the book is not illustrated', () => {
    const estimate = estimateStoryCost({
      pages: 10,
      illustrated: false,
      textCost: 1,
      illustrationCost: 1,
    });

    expect(estimate.imageCount).toBe(0);
    expect(estimate.total).toBe(1);
  });

  it('respects a per-image cost above one credit', () => {
    // 7 images x 3, plus 2 for the text
    expect(
      estimateStoryCost({ pages: 6, illustrated: true, textCost: 2, illustrationCost: 3 }).total,
    ).toBe(23);
  });

  it('prices the whole book, not the first job', () => {
    // The regression, pinned on both sides of the package boundary.
    const wholeBook = estimateStoryCost({
      pages: 10,
      illustrated: true,
      textCost: 1,
      illustrationCost: 1,
    });

    expect(wholeBook.total).not.toBe(1);
    expect(3 >= wholeBook.total).toBe(false);
  });
});
