// Session token storage. Doc 02 §auth + doc 05 §pin.
//
// Tokens are kept in `expo-secure-store` (encrypted by Keychain / Keystore).
// On mount the app should call `loadSession()` to hydrate the in-memory cache;
// `setSession()` persists and updates the cache; `clearSession()` wipes both.

import * as SecureStore from 'expo-secure-store';

const KEY_ACCESS = 'lb.session.access_token';
const KEY_REFRESH = 'lb.session.refresh_token';
const KEY_USER_ID = 'lb.session.user_id';
const KEY_ACCOUNT_ID = 'lb.session.account_id';

export type Session = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  account_id: string;
};

let cached: Session | null = null;

export async function loadSession(): Promise<Session | null> {
  const [a, r, u, acc] = await Promise.all([
    SecureStore.getItemAsync(KEY_ACCESS),
    SecureStore.getItemAsync(KEY_REFRESH),
    SecureStore.getItemAsync(KEY_USER_ID),
    SecureStore.getItemAsync(KEY_ACCOUNT_ID),
  ]);
  if (!a || !r || !u) {
    cached = null;
    return null;
  }
  // account_id may be empty string on the first login before getAccount() runs —
  // that's fine; the access_token is all that's needed to authenticate API calls.
  cached = { access_token: a, refresh_token: r, user_id: u, account_id: acc ?? '' };
  return cached;
}

export async function setSession(s: Session): Promise<void> {
  cached = s;
  await Promise.all([
    SecureStore.setItemAsync(KEY_ACCESS, s.access_token),
    SecureStore.setItemAsync(KEY_REFRESH, s.refresh_token),
    SecureStore.setItemAsync(KEY_USER_ID, s.user_id),
    SecureStore.setItemAsync(KEY_ACCOUNT_ID, s.account_id),
  ]);
}

export async function clearSession(): Promise<void> {
  cached = null;
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_ACCESS),
    SecureStore.deleteItemAsync(KEY_REFRESH),
    SecureStore.deleteItemAsync(KEY_USER_ID),
    SecureStore.deleteItemAsync(KEY_ACCOUNT_ID),
  ]);
}

export function getSessionSync(): Session | null {
  return cached;
}
