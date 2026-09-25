// "An adult has to confirm this": opens the PIN screen and resolves once the
// adult entered the PIN (true) or cancelled (false). The admin token itself
// lives in lib/admin.ts (memory only, 10 minutes).

import { router } from 'expo-router';

import { adminToken } from './admin.js';

let waiting: ((ok: boolean) => void) | null = null;

export function requestAdmin(): Promise<boolean> {
  if (adminToken()) return Promise.resolve(true);
  waiting?.(false);
  return new Promise((resolve) => {
    waiting = resolve;
    router.push('/pin');
  });
}

/** Called by the PIN screen when it closes. */
export function finishAdmin(ok: boolean): void {
  const resolve = waiting;
  waiting = null;
  resolve?.(ok);
}
