import { NextResponse, type NextRequest } from 'next/server';
import { paymentProvider } from '@/services/payments/stripe';
import { supabaseAdmin } from '@/services/supabase/admin';
import { createLogger, describeError } from '@/lib/logger';
import type { Json } from '@/types/database';

/**
 * Stripe webhook (Phase 2, §16).
 *
 * Present from day one so the payments path is wired rather than
 * retrofitted, and inert until a key is configured.
 *
 * Two properties matter here and are built in now rather than discovered
 * in production: the signature is verified against the raw body before
 * anything is parsed, and every event is recorded against its Stripe
 * event id under a unique index — so a redelivery updates a row instead
 * of granting a second month of credits.
 */
const log = createLogger('webhook:stripe');

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const provider = paymentProvider();
  if (!provider.configured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 501 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  // The raw body is required: any reserialisation invalidates the signature.
  const rawBody = await request.text();

  let event;
  try {
    event = await provider.verifyWebhook(rawBody, signature);
  } catch (error) {
    log.warn('signature verification failed', describeError(error));
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin()
      .from('payments')
      .upsert(
        {
          provider: 'stripe',
          provider_event_id: event.id,
          status: 'pending',
          raw_payload: event.payload as Json,
        },
        { onConflict: 'provider,provider_event_id', ignoreDuplicates: true },
      );

    if (error) throw error;

    log.info('stripe event recorded', { id: event.id, type: event.type });
  } catch (error) {
    log.error('could not record stripe event', describeError(error));
    // A 500 asks Stripe to retry, which the idempotency above makes safe.
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
