// Sign-up, sign-in and password reset go directly to Supabase Auth; the API
// only ever sees the resulting access token. Tokens are persisted by
// lib/auth/session.ts, not by the Supabase client.

import { createClient, type Session as SupabaseSession } from '@supabase/supabase-js';

import { ENV } from '../env.js';
import { clearSession, saveSession, type Session } from './session.js';

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export class AuthFailure extends Error {
  constructor(
    readonly reason:
      | 'invalid_credentials'
      | 'email_not_confirmed'
      | 'weak_password'
      | 'already_registered'
      | 'network'
      | 'unknown',
  ) {
    super(reason);
  }
}

function toSession(s: SupabaseSession): Session {
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600),
    user_id: s.user.id,
    email: s.user.email ?? '',
  };
}

function reasonOf(message: string, status: number | undefined): AuthFailure['reason'] {
  const m = message.toLowerCase();
  if (m.includes('email not confirmed')) return 'email_not_confirmed';
  if (m.includes('invalid login') || m.includes('invalid credentials'))
    return 'invalid_credentials';
  if (m.includes('already registered') || m.includes('already exists')) return 'already_registered';
  if (m.includes('password') && (m.includes('weak') || m.includes('at least')))
    return 'weak_password';
  if (status === undefined || status === 0) return 'network';
  return 'unknown';
}

export async function signIn(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new AuthFailure(reasonOf(error?.message ?? '', error?.status));
  await saveSession(toSession(data.session));
}

/** Returns false when the e-mail has to be confirmed before signing in. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: 'learnbuddy://' },
  });
  if (error) throw new AuthFailure(reasonOf(error.message, error.status));
  if (!data.session) return false;
  await saveSession(toSession(data.session));
  return true;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'learnbuddy://',
  });
  if (error) throw new AuthFailure(reasonOf(error.message, error.status));
}

/** Exchanges the refresh token; clears the session when it is no longer valid. */
export async function refreshSession(refreshToken: string): Promise<Session | null> {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    // A network failure is not a sign-out: keep the tokens and try again later.
    if (error && reasonOf(error.message, error.status) === 'network') return null;
    await clearSession();
    return null;
  }
  const next = toSession(data.session);
  await saveSession(next);
  return next;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut().catch(() => undefined);
  await clearSession();
}
