import 'server-only';

import Stripe from 'stripe';
import { errors } from '@/lib/errors';
import type {
  CheckoutSession,
  CheckoutSessionInput,
  PaymentProvider,
  WebhookEvent,
} from './types';

/**
 * Stripe implementation of `PaymentProvider`.
 *
 * Constructed lazily: Phase 1 ships with `payments_enabled` false and no
 * Stripe key, and the app must run perfectly well in that state.
 */
class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly configured = true;

  private readonly client: Stripe;

  constructor(secretKey: string) {
    this.client = new Stripe(secretKey, { typescript: true });
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
    const session = await this.client.checkout.sessions.create({
      mode: input.mode,
      customer_email: input.customerEmail,
      line_items: input.lineItems.map((item) => ({ price: item.priceId, quantity: item.quantity })),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.ownerId,
      metadata: { ownerId: input.ownerId, ...input.metadata },
    });

    if (!session.url) throw errors.notConfigured('Stripe checkout returned no redirect URL');
    return { id: session.id, url: session.url };
  }

  async createBillingPortalSession(input: { customerId: string; returnUrl: string }) {
    const session = await this.client.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<WebhookEvent> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw errors.notConfigured('STRIPE_WEBHOOK_SECRET');

    const event = await this.client.webhooks.constructEventAsync(rawBody, signature, secret);
    return { id: event.id, type: event.type, payload: event.data.object };
  }
}

/** Stand-in used while payments are switched off. */
class DisabledPaymentProvider implements PaymentProvider {
  readonly name = 'disabled';
  readonly configured = false;

  async createCheckoutSession(): Promise<CheckoutSession> {
    throw errors.notConfigured('Payments');
  }

  async createBillingPortalSession(): Promise<{ url: string }> {
    throw errors.notConfigured('Payments');
  }

  async verifyWebhook(): Promise<WebhookEvent> {
    throw errors.notConfigured('Payments');
  }
}

let cached: PaymentProvider | null = null;

export function paymentProvider(): PaymentProvider {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new StripePaymentProvider(key) : new DisabledPaymentProvider();
  return cached;
}
