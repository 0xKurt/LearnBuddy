// Dev-only state reset. Wipes every SecureStore key the app writes plus
// in-memory caches. Wired to the global DEV · NUKE pill in _layout.tsx.

import * as SecureStore from 'expo-secure-store';

import { clearSession, getSessionSync } from '../auth/session.js';

const KEYS = [
  'lb_app_locale_v1',
  'lb_session_v1',
  'lb_pin_v1',
  'lb_notification_prefs_v1',
  'lb_prefs_v1',
  'lb_whats_new_seen',
  'lb_session_count',
];

export async function devResetAll(): Promise<void> {
  await clearSession();
  for (const k of KEYS) {
    try {
      await SecureStore.deleteItemAsync(k);
    } catch {
      // ignore — non-existent keys are fine
    }
  }
}

/**
 * Hard-deletes the current account from Supabase Auth (cascades all DB rows),
 * then clears every local key.
 *
 * Does NOT need the API server — calls the Supabase Admin REST API directly
 * using EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY from .env.local (gitignored).
 *
 * Local state is always cleared regardless of whether the server delete worked.
 */
export async function devNukeAccount(): Promise<{ serverDeleted: boolean }> {
  let serverDeleted = false;

  const serviceKey = process.env.EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const session = getSessionSync();

  if (serviceKey && supabaseUrl && session?.user_id) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${session.user_id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      });
      // 404 = user already deleted — still counts as success.
      if (res.ok || res.status === 404) {
        serverDeleted = true;
      } else {
        const body = await res.text().catch(() => '');
        console.warn('[DEV NUKE] Supabase admin delete failed:', res.status, body);
      }
    } catch (e) {
      console.warn('[DEV NUKE] Supabase admin delete threw:', e);
    }
  } else {
    console.warn('[DEV NUKE] Missing service key or session — skipping server delete.');
  }

  await devResetAll();
  return { serverDeleted };
}
