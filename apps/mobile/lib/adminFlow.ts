// "An adult has to confirm this": opens the PIN screen and resolves once the
// adult entered the PIN (true) or cancelled (false). The admin token itself
// lives in lib/admin.ts (memory only, for one step).
//
// Single flight: a second request while the PIN screen is open (a double tap
// on "Eltern fragen") joins the first instead of stacking another PIN pad.
// The screen names what is being approved (`purpose`), and where one sentence cannot
// say it, the caller's own words (`detail`: what exactly the parents allow).

import { router } from 'expo-router';

import { adminToken } from './admin.js';

export type AdminPurpose =
  | 'contact'
  | 'export'
  | 'delete'
  | 'cancel_deletion'
  | 'credentials'
  | 'profile'
  | 'consent'
  | 'parents';

let waiting: {
  purpose: AdminPurpose;
  detail: string | null;
  promise: Promise<boolean>;
  resolve: (ok: boolean) => void;
} | null = null;

export function requestAdmin(
  purpose: AdminPurpose,
  detail: string | null = null,
): Promise<boolean> {
  if (adminToken()) return Promise.resolve(true);
  if (waiting) return waiting.promise;
  let resolve: (ok: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  waiting = { purpose, detail, promise, resolve };
  router.push('/pin');
  return promise;
}

/** What the open PIN screen is asked to approve (null: nobody is waiting). */
export function pendingAdminPurpose(): AdminPurpose | null {
  return waiting?.purpose ?? null;
}

/** What exactly the parents allow, when the caller said it (null: the purpose says it). */
export function pendingAdminDetail(): string | null {
  return waiting?.detail ?? null;
}

let forgot = false;

/**
 * Called by the PIN screen when it closes. Returns whether a step was waiting
 * for it; when none was, the screen must not leave a token behind. `forgotPin`:
 * the adult tapped "PIN vergessen?" (the step is not approved; see takeForgotPin).
 */
export function finishAdmin(ok: boolean, forgotPin = false): boolean {
  const w = waiting;
  waiting = null;
  forgot = !ok && forgotPin && w !== null;
  w?.resolve(ok);
  return w !== null;
}

/** Whether the last PIN request ended with "PIN vergessen?" (read once). */
export function takeForgotPin(): boolean {
  const was = forgot;
  forgot = false;
  return was;
}
