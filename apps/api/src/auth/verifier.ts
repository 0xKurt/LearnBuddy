// Verifies the Supabase access token the app sends. The API never handles
// passwords: sign-up, sign-in and password reset happen between the app and
// Supabase Auth. Tests inject a verifier that maps test tokens to users.

import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config.js';
import { AppError } from '../lib/errors.js';

export type AuthUser = {
  userId: string;
  email: string | null;
  /**
   * Seconds since epoch when the user last proved who they are (password,
   * e-mail link), from the token's `amr` claim, which survives token
   * refreshes. Not `iat`: a refreshed token is not a fresh sign-in.
   */
  authenticatedAt: number | null;
};

export interface AuthVerifier {
  /**
   * The user a token belongs to; null only when the token is definitely
   * invalid or expired. When Supabase Auth cannot answer (network, 5xx, 429)
   * it throws AppError('unavailable') — an outage is not a sign-out.
   */
  verify(token: string): Promise<AuthUser | null>;
  /** Deletes the auth user; the database cascades from it (account deletion). */
  deleteUser(userId: string): Promise<void>;
}

/** Latest interactive authentication recorded in a (verified) Supabase token. */
export function authenticatedAtOf(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      amr?: unknown;
    };
    if (!Array.isArray(json.amr)) return null;
    const times: number[] = [];
    for (const entry of json.amr as unknown[]) {
      const e = entry as { method?: unknown; timestamp?: unknown } | null;
      if (e && typeof e.timestamp === 'number' && e.method !== 'token_refresh')
        times.push(e.timestamp);
    }
    return times.length > 0 ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

/**
 * What a failed token check means. Only a definite answer from Supabase Auth
 * about the token (a 4xx other than 408/429) makes it invalid; a network
 * error (status 0 / none), a 5xx or a rate limit says nothing about the
 * token and must never reach the app as 401 (audit H-27).
 */
export function verifyFailureOf(error: { status?: number | undefined }): 'invalid' | 'unavailable' {
  const status = error.status;
  if (status === undefined || status === 0) return 'unavailable';
  if (status === 408 || status === 429 || status >= 500) return 'unavailable';
  return status >= 400 ? 'invalid' : 'unavailable';
}

export class SupabaseAuthVerifier implements AuthVerifier {
  private readonly client;

  constructor(config: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>) {
    this.client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async verify(token: string): Promise<AuthUser | null> {
    let result: Awaited<ReturnType<typeof this.client.auth.getUser>>;
    try {
      result = await this.client.auth.getUser(token);
    } catch {
      throw new AppError('unavailable', 'The sign-in service cannot be reached');
    }
    const { data, error } = result;
    if (error) {
      if (verifyFailureOf(error) === 'unavailable')
        throw new AppError('unavailable', 'The sign-in service cannot be reached');
      return null;
    }
    if (!data.user) return null;
    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      authenticatedAt: authenticatedAtOf(token),
    };
  }

  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(userId);
    if (error && !/not.?found/i.test(error.message)) throw new Error('could not delete auth user');
  }
}
