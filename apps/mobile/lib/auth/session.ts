// Session tokens. Native: expo-secure-store (Keychain / Keystore), one key per
// value so each stays under the platform size limit. Web (development and
// browser tests only): localStorage.

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type Session = {
  access_token: string;
  refresh_token: string;
  /** Seconds since epoch. */
  expires_at: number;
  user_id: string;
  /** For re-entering the password when the adult has to prove they are here. */
  email: string;
};

const KEYS = {
  access: 'lb.access_token',
  refresh: 'lb.refresh_token',
  expires: 'lb.expires_at',
  user: 'lb.user_id',
  email: 'lb.email',
} as const;

const web = Platform.OS === 'web';

async function read(key: string): Promise<string | null> {
  if (web) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

/**
 * Two things at once (audit 30.09., #133 position 5):
 *
 * `THIS_DEVICE_ONLY` keeps the tokens out of an encrypted device backup, so a restore onto
 * someone else's phone cannot carry a working refresh token with it.
 *
 * `AFTER_FIRST_UNLOCK` (instead of the default `WHEN_UNLOCKED`) lets the notification-action
 * task read the session while the phone is locked — "Heute nicht" and "Seltener schreiben"
 * are pressed from the lock screen. The press was kept and flushed later either way, so it
 * degraded gracefully, but it never completed there.
 */
const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY } as const;

async function write(key: string, value: string): Promise<void> {
  if (web) globalThis.localStorage?.setItem(key, value);
  else await SecureStore.setItemAsync(key, value, KEYCHAIN);
}

async function remove(key: string): Promise<void> {
  if (web) globalThis.localStorage?.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

/**
 * Why the session ended: `signed_out` — someone chose to (settings); `expired`
 * — Supabase Auth said it is over (password changed elsewhere, revoked). An
 * expired session never deletes her unsent answers or photos (audit H-28,
 * M-73): they wait for her next sign-in and go only if someone else signs in.
 */
export type SessionEnd = 'signed_out' | 'expired';

let cached: Session | null = null;
type Listener = (s: Session | null, ended: SessionEnd | null) => void;
const listeners = new Set<Listener>();

function emit(ended: SessionEnd | null): void {
  for (const l of listeners) l(cached, ended);
}

export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadSession(): Promise<Session | null> {
  const [access, refresh, expires, user, email] = await Promise.all([
    read(KEYS.access),
    read(KEYS.refresh),
    read(KEYS.expires),
    read(KEYS.user),
    read(KEYS.email),
  ]);
  cached =
    access && refresh && user
      ? {
          access_token: access,
          refresh_token: refresh,
          expires_at: Number(expires ?? 0),
          user_id: user,
          email: email ?? '',
        }
      : null;
  return cached;
}

export function currentSession(): Session | null {
  return cached;
}

export async function saveSession(s: Session): Promise<void> {
  cached = s;
  await Promise.all([
    write(KEYS.access, s.access_token),
    write(KEYS.refresh, s.refresh_token),
    write(KEYS.expires, String(s.expires_at)),
    write(KEYS.user, s.user_id),
    write(KEYS.email, s.email),
  ]);
  emit(null);
}

export async function clearSession(ended: SessionEnd): Promise<void> {
  cached = null;
  await Promise.all(Object.values(KEYS).map((k) => remove(k)));
  emit(ended);
}

// Whose unsent answers and photos are on this device. Survives the session:
// they are deleted only when a different user signs in (a shared phone).
const OWNER_KEY = 'lb.local_owner';

export async function localOwner(): Promise<string | null> {
  try {
    return await read(OWNER_KEY);
  } catch {
    return null;
  }
}

export async function setLocalOwner(userId: string | null): Promise<void> {
  try {
    if (userId) await write(OWNER_KEY, userId);
    else await remove(OWNER_KEY);
  } catch {
    // Unavailable storage: decided again at the next sign-in.
  }
}
