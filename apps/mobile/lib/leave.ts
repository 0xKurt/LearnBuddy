// Signing out on this device, from wherever it is offered: the parents' area,
// and the consent and profile steps of onboarding (always a way out, H-22).
// The root layout returns to the start screen once the session is gone.

import { clearAdminToken } from './admin.js';
import { signOut } from './auth/supabase.js';
import { unregisterDeviceForPush } from './push.js';

export async function signOutHere(): Promise<void> {
  clearAdminToken();
  // Still signed in: tell the server this phone no longer gets Buddy's messages.
  await unregisterDeviceForPush();
  await signOut();
}
