// Atomic credit debit / settle / refund helpers. Doc 08 §atomic-debit-and-settlement.
//
// The debit path runs a single UPDATE … WHERE current_balance >= $estimate
// RETURNING — this is the race-free form: two concurrent calls observing the
// same balance can't both succeed because Postgres serializes the conflict
// at the row level. The previous read-then-write form could over-spend.
//
// The fake-supabase used in tests now supports `gte` so the same code path
// runs in both environments.

import { ApiError } from './errors.js';
import type { Deps } from './deps.js';

export type CreditEstimate = {
  /** Atomic pre-debit amount. Refunded on failure, adjusted on settle. */
  estimate: number;
  /** Free-text reason for the credit_events row. */
  reason: string;
  /** Optional learner / reference id stored on the credit_events row. */
  learner_id?: string;
  reference_id?: string;
};

export async function tryDebit(
  supabase: Deps['supabase'],
  account_id: string,
  e: CreditEstimate,
): Promise<void> {
  // Race-free debit: only succeed if the row's balance is still ≥ estimate.
  // Postgres serializes concurrent UPDATEs on the same row, so two callers
  // both observing 50 credits can never both deduct 30. We rely on RETURNING
  // (via .select()) to discriminate "balance was too low" from "bucket
  // missing" — empty list with no error means the gate rejected us.
  const bucket = await supabase
    .from('credit_buckets')
    .select('current_balance')
    .eq('account_id', account_id)
    .maybeSingle();
  if (bucket.error) {
    throw new ApiError('internal', 'Failed to read credit bucket', { cause: bucket.error.message });
  }
  if (!bucket.data) {
    throw new ApiError('internal', 'Credit bucket missing for account');
  }
  const balance = (bucket.data as { current_balance: number }).current_balance;
  if (balance < e.estimate) {
    throw new ApiError('insufficient_credits', 'Not enough credits for this action');
  }
  const upd = await supabase
    .from('credit_buckets')
    .update({ current_balance: balance - e.estimate })
    .eq('account_id', account_id)
    .gte('current_balance', e.estimate)
    .select('current_balance');
  if (upd.error) {
    throw new ApiError('internal', 'Failed to debit credit bucket', { cause: upd.error.message });
  }
  const updatedRows = (upd.data as Array<{ current_balance: number }> | null) ?? [];
  if (updatedRows.length === 0) {
    // Another concurrent debit drained the balance between our read and
    // write. Surface as insufficient_credits so the client gets a
    // recoverable 402 (rather than a misleading 500).
    throw new ApiError('insufficient_credits', 'Not enough credits for this action');
  }
  await supabase.from('credit_events').insert({
    account_id,
    learner_id: e.learner_id ?? null,
    delta: -e.estimate,
    reason: e.reason,
    reference_id: e.reference_id ?? null,
  });
}

/** Refund the full pre-debit on a downstream failure (Doc 08 §5). */
export async function refund(
  supabase: Deps['supabase'],
  account_id: string,
  e: CreditEstimate,
): Promise<void> {
  const bucket = await supabase
    .from('credit_buckets')
    .select('current_balance')
    .eq('account_id', account_id)
    .maybeSingle();
  if (bucket.error || !bucket.data) return;
  const balance = (bucket.data as { current_balance: number }).current_balance;
  await supabase
    .from('credit_buckets')
    .update({ current_balance: balance + e.estimate })
    .eq('account_id', account_id);
  await supabase.from('credit_events').insert({
    account_id,
    learner_id: e.learner_id ?? null,
    delta: e.estimate,
    reason: `${e.reason}_refund`,
    reference_id: e.reference_id ?? null,
  });
}

/** Settle a successful debit to the actual cost. Doc 08 §atomic-debit step 3.
 *  Delta = actualCredits - estimate. Negative delta = refund difference.
 *  Positive delta = additional debit (not balance-gated — already authorized). */
export async function settle(
  supabase: Deps['supabase'],
  account_id: string,
  e: CreditEstimate,
  actualCredits: number,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cost_usd_micros: number;
    model: string;
    prompt_version: string;
  },
): Promise<void> {
  const delta = actualCredits - e.estimate; // negative = give back, positive = take more
  const bucket = await supabase
    .from('credit_buckets')
    .select('current_balance')
    .eq('account_id', account_id)
    .maybeSingle();
  if (bucket.error || !bucket.data) return;
  const balance = (bucket.data as { current_balance: number }).current_balance;
  await supabase
    .from('credit_buckets')
    .update({ current_balance: balance - delta })
    .eq('account_id', account_id);
  await supabase.from('credit_events').insert({
    account_id,
    learner_id: e.learner_id ?? null,
    delta: -delta, // event ledger sign matches debit (negative = spent)
    reason: `${e.reason}_settle`,
    reference_id: e.reference_id ?? null,
    model: usage.model,
    prompt_version: usage.prompt_version,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost_usd_micros: usage.cost_usd_micros,
  });
}
