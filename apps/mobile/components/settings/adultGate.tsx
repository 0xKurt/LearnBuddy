// "An adult has to confirm this" for API calls (docs/privacy.md, PIN gate).
// For a minor's profile the API answers admin_required when a change loosens
// contact or touches account data. Then the adult's PIN screen opens
// (lib/adminFlow.ts) and the call is retried exactly once. When the adult
// cancels — or there is no PIN yet to ask for — AdultCancelled is thrown and
// nothing has changed on the server. The PIN unlocks that one step: once it is
// done (or failed) the admin token is dropped (docs/privacy.md §PIN gate).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { adminToken, clearAdminToken, onAdminChange } from '../../lib/admin.js';
import { requestAdmin, type AdminPurpose } from '../../lib/adminFlow.js';
import { ApiError } from '../../lib/api/client.js';
import { messageFor } from '../../lib/errors.js';
import { toast } from '../lb/Toast.js';

export class AdultCancelled extends Error {
  constructor(readonly reason: 'cancelled' | 'no_pin') {
    super(`adult_${reason}`);
    this.name = 'AdultCancelled';
  }
}

type Options = {
  /** False while the account has no PIN: the PIN screen could only say so. */
  pinSet: boolean;
  /** What the parents approve; the PIN screen says it. */
  purpose: AdminPurpose;
  /** Called right before the PIN screen opens. */
  onPrompt?: () => void;
};

/**
 * Opens the PIN screen up front (for changes that certainly need the adult).
 * The caller's gated call (asAdultIfNeeded) or its own clean-up drops the token.
 */
export async function confirmAdult(pinSet: boolean, purpose: AdminPurpose): Promise<void> {
  if (!pinSet) throw new AdultCancelled('no_pin');
  if (!(await requestAdmin(purpose))) throw new AdultCancelled('cancelled');
}

/**
 * Runs `call`; on admin_required asks for the adult's PIN and retries once.
 * Either way the step is over afterwards, so the admin token is dropped.
 */
export async function asAdultIfNeeded<T>(call: () => Promise<T>, opts: Options): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'admin_required') throw err;
    if (!opts.pinSet) throw new AdultCancelled('no_pin');
    // The server says no valid token came with the call: one still held here (its expiry
    // judged by a wrong device clock) is dropped, so the PIN is really asked for
    // (admin-token-clock-skew-loop).
    clearAdminToken();
    opts.onPrompt?.();
    if (!(await requestAdmin(opts.purpose))) throw new AdultCancelled('cancelled');
    return await call();
  } finally {
    clearAdminToken();
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

/**
 * For a minor's profile the parents' PIN comes first: before a sheet opens that only they may
 * use. The PIN screen has to be gone before that sheet can open.
 */
export async function confirmAdultFirst(
  minor: boolean,
  pinSet: boolean,
  purpose: AdminPurpose,
): Promise<void> {
  if (!minor) return;
  const prompted = adminToken() === null;
  await confirmAdult(pinSet, purpose);
  if (prompted) await afterModalCloses();
}

/**
 * What a gated step that did not happen says: nothing when the adult cancelled, `noPin` when
 * there is no PIN yet to ask for, otherwise the error.
 */
export function toastAdultFailure(err: unknown, noPin: string): void {
  if (err instanceof AdultCancelled) {
    if (err.reason === 'no_pin') toast.show(noPin);
  } else {
    toast.show(messageFor(err), 'error');
  }
}

/**
 * Opening a sheet in the parents' area: the PIN first for a minor's profile, then `show`.
 * `opening` holds while the PIN screen is up, so a second tap starts nothing.
 */
export function useAdultOpener(minor: boolean, pinSet: boolean, purpose: AdminPurpose) {
  const { t } = useTranslation('settings');
  const [opening, setOpening] = useState(false);
  async function open(show: () => void): Promise<void> {
    if (opening) return;
    setOpening(true);
    try {
      await confirmAdultFirst(minor, pinSet, purpose);
      show();
    } catch (err) {
      toastAdultFailure(err, t('settings:pin_first'));
    } finally {
      setOpening(false);
    }
  }
  return { opening, open };
}

/** Whether the parents' PIN is unlocked right now (follows lib/admin.ts). */
export function useAdminUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState(() => adminToken() !== null);
  useEffect(() => {
    setUnlocked(adminToken() !== null);
    return onAdminChange(() => setUnlocked(adminToken() !== null));
  }, []);
  return unlocked;
}
