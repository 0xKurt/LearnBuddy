// How the outbox is sent (lib/api/outboxSync.ts), as pure logic that Node tests run.

import type { SendResult } from './outbox.js';

/** In a row, answers the server could not take right now before a pass gives up. */
const TROUBLE_IN_A_ROW = 3;

export type PassResult = { sent: number; refused: number };

/**
 * Sends entries oldest first. Without a connection the pass stops (everything waits
 * for the next one). Server trouble with one answer keeps that answer and goes on with
 * the next, so one stuck answer never holds back all later ones for days
 * (outbox-head-of-line-blocking); three in a row mean general trouble and end the pass.
 * `settle` runs for every answer that is done (sent, or refused for good).
 */
export async function sendInOrder<E>(
  list: readonly E[],
  attempt: (e: E) => Promise<SendResult>,
  settle: (e: E, result: 'sent' | 'refused') => Promise<void>,
): Promise<PassResult> {
  const out: PassResult = { sent: 0, refused: 0 };
  let trouble = 0;
  for (const e of list) {
    const result = await attempt(e);
    if (result === 'no_connection') break;
    if (result === 'try_later') {
      trouble += 1;
      if (trouble >= TROUBLE_IN_A_ROW) break;
      continue;
    }
    trouble = 0;
    await settle(e, result);
    out[result] += 1;
  }
  return out;
}

/**
 * One run at a time. A call while a run is going on no longer just joins it: one more
 * run follows, so a reason to send that came up meanwhile (back online) is never lost
 * (p2-outbox-flush-join-strands-entries). Any number of such calls share that one run.
 */
export function oneRunAndAnother<T>(run: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | null = null;
  let next: Promise<T> | null = null;
  const start = (): Promise<T> => {
    current = run().finally(() => {
      current = null;
    });
    return current;
  };
  return () => {
    if (!current) return start();
    next ??= current
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        next = null;
        return start();
      });
    return next;
  };
}
