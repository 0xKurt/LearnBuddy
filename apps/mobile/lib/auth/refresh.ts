// Exchanging the refresh token without ever turning an outage into a sign-out
// (audit H-28). Pure: the Supabase auth client, the clock and the session
// store are passed in (lib/auth/supabase.ts wires the real ones), so the
// classification runs under Node against the real supabase-js with a stubbed
// fetch (__tests__/refresh.test.ts).

/** The part of an auth error that says what it means. */
export type AuthErrorLike = {
  status?: number | undefined;
  code?: string | undefined;
  name?: string | undefined;
};

// Supabase Auth's codes for "this session is over" (sign in again).
const SESSION_OVER = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'user_banned',
  'bad_jwt',
]);

/**
 * `invalid`: Supabase Auth definitely said the refresh token is no good — the
 * session ends. `transient`: it could not say (no connection, 5xx, 408, 429,
 * an unreadable answer) — the tokens are kept and the refresh tried again later.
 */
export function refreshFailureOf(error: AuthErrorLike): 'invalid' | 'transient' {
  if (error.code && SESSION_OVER.has(error.code)) return 'invalid';
  if (error.name === 'AuthSessionMissingError') return 'invalid';
  const s = error.status;
  if (s === undefined || s === 0 || s === 408 || s === 429 || s >= 500) return 'transient';
  return s >= 400 ? 'invalid' : 'transient';
}

/** Retry spacing after transient failures: 2 s, 4 s, … up to a minute. */
export class RefreshBackoff {
  private failures = 0;
  private nextAt = 0;
  constructor(private readonly now: () => number) {}
  ready(): boolean {
    return this.now() >= this.nextAt;
  }
  failed(): void {
    this.failures += 1;
    this.nextAt = this.now() + Math.min(60_000, 1000 * 2 ** this.failures);
  }
  reset(): void {
    this.failures = 0;
    this.nextAt = 0;
  }
}

type RefreshClient<S> = {
  refreshSession(args: {
    refresh_token: string;
  }): Promise<{ data: { session: S | null }; error: AuthErrorLike | null }>;
};

export type Refresher<T> = (refreshToken: string) => Promise<T | null>;

/**
 * A refresh function: a new session is saved and returned; a definite "no"
 * clears the session (the caller's root listener shows the start screen, local
 * work stays for her next sign-in); anything else keeps the tokens and returns
 * null, retried after a backoff.
 */
export function createRefresher<S, T>(deps: {
  client: RefreshClient<S>;
  toSession: (s: S) => T;
  save: (s: T) => Promise<void>;
  clear: () => Promise<void>;
  backoff: RefreshBackoff;
}): Refresher<T> {
  return async (refreshToken) => {
    if (!deps.backoff.ready()) return null;
    let result: Awaited<ReturnType<RefreshClient<S>['refreshSession']>>;
    try {
      result = await deps.client.refreshSession({ refresh_token: refreshToken });
    } catch {
      deps.backoff.failed();
      return null;
    }
    const { data, error } = result;
    if (!error && data.session) {
      deps.backoff.reset();
      const next = deps.toSession(data.session);
      await deps.save(next);
      return next;
    }
    if (!error || refreshFailureOf(error) === 'transient') {
      deps.backoff.failed();
      return null;
    }
    deps.backoff.reset();
    await deps.clear();
    return null;
  };
}
