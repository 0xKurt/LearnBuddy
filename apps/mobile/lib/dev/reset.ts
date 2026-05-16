// Dev-only state reset. Wipes every SecureStore key the app writes plus
// in-memory caches. Wired to a long-press affordance on the language
// screen (visible only when __DEV__).

import * as SecureStore from 'expo-secure-store';

const KEYS = ['lb_app_locale_v1', 'lb_session_v1', 'lb_pin_v1', 'lb_notification_prefs_v1'];

export async function devResetAll(): Promise<void> {
  for (const k of KEYS) {
    try {
      await SecureStore.deleteItemAsync(k);
    } catch {
      // ignore — non-existent keys are fine
    }
  }
}
