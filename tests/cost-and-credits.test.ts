import { describe, expect, it } from 'vitest';
import { computeCost, type PricingTable } from '@/services/usage/tracker';
import { ManualPrintProvider } from '@/services/printing/manual';
import { formatMicroUsd, formatMoney } from '@/lib/utils';
import { stableHash, generateShareToken, safeEqual } from '@/lib/crypto';
import { estimateStoryCost } from '@/services/credits';

/**
 * Cost tracking and order arithmetic (§17, §34).
 *
 * The credit ledger's real invariants — idempotency and the non-negative
 * balance — are enforced in the database and asserted in
 * `supabase/tests/0001_security_and_credits.test.sql`. What is tested here
 * is the arithmetic that decides what things cost.
 */

const PRICING: PricingTable = {
  text: {
    'gpt-5': {
      input_micro_usd_per_1k: 1250,
      output_micro_usd_per_1k: 10000,
      cached_input_micro_usd_per_1k: 125,
    },
  },
  image: { 'gpt-image-1': { low: 11000, medium: 42000, high: 167000 } },
  speech: { 'gpt-4o-mini-tts': { micro_usd_per_1k_characters: 600 } },
};

describe('AI cost estimation', () => {
  it('bills input and output tokens at their own rates', () => {
    const { costMicroUsd } = computeCost(
      'text_generation',
      { provider: 'openai', model: 'gpt-5', inputTokens: 2000, outputTokens: 4000, durationMs: 1 },
      PRICING,
    );

    // 2 × 1250 input + 4 × 10000 output
    expect(costMicroUsd).toBe(2500 + 40000);
  });

  it('bills cached input at the cheaper rate and does not double-count it', () => {
    const { costMicroUsd } = computeCost(
      'text_generation',
      {
        provider: 'openai',
        model: 'gpt-5',
        inputTokens: 2000,
        cachedInputTokens: 1500,
        outputTokens: 1000,
        durationMs: 1,
      },
      PRICING,
    );

    // 500 fresh input + 1500 cached + 1000 output, rounded to whole micro-USD
    expect(costMicroUsd).toBe(Math.round(0.5 * 1250 + 1.5 * 125 + 1 * 10000));
  });

  it('bills images per image at the quality actually used', () => {
    expect(
      computeCost(
        'image_generation',
        { provider: 'openai', model: 'gpt-image-1', imageCount: 3, imageQuality: 'high', durationMs: 1 },
        PRICING,
      ).costMicroUsd,
    ).toBe(3 * 167000);
  });

  it('falls back to the medium image rate when quality is unknown', () => {
    expect(
      computeCost(
        'image_generation',
        { provider: 'openai', model: 'gpt-image-1', imageCount: 1, imageQuality: 'ultra', durationMs: 1 },
        PRICING,
      ).costMicroUsd,
    ).toBe(42000);
  });

  it('bills speech per thousand characters', () => {
    expect(
      computeCost(
        'speech_synthesis',
        { provider: 'openai', model: 'gpt-4o-mini-tts', audioCharacters: 2500, durationMs: 1 },
        PRICING,
      ).costMicroUsd,
    ).toBe(1500);
  });

  it('reports zero rather than guessing for an unpriced model', () => {
    const result = computeCost(
      'text_generation',
      { provider: 'openai', model: 'gpt-6-unreleased', inputTokens: 1000, outputTokens: 1000, durationMs: 1 },
      PRICING,
    );

    expect(result.costMicroUsd).toBe(0);
    expect(result.unitCosts).toBeNull();
  });

  it('treats moderation as free', () => {
    expect(
      computeCost('moderation', { provider: 'openai', model: 'omni-moderation-latest', durationMs: 1 }, PRICING)
        .costMicroUsd,
    ).toBe(0);
  });
});

describe('printed book quotes', () => {
  const provider = new ManualPrintProvider();

  it('prices production per copy and shipping once', async () => {
    const one = await provider.quote({
      specification: { trimSize: 'a5', binding: 'softcover', pageCount: 24 },
      quantity: 1,
      destinationCountry: 'AZ',
      currency: 'AZN',
    });
    const three = await provider.quote({
      specification: { trimSize: 'a5', binding: 'softcover', pageCount: 24 },
      quantity: 3,
      destinationCountry: 'AZ',
      currency: 'AZN',
    });

    expect(one.available).toBe(true);
    expect(three.productionAmount).toBe(one.productionAmount * 3);
    expect(three.shippingAmount).toBe(one.shippingAmount);
  });

  it('charges more for more pages and for a hardcover', async () => {
    const thin = await provider.quote({
      specification: { trimSize: 'a4', binding: 'softcover', pageCount: 16 },
      quantity: 1,
      destinationCountry: 'AZ',
      currency: 'AZN',
    });
    const thick = await provider.quote({
      specification: { trimSize: 'a4', binding: 'softcover', pageCount: 32 },
      quantity: 1,
      destinationCountry: 'AZ',
      currency: 'AZN',
    });
    const hardcover = await provider.quote({
      specification: { trimSize: 'a4', binding: 'hardcover', pageCount: 16 },
      quantity: 1,
      destinationCountry: 'AZ',
      currency: 'AZN',
    });

    expect(thick.productionAmount).toBeGreaterThan(thin.productionAmount);
    expect(hardcover.productionAmount).toBeGreaterThan(thin.productionAmount);
  });

  it('ships internationally at a higher rate than domestically', async () => {
    const local = await provider.quote({
      specification: { trimSize: 'a5', binding: 'softcover', pageCount: 24 },
      quantity: 1,
      destinationCountry: 'az',
      currency: 'AZN',
    });
    const abroad = await provider.quote({
      specification: { trimSize: 'a5', binding: 'softcover', pageCount: 24 },
      quantity: 1,
      destinationCountry: 'NZ',
      currency: 'AZN',
    });

    expect(abroad.shippingAmount).toBeGreaterThan(local.shippingAmount);
  });

  it('reports a combination it cannot fulfil rather than inventing a price', async () => {
    const quote = await provider.quote({
      specification: { trimSize: 'poster', binding: 'hardcover', pageCount: 24 },
      quantity: 1,
      destinationCountry: 'AZ',
      currency: 'AZN',
    });

    expect(quote.available).toBe(false);
    expect(quote.productionAmount).toBe(0);
  });

  it('queues manual fulfilment rather than pretending to submit', async () => {
    const result = await provider.submit({
      orderId: 'order-1',
      orderItemId: 'item-1',
      specification: { trimSize: 'a5', binding: 'softcover', pageCount: 24 },
      quantity: 1,
      printPdfUrl: 'https://example.invalid/book.pdf',
      shippingAddress: {
        name: 'A Parent',
        line1: '1 Street',
        city: 'Baku',
        postalCode: 'AZ1000',
        countryCode: 'AZ',
      },
      contactEmail: 'parent@example.invalid',
    });

    expect(result.status).toBe('not_submitted');
    expect(result.providerJobId).toBeNull();
  });
});

describe('money formatting', () => {
  it('renders minor units as currency', () => {
    expect(formatMoney(1999, 'USD', 'en-US')).toBe('$19.99');
  });

  it('shows small AI costs with enough precision to be useful', () => {
    expect(formatMicroUsd(0)).toBe('$0.00');
    expect(formatMicroUsd(4200)).toBe('$0.0042');
    expect(formatMicroUsd(2_500_000)).toBe('$2.50');
  });
});

describe('hashing and tokens', () => {
  it('hashes objects independently of key order', () => {
    expect(stableHash({ a: 1, b: [2, 3] })).toBe(stableHash({ b: [2, 3], a: 1 }));
  });

  it('produces a different hash when anything meaningful changes', () => {
    expect(stableHash({ prompt: 'a', model: 'x' })).not.toBe(stableHash({ prompt: 'a', model: 'y' }));
  });

  it('mints share tokens with enough entropy and no collisions', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateShareToken()));

    expect(tokens.size).toBe(500);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('compares secrets without leaking length through an exception', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'much longer value')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('what a whole story costs before it starts', () => {
  /**
   * The bug this guards against: illustrations are charged per image, and
   * a story fans out to one image per page plus a cover. Pre-checking only
   * the text cost lets a parent start a book that dies partway through,
   * because `insufficient_credits` is not retryable and the remaining
   * images dead-letter instead of waiting.
   */
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
    const estimate = estimateStoryCost({
      pages: 6,
      illustrated: true,
      textCost: 2,
      illustrationCost: 3,
    });

    // 7 images x 3, plus 2 for the text
    expect(estimate.total).toBe(23);
  });

  it('costs more for a longer book, which is the whole point of checking', () => {
    const short = estimateStoryCost({ pages: 6, illustrated: true, textCost: 1, illustrationCost: 1 });
    const long = estimateStoryCost({ pages: 16, illustrated: true, textCost: 1, illustrationCost: 1 });

    expect(long.total).toBeGreaterThan(short.total);
  });
});
