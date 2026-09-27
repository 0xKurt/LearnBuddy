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
  /** Stops waiting for the connection (she records again or skips): rejects with WaitAborted. */
  signal?: AbortSignal;
};

/** The wait for a connection was given up; nothing was sent. */
export class WaitAborted extends Error {
  constructor() {
    super('waiting for the connection was cancelled');
    this.name = 'WaitAborted';
  }
}

/** Resolves once the device counts as online (immediately when it already does). */
export function whenOnline(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new WaitAborted());
  if (onlineManager.isOnline()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const off = onlineManager.subscribe((online) => {
      if (!online) return;
      off();
      signal?.removeEventListener('abort', onAbort);
      resolve();
    });
    const onAbort = () => {
      off();
      reject(new WaitAborted());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function sendWhenOnline<T>(
  send: () => Promise<T>,
  { isConnectionError, attempts = 3, delayMs = 1000, signal }: Options,
): Promise<T> {
  let failedOnline = 0;
  for (;;) {
    await whenOnline(signal);
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
