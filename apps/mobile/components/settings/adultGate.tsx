// "An adult has to confirm this" for API calls (docs/privacy.md, PIN gate).
// For a minor's profile the API answers admin_required when a change loosens
// contact or touches account data. Then the adult's PIN screen opens
// (lib/adminFlow.ts) and the call is retried exactly once. When the adult
// cancels — or there is no PIN yet to ask for — AdultCancelled is thrown and
// nothing has changed on the server.

import { requestAdmin } from '../../lib/adminFlow.js';
import { ApiError } from '../../lib/api/client.js';

export class AdultCancelled extends Error {
  constructor(readonly reason: 'cancelled' | 'no_pin') {
    super(`adult_${reason}`);
    this.name = 'AdultCancelled';
  }
}

type Options = {
  /** False while the account has no PIN: the PIN screen could only say so. */
  pinSet: boolean;
  /** Called right before the PIN screen opens. */
  onPrompt?: () => void;
};

/** Opens the PIN screen up front (for changes that certainly need the adult). */
export async function confirmAdult(pinSet: boolean): Promise<void> {
  if (!pinSet) throw new AdultCancelled('no_pin');
  if (!(await requestAdmin())) throw new AdultCancelled('cancelled');
}

/** Runs `call`; on admin_required asks for the adult's PIN and retries once. */
export async function asAdultIfNeeded<T>(call: () => Promise<T>, opts: Options): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'admin_required') throw err;
    if (!opts.pinSet) throw new AdultCancelled('no_pin');
    opts.onPrompt?.();
    if (!(await requestAdmin())) throw new AdultCancelled('cancelled');
    return call();
  }
}

/**
 * Waits until a closing modal (a Sheet, the PIN screen) is gone. iOS cannot
 * present the next one (PIN screen, share sheet) while another is still
 * animating out, and neither exposes a "closed" callback here.
 */
export function afterModalCloses(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 450));
}
