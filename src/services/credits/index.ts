import 'server-only';

import { AppError, errors } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getSetting } from '@/services/config/settings';
import type { CreditReason } from '@/types/database';

/**
 * The credit ledger (§16, §34).
 *
 * All arithmetic happens inside `record_credit_transaction` in the
 * database, which locks the profile row and enforces both idempotency and
 * the non-negative invariant. This module is a thin, typed doorway to it.
 *
 * The idempotency key is the important argument. It must be *derived from
 * the work*, not random -- `story:<id>:text` rather than a fresh uuid --
 * so a retried job charges once (§34: "duplicate charging prevention").
 */
const log = createLogger('credits');

export type SpendKind = 'story_text' | 'story_illustration' | 'story_narration' | 'story_pdf_hq';

export async function costOf(kind: SpendKind): Promise<number> {
  const credits = await getSetting('credits');
  return credits[kind];
}

export interface StoryCostEstimate {
  /** Credits for the story text itself. */
  text: number;
  /** Credits for every image: one per page, plus the cover. */
  illustrations: number;
  /** How many images that is. */
  imageCount: number;
  total: number;
}

/**
 * What an illustrated story will cost in total, not just what its first
 * job costs.
 *
 * This matters because `story_illustration` is charged *per image* and a
 * story fans out to one image per page plus a cover. Checking only the
 * text cost before starting lets a parent begin a book they cannot
 * finish: the text succeeds, the first images succeed, and the rest fail
 * with `insufficient_credits` -- which is not retryable, so those jobs
 * dead-letter and the parent is left holding half a book.
 *
 * The page count is the target the model is asked for, so this is an
 * estimate: the model may return a page or two either side, and the
 * ledger always charges for what was actually produced. It is the right
 * number to *refuse* on, because refusing early costs a parent nothing
 * and refusing late costs them a broken story.
 */
export function estimateStoryCost(input: {
  pages: number;
  illustrated: boolean;
  textCost: number;
  illustrationCost: number;
}): StoryCostEstimate {
  const imageCount = input.illustrated ? input.pages + 1 : 0;
  const illustrations = imageCount * input.illustrationCost;
  return {
    text: input.textCost,
    illustrations,
    imageCount,
    total: input.textCost + illustrations,
  };
}

export async function getBalance(ownerId: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('credit_balance')
    .eq('id', ownerId)
    .single();

  if (error) throw new AppError('internal', `Could not read credit balance: ${error.message}`);
  return data.credit_balance;
}

export interface SpendInput {
  ownerId: string;
  kind: SpendKind;
  /** Stable across retries of the same unit of work. */
  idempotencyKey: string;
  quantity?: number;
  storyId?: string | null;
  jobId?: string | null;
  note?: string | null;
}

/**
 * Deducts credits for one unit of work.
 *
 * Returns the new balance. Throws `insufficient_credits` when the parent
 * cannot afford it -- callers should check affordability *before* starting
 * an expensive provider call, not after.
 */
export async function spend(input: SpendInput): Promise<number> {
  const unitCost = await costOf(input.kind);
  const quantity = input.quantity ?? 1;
  const total = unitCost * quantity;

  if (total === 0) {
    return getBalance(input.ownerId);
  }

  const { data, error } = await supabaseAdmin().rpc('record_credit_transaction', {
    p_owner_id: input.ownerId,
    p_delta: -total,
    p_reason: input.kind as CreditReason,
    p_idempotency_key: input.idempotencyKey,
    p_story_id: input.storyId ?? null,
    p_job_id: input.jobId ?? null,
    p_note: input.note ?? null,
  });

  if (error) {
    if (error.message.includes('insufficient_credits')) {
      const balance = await getBalance(input.ownerId).catch(() => 0);
      throw errors.insufficientCredits(total, balance);
    }
    throw new AppError('internal', `Credit spend failed: ${error.message}`);
  }

  log.info('credits spent', { ownerId: input.ownerId, kind: input.kind, total, balance: data });
  return typeof data === 'number' ? data : 0;
}

/** Returns credits after a failed generation, so a parent is not charged for nothing. */
export async function refund(input: {
  ownerId: string;
  amount: number;
  idempotencyKey: string;
  storyId?: string | null;
  note?: string | null;
}): Promise<void> {
  if (input.amount <= 0) return;

  const { error } = await supabaseAdmin().rpc('record_credit_transaction', {
    p_owner_id: input.ownerId,
    p_delta: input.amount,
    p_reason: 'reversal',
    p_idempotency_key: input.idempotencyKey,
    p_story_id: input.storyId ?? null,
    p_note: input.note ?? 'Automatic refund after a failed generation',
  });

  if (error) {
    log.error('refund failed', { ownerId: input.ownerId, amount: input.amount, error: error.message });
    return;
  }
  log.info('credits refunded', { ownerId: input.ownerId, amount: input.amount });
}

/** Checks affordability without spending, for pre-flight UI and guards. */
export async function canAfford(ownerId: string, kind: SpendKind, quantity = 1): Promise<boolean> {
  const [unitCost, balance] = await Promise.all([costOf(kind), getBalance(ownerId)]);
  return balance >= unitCost * quantity;
}
