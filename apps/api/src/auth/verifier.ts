// Verifies the Supabase access token the app sends. The API never handles
// passwords: sign-up, sign-in and password reset happen between the app and
// Supabase Auth. Tests inject a verifier that maps test tokens to users.

import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config.js';

export type AuthUser = {
  userId: string;
  email: string | null;
  /** Seconds since epoch when the user last authenticated (for PIN reset). */
  authenticatedAt: number | null;
};

export interface AuthVerifier {
  verify(token: string): Promise<AuthUser | null>;
  /** Deletes the auth user; the database cascades from it (account deletion). */
  deleteUser(userId: string): Promise<void>;
}

function decodeIat(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      iat?: unknown;
    };
    return typeof json.iat === 'number' ? json.iat : null;
  } catch {
    return null;
  }
}

export class SupabaseAuthVerifier implements AuthVerifier {
  private readonly client;

  constructor(config: Config) {
    this.client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async verify(token: string): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      authenticatedAt: decodeIat(token),
    };
  }

  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(userId);
    if (error && !/not.?found/i.test(error.message)) throw new Error('could not delete auth user');
  }
}
