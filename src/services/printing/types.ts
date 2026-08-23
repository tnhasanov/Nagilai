/**
 * Print-on-demand abstraction (§15).
 *
 * The specification is explicit that the application must not be coupled
 * to one printer. `PrintProvider` is the seam: Gelato, Lulu, Blurb or a
 * local Azerbaijani partner each become an implementation, and the MVP
 * ships with a manual one that drops orders into an admin queue.
 */

export interface BookSpecification {
  trimSize: string;          // 'a5' | 'a4' | 'square-21' ...
  binding: 'softcover' | 'hardcover';
  pageCount: number;
  coverFinish?: 'matte' | 'gloss';
  paperWeightGsm?: number;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode: string;
  countryCode: string;
  phone?: string;
}

export interface PrintQuoteRequest {
  specification: BookSpecification;
  quantity: number;
  destinationCountry: string;
  currency: string;
}

export interface PrintQuote {
  productionAmount: number;   // minor units
  shippingAmount: number;     // minor units
  currency: string;
  estimatedBusinessDays: { min: number; max: number } | null;
  /** False when this provider cannot fulfil the requested combination. */
  available: boolean;
  unavailableReason?: string;
}

export interface PrintSubmission {
  orderId: string;
  orderItemId: string;
  specification: BookSpecification;
  quantity: number;
  /** A signed, time-limited URL to the print-ready PDF. */
  printPdfUrl: string;
  shippingAddress: ShippingAddress;
  contactEmail: string;
}

export interface PrintSubmissionResult {
  providerJobId: string | null;
  status: 'not_submitted' | 'submitted' | 'accepted' | 'rejected';
  message?: string;
}

export interface PrintProvider {
  readonly name: string;
  readonly configured: boolean;
  quote(request: PrintQuoteRequest): Promise<PrintQuote>;
  submit(submission: PrintSubmission): Promise<PrintSubmissionResult>;
  getStatus(providerJobId: string): Promise<PrintSubmissionResult>;
}
