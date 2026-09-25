// Sign-up, sign-in, password reset and changing e-mail or password go
// directly to Supabase Auth; the API only ever sees the resulting access
// token. Tokens are persisted by lib/auth/session.ts, not by the Supabase
// client (which only holds a session in memory while it needs one).

import { createClient, type Session as SupabaseSession } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { ENV } from '../env.js';
import type { RecoveryLink } from './recovery.js';
import { clearSession, currentSession, saveSession, type Session } from './session.js';

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
      | 'same_password'
      | 'invalid_email'
      | 'email_taken'
      | 'reauth_needed'
      | 'session_expired'
      | 'link_invalid'
      | 'rate_limited'
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

// Supabase Auth's stable error codes (AuthError.code), where they say more than the message.
const CODE_REASONS: Record<string, AuthFailure['reason']> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  weak_password: 'weak_password',
  user_already_exists: 'already_registered',
  email_exists: 'already_registered',
  same_password: 'same_password',
  email_address_invalid: 'invalid_email',
  reauthentication_needed: 'reauth_needed',
  refresh_token_not_found: 'session_expired',
  refresh_token_already_used: 'session_expired',
  session_not_found: 'session_expired',
  session_expired: 'session_expired',
  otp_expired: 'link_invalid',
  flow_state_expired: 'link_invalid',
  flow_state_not_found: 'link_invalid',
  bad_code_verifier: 'link_invalid',
  over_email_send_rate_limit: 'rate_limited',
  over_request_rate_limit: 'rate_limited',
};

function reasonOf(
  message: string,
  status: number | undefined,
  code?: string | undefined,
): AuthFailure['reason'] {
  const known = code ? CODE_REASONS[code] : undefined;
  if (known) return known;
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
  if (error || !data.session) {
    throw new AuthFailure(reasonOf(error?.message ?? '', error?.status, error?.code));
  }
  await saveSession(toSession(data.session));
}

/** Returns false when the e-mail has to be confirmed before signing in. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: 'learnbuddy://' },
  });
  if (error) throw new AuthFailure(reasonOf(error.message, error.status, error.code));
  if (!data.session) return false;
  await saveSession(toSession(data.session));
  return true;
}

/**
 * Where a link in an auth e-mail leads back to: the app's scheme on a phone,
 * this site on the web. Every such URL must be listed under "Redirect URLs"
 * in the Supabase project, or Supabase falls back to its Site URL.
 */
export function authRedirect(path: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/${path}`;
  }
  return `learnbuddy://${path}`;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirect('reset-password'),
  });
  if (error) throw new AuthFailure(reasonOf(error.message, error.status, error.code));
}

/**
 * Opens the session a password-reset link carries (app/reset-password.tsx).
 * It stays in the Supabase client's memory only: the app's own session is
 * saved once the new password is set (finishRecovery).
 */
export async function startRecovery(link: RecoveryLink): Promise<void> {
  const result =
    link.kind === 'tokens'
      ? await supabase.auth.setSession({
          access_token: link.accessToken,
          refresh_token: link.refreshToken,
        })
      : link.kind === 'code'
        ? await supabase.auth.exchangeCodeForSession(link.code)
        : link.kind === 'token_hash'
          ? await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
          : null;
  if (!result) throw new AuthFailure('link_invalid');
  const { data, error } = result;
  if (error) {
    const reason = reasonOf(error.message, error.status, error.code);
    // Only a missing connection is worth trying again; everything else means "ask for a new link".
    throw new AuthFailure(reason === 'network' ? 'network' : 'link_invalid');
  }
  if (!data.session) throw new AuthFailure('link_invalid');
}

/** Sets the new password on the recovery session and signs in with it. */
export async function finishRecovery(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new AuthFailure(reasonOf(error.message, error.status, error.code));
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new AuthFailure('link_invalid');
  await saveSession(toSession(data.session));
}

/** Leaves a recovery that was not finished (this device only; the app's own session is untouched). */
export async function abandonRecovery(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

/**
 * Runs an account change as the signed-in user. The Supabase client gets the
 * app's session first; if it refreshes the tokens on the way (refresh tokens
 * are single-use), the new ones are saved so the app keeps working.
 */
async function asSignedIn<T>(work: () => Promise<T>): Promise<T> {
  const s = currentSession();
  if (!s) throw new AuthFailure('session_expired');
  const { data, error } = await supabase.auth.setSession({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
  });
  if (error || !data.session) {
    throw new AuthFailure(
      error ? reasonOf(error.message, error.status, error.code) : 'session_expired',
    );
  }
  try {
    return await work();
  } finally {
    const { data: after } = await supabase.auth.getSession();
    const now = currentSession();
    if (
      after.session &&
      now?.user_id === after.session.user.id &&
      (after.session.refresh_token !== now.refresh_token ||
        (after.session.user.email ?? '') !== now.email)
    ) {
      await saveSession(toSession(after.session));
    }
  }
}

export async function changePassword(password: string): Promise<void> {
  await asSignedIn(async () => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new AuthFailure(reasonOf(error.message, error.status, error.code));
  });
}

/**
 * Asks Supabase to move the account to a new address. Normally that only
 * happens once the link in the confirmation e-mail is opened ('pending'; with
 * secure e-mail change, both the old and the new address get one); 'changed'
 * only when Supabase reports the new address as the account's address already.
 */
export async function changeEmail(email: string): Promise<'changed' | 'pending'> {
  return asSignedIn(async () => {
    const { data, error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: authRedirect('') },
    );
    if (error) {
      const reason = reasonOf(error.message, error.status, error.code);
      throw new AuthFailure(reason === 'already_registered' ? 'email_taken' : reason);
    }
    return data.user?.email?.toLowerCase() === email.toLowerCase() ? 'changed' : 'pending';
  });
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
