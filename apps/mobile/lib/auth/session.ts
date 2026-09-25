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

async function write(key: string, value: string): Promise<void> {
  if (web) globalThis.localStorage?.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}

async function remove(key: string): Promise<void> {
  if (web) globalThis.localStorage?.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

let cached: Session | null = null;
const listeners = new Set<(s: Session | null) => void>();

function emit(): void {
  for (const l of listeners) l(cached);
}

export function onSessionChange(listener: (s: Session | null) => void): () => void {
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
  emit();
}

export async function clearSession(): Promise<void> {
  cached = null;
  await Promise.all(Object.values(KEYS).map((k) => remove(k)));
  emit();
}
