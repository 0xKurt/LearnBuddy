// Answers that must not get lost: every typed answer is kept on the device
// until the API has it. If the app is closed or the connection drops before
// that, it is sent again on the next start or when the device is back online —
// with the same client_turn_id, so the API records it once (it replays).
// Answers the API refuses for good (question already closed, session ended)
// are dropped. Signing out clears the outbox (another account never sends
// them). Pure queue logic here (Node-testable); storage in outboxStorage*.ts.

import type { AnswerRequest } from '@learnbuddy/shared-types/contracts';

export type OutboxEntry = { sessionId: string; body: AnswerRequest; savedAt: string };

/** Kept at most: a day's worth of answers is plenty; older ones are stale. */
export const OUTBOX_MAX = 50;
const MAX_AGE_MS = 7 * 86_400_000;

/** Adds or replaces the entry with the same client_turn_id; the oldest go first when full. */
export function withEntry(list: readonly OutboxEntry[], e: OutboxEntry): OutboxEntry[] {
  const rest = list.filter((x) => x.body.client_turn_id !== e.body.client_turn_id);
  return [...rest, e].slice(-OUTBOX_MAX);
}

export function without(list: readonly OutboxEntry[], clientTurnId: string): OutboxEntry[] {
  return list.filter((x) => x.body.client_turn_id !== clientTurnId);
}

/** Parses what storage held; anything malformed or older than a week is left out. */
export function parseOutbox(raw: string | null, now: Date): OutboxEntry[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((x): x is OutboxEntry => {
      if (!x || typeof x !== 'object') return false;
      const e = x as Partial<OutboxEntry>;
      if (typeof e.sessionId !== 'string' || typeof e.savedAt !== 'string' || !e.body) return false;
      if (typeof e.body.client_turn_id !== 'string' || typeof e.body.item_id !== 'string')
        return false;
      const age = now.getTime() - Date.parse(e.savedAt);
      return Number.isFinite(age) && age <= MAX_AGE_MS;
    });
  } catch {
    return [];
  }
}

/** What to do with an entry after a send attempt. */
export type SendResult = 'sent' | 'refused' | 'no_connection';

export function afterSend(result: SendResult): 'remove' | 'keep' {
  return result === 'no_connection' ? 'keep' : 'remove';
}
