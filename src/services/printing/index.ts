import 'server-only';

import { ManualPrintProvider } from './manual';
import type { PrintProvider } from './types';

/**
 * Print provider selection (§15).
 *
 * `PRINT_PROVIDER` chooses the implementation. Gelato and Lulu are named
 * in the enum so the wiring point is obvious, but only `manual` is
 * implemented in Phase 1 -- adding one is a new class, not a refactor.
 */
let cached: PrintProvider | null = null;

export function printProvider(): PrintProvider {
  if (cached) return cached;

  const configured = process.env.PRINT_PROVIDER ?? 'manual';
  switch (configured) {
    case 'gelato':
    case 'lulu':
      // Not implemented yet; fall back rather than break checkout.
      cached = new ManualPrintProvider();
      break;
    default:
      cached = new ManualPrintProvider();
  }
  return cached;
}

export type { PrintProvider, PrintQuote, PrintSubmission, BookSpecification } from './types';
