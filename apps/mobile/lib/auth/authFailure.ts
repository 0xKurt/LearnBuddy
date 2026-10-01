// Why a sign-in, a sign-up or a password change did not work, as its own module: the class
// carries no Supabase client and no React Native import, so the code that decides what a
// failure means — lib/errors.ts above all — stays testable under Node (the same reason
// lib/api/apiError.ts exists). lib/auth/supabase.ts re-exports it; nothing else changes.

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
    this.name = 'AuthFailure';
  }
}

/** Every reason the class knows, so a test can walk them all (issue #183). */
export const AUTH_FAILURE_REASONS: readonly AuthFailure['reason'][] = [
  'invalid_credentials',
  'email_not_confirmed',
  'weak_password',
  'already_registered',
  'same_password',
  'invalid_email',
  'email_taken',
  'reauth_needed',
  'session_expired',
  'link_invalid',
  'rate_limited',
  'network',
  'unknown',
];
