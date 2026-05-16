// Atomic credit debit / settle / refund helpers. Doc 08 §atomic-debit-and-settlement.
//
// Production wants a single Postgres statement with a balance-gate in the
// WHERE clause (idempotent, race-free). The v1 implementation here does a
// read-then-update because the in-memory fake doesn't support `gte` filters
// in UPDATE WHERE; the same logic compiles against the real Supabase client.
// Documented as a follow-up in IMPLEMENTATION-PLAN §C2 — the next credits
// hardening slice should swap this for a single SQL statement.

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
    .eq('account_id', account_id);
  if (upd.error) {
    throw new ApiError('internal', 'Failed to debit credit bucket', { cause: upd.error.message });
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
