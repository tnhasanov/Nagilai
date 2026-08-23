import 'server-only';

import { createLogger } from '@/lib/logger';
import type {
  PrintProvider,
  PrintQuote,
  PrintQuoteRequest,
  PrintSubmission,
  PrintSubmissionResult,
} from './types';

/**
 * The MVP print provider (§15).
 *
 * Orders enter an admin fulfilment queue rather than an external API, so
 * the first printed books can be produced with a local partner before any
 * integration exists. Quotes come from a simple, editable cost model.
 *
 * Every figure below is a placeholder to be replaced with real quotes from
 * a chosen printer -- flagged in docs/DECISIONS.md as a business decision
 * for the owner, not something to guess at in code.
 */
const log = createLogger('print:manual');

const BASE_COST_MINOR: Record<string, number> = {
  'a5:softcover': 700,
  'a5:hardcover': 1400,
  'a4:softcover': 1100,
  'a4:hardcover': 1900,
};

const PER_PAGE_COST_MINOR = 12;

const SHIPPING_MINOR: Record<string, number> = {
  AZ: 400,
  TR: 900,
  RU: 1200,
  DEFAULT: 1600,
};

export class ManualPrintProvider implements PrintProvider {
  readonly name = 'manual';
  readonly configured = true;

  async quote(request: PrintQuoteRequest): Promise<PrintQuote> {
    const key = `${request.specification.trimSize}:${request.specification.binding}`;
    const base = BASE_COST_MINOR[key];

    if (base === undefined) {
      return {
        productionAmount: 0,
        shippingAmount: 0,
        currency: request.currency,
        estimatedBusinessDays: null,
        available: false,
        unavailableReason: `No configured cost for ${key}`,
      };
    }

    const production = (base + request.specification.pageCount * PER_PAGE_COST_MINOR) * request.quantity;
    const shipping =
      SHIPPING_MINOR[request.destinationCountry.toUpperCase()] ?? SHIPPING_MINOR['DEFAULT'] ?? 1600;

    return {
      productionAmount: production,
      shippingAmount: shipping,
      currency: request.currency,
      estimatedBusinessDays: { min: 5, max: 12 },
      available: true,
    };
  }

  async submit(submission: PrintSubmission): Promise<PrintSubmissionResult> {
    log.info('print order queued for manual fulfilment', {
      orderId: submission.orderId,
      orderItemId: submission.orderItemId,
      quantity: submission.quantity,
      trimSize: submission.specification.trimSize,
      binding: submission.specification.binding,
    });

    return {
      providerJobId: null,
      status: 'not_submitted',
      message: 'Queued for manual fulfilment by the Nagilai team.',
    };
  }

  async getStatus(): Promise<PrintSubmissionResult> {
    return { providerJobId: null, status: 'not_submitted', message: 'Tracked manually in the admin queue.' };
  }
}
