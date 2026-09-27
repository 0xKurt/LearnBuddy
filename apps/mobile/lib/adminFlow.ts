// "An adult has to confirm this": opens the PIN screen and resolves once the
// adult entered the PIN (true) or cancelled (false). The admin token itself
// lives in lib/admin.ts (memory only, for one step).
//
// Single flight: a second request while the PIN screen is open (a double tap
// on "Eltern fragen") joins the first instead of stacking another PIN pad.
// The screen names what is being approved (`purpose`).

import { router } from 'expo-router';

import { adminToken } from './admin.js';

export type AdminPurpose =
  | 'contact'
  | 'export'
  | 'delete'
  | 'cancel_deletion'
  | 'credentials'
  | 'profile'
  | 'consent';

let waiting: {
  purpose: AdminPurpose;
  promise: Promise<boolean>;
  resolve: (ok: boolean) => void;
} | null = null;

export function requestAdmin(purpose: AdminPurpose): Promise<boolean> {
  if (adminToken()) return Promise.resolve(true);
  if (waiting) return waiting.promise;
  let resolve: (ok: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  waiting = { purpose, promise, resolve };
  router.push('/pin');
  return promise;
}

/** What the open PIN screen is asked to approve (null: nobody is waiting). */
export function pendingAdminPurpose(): AdminPurpose | null {
  return waiting?.purpose ?? null;
}

/**
 * Called by the PIN screen when it closes. Returns whether a step was waiting
 * for it; when none was, the screen must not leave a token behind.
 */
export function finishAdmin(ok: boolean): boolean {
  const w = waiting;
  waiting = null;
  w?.resolve(ok);
  return w !== null;
}
