// The two rules lib/push.ts lives by that have nothing to do with the phone, so
// Node tests can prove them (lib/__tests__/pushFlush.test.ts):
//
// - what the device owes the API about push goes out oldest first, and only a
//   clear "no" from the API drops one. "Opened" is the only proof a message
//   reached her (CLAUDE.md rule 5, audit M-64): a connection that is not there
//   must leave the report on the device, not silently lose it;
// - nothing about push keeps sign-out or start waiting. A push token can take
//   forever offline on iOS, and the learner would sit in front of a dead screen.

/** Nothing about push may keep sign-out or start waiting longer than this. */
export const PUSH_TIMEOUT_MS = 4000;

/** `p`, but failing after `ms` — a promise that never answers never blocks. */
export function within<T>(p: Promise<T>, ms = PUSH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * Sends what is kept, oldest first. What the API took is dropped; what it refused for
 * good is dropped too (it would never be taken). Anything else — offline, server
 * trouble — ends the pass with that entry and everything after it still kept, so the
 * next start or the next connection sends them.
 */
export async function sendKept<E>(
  entries: readonly E[],
  send: (entry: E) => Promise<void>,
  drop: (entry: E) => Promise<void>,
  refused: (err: unknown) => boolean,
): Promise<void> {
  for (const e of entries) {
    try {
      await send(e);
    } catch (err) {
      if (!refused(err)) break;
    }
    await drop(e);
  }
}
