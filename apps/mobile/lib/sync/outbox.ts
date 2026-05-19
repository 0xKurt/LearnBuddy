// Offline attempt outbox — pure queue/drain logic (Doc 05 §sync-engine).
// No expo-sqlite import here so the batching/accepted-rejected logic is
// unit-testable under the node mobile runner; the SQLite-backed store
// lives in outbox-store.ts.

import type { AnswerMode, Verdict } from '@learnbuddy/shared-types';

// Server-batch entry shape (POST /attempts/batch validator) — replayed
// verbatim, idempotent on client_attempt_id.
export type OutboxEntry = {
  client_attempt_id: string;
  item_id: string;
  session_id?: string | null;
  mode: AnswerMode;
  kid_answer: string;
  verdict: Verdict;
  evaluated_by: 'local';
  hints_used: number;
  duration_ms: number;
  test_mode: boolean;
  reviewed_at: string;
};

export interface OutboxStore {
  enqueue(learnerId: string, entry: OutboxEntry): Promise<void>;
  pending(learnerId: string): Promise<OutboxEntry[]>;
  remove(clientAttemptIds: string[]): Promise<void>;
}

export type BatchResponse = {
  accepted: string[];
  rejected: Array<{ client_attempt_id: string; reason: string }>;
};

const MAX_BATCH = 200; // server cap

/**
 * Drain queued attempts to the server in ≤200-row batches. Accepted rows
 * are applied server-side; rejected rows (e.g. item deleted) will never
 * succeed — both are cleared so the queue can't wedge forever. Stops on
 * the first transport error, leaving the rest queued for the next try.
 */
export async function drainOutbox(
  store: OutboxStore,
  learnerId: string,
  post: (attempts: OutboxEntry[]) => Promise<BatchResponse>,
): Promise<{ drained: number }> {
  const all = await store.pending(learnerId);
  let drained = 0;
  for (let i = 0; i < all.length; i += MAX_BATCH) {
    const chunk = all.slice(i, i + MAX_BATCH);
    const res = await post(chunk);
    const settled = [...res.accepted, ...res.rejected.map((r) => r.client_attempt_id)];
    if (settled.length > 0) await store.remove(settled);
    drained += res.accepted.length;
  }
  return { drained };
}
