// Sending a request that is safe to repeat (it carries a client_turn_id the
// API deduplicates) without losing it to a missing connection: offline it
// waits until TanStack Query's onlineManager (fed by NetInfo, see
// lib/api/queries.ts) says the device is back, then sends the very same body.
// A request that fails for lack of connection is sent again the same way.
// Waiting lives in memory: if the app is closed meanwhile, the answer was
// never sent and the learner sees the question still open.
//
// No React Native imports, so it runs under the Node test runner.

import { onlineManager } from '@tanstack/react-query';

type Options = {
  /** True for a failure that means "the request may not have arrived" (no connection). */
  isConnectionError: (err: unknown) => boolean;
  /** Attempts while the device counts as online; waiting for a connection does not count. */
  attempts?: number;
  /** Pause before the next attempt while online, doubled each time. */
  delayMs?: number;
};

/** Resolves once the device counts as online (immediately when it already does). */
export function whenOnline(): Promise<void> {
  if (onlineManager.isOnline()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = onlineManager.subscribe((online) => {
      if (!online) return;
      off();
      resolve();
    });
  });
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function sendWhenOnline<T>(
  send: () => Promise<T>,
  { isConnectionError, attempts = 3, delayMs = 1000 }: Options,
): Promise<T> {
  let failedOnline = 0;
  for (;;) {
    await whenOnline();
    try {
      return await send();
    } catch (err) {
      if (!isConnectionError(err)) throw err;
      // Went offline meanwhile: wait for the connection, as if it had never been sent.
      if (!onlineManager.isOnline()) continue;
      failedOnline += 1;
      if (failedOnline >= attempts) throw err;
      await pause(delayMs * 2 ** (failedOnline - 1));
    }
  }
}
