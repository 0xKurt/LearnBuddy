// Signing out on this device, from wherever it is offered: the parents' area,
// and the consent and profile steps of onboarding (always a way out, H-22).
// The root layout returns to the start screen once the session is gone.

import { clearAdminToken } from './admin.js';
import { signOut } from './auth/supabase.js';
import { releaseLocalWork } from './localWork.js';
import { unregisterDeviceForPush } from './push.js';

/**
 * `keepLocalWork`: a way out of a screen that could not load (nothing was checked or
 * flushed): her unsent answers and photos stay for her next sign-in, and go only when
 * someone else signs in (lib/localWork.ts).
 */
export async function signOutHere(opts: { keepLocalWork?: boolean } = {}): Promise<void> {
  clearAdminToken();
  // Still signed in: tell the server this phone no longer gets Buddy's messages
  // (bounded in time; retried later if it cannot reach the server).
  await unregisterDeviceForPush();
  // A deliberate sign-out: nothing of hers stays on the device for the next person
  // (settings warned first when something was unsent; lib/localWork.ts).
  if (!opts.keepLocalWork) await releaseLocalWork().catch(() => undefined);
  await signOut();
}
