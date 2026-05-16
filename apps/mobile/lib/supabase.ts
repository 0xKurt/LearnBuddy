// Mobile Supabase anon client. Doc 04 §Auth ("Login and password reset
// handled client-side via Supabase Auth SDK") + Doc 05 §verify-email.
//
// The API uses Supabase server-side for service-role writes; on mobile we
// only need the anon client for the auth surface: email verification deep
// links (A1), login + password reset (A2), magic link (A2).
//
// Tokens we hand to `setSession` then flow through `lib/auth/session.ts`
// for persistent storage in `expo-secure-store`.

import { createClient } from '@supabase/supabase-js';

import { ENV } from './env.js';

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    // We persist the access + refresh tokens ourselves via `lib/auth/session.ts`
    // (encrypted by Keychain / Keystore via expo-secure-store). Supabase's
    // default AsyncStorage-backed persistence would store them in plain text.
    persistSession: false,
    autoRefreshToken: false,
    // RN doesn't expose the URL fragment to the SDK automatically; we feed
    // it explicitly in verify-email.tsx after the deep-link arrives.
    detectSessionInUrl: false,
  },
});

/**
 * Pull `access_token` and `refresh_token` out of a Supabase email-confirmation
 * deep link. Supabase encodes these in the URL fragment (`#…`), not query.
 * Returns null when either token is missing or the URL is malformed.
 */
export function parseAuthTokensFromUrl(
  url: string,
): { access_token: string; refresh_token: string } | null {
  const hashIdx = url.indexOf('#');
  if (hashIdx < 0) return null;
  const params = new URLSearchParams(url.slice(hashIdx + 1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}
