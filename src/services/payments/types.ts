/**
 * Payment abstraction (§16).
 *
 * Stripe is the first implementation, but nothing above this interface
 * knows that. A local Azerbaijani acquirer becomes a second class
 * implementing the same three operations.
 *
 * Money is always integer minor units plus an ISO-4217 code. No price is
 * ever hard-coded in application logic -- amounts come from the `prices`
 * table (§37).
 */

export interface CheckoutLineItem {
  priceId: string;
  quantity: number;
}

export interface CheckoutSessionInput {
  ownerId: string;
  customerEmail: string;
  lineItems: CheckoutLineItem[];
  mode: 'payment' | 'subscription';
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  payload: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;
  createBillingPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  verifyWebhook(rawBody: string, signature: string): Promise<WebhookEvent>;
}
