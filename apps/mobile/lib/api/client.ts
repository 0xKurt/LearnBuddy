// Typed API client. Doc 02 §api + doc 04 entire + doc 09 §8.
//
// Single entry point for all server requests. Attaches the bearer token from
// the in-memory session cache, normalizes errors into `ApiError`, and lets
// callers pass a zod schema to validate the response shape.
//
// On 401 we attempt a single refresh via `supabase.auth.refreshSession()`
// (Doc 09 §8 "API tokens: short-lived 1h JWTs; refresh tokens are rotated"),
// persist the new tokens, and retry the original request once. Concurrent
// 401s share one in-flight refresh promise so an expired access-token storm
// doesn't fan out into N refresh attempts.
//
// Per-endpoint helpers live in `lib/api/auth.ts`, `lib/api/account.ts`, etc.
// Those files own the URL + zod schema; this file owns transport.

import { type z, type ZodTypeAny } from 'zod';

import { clearSession, getSessionSync, setSession, type Session } from '../auth/session.js';
import { ENV } from '../env.js';
import { supabase } from '../supabase.js';

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

type RequestOptions<S extends ZodTypeAny> = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Zod schema for the success-path response. Required for typed returns. */
  schema?: S;
  /** Idempotency-Key header value (per doc 04 §Conventions). */
  idempotencyKey?: string;
  /** Override the access token (e.g. mid-signup before session is stored). */
  authOverride?: string | null;
  /** X-Learner-Id header (per doc 04 §auth — required by `requireLearnerContext`). */
  learnerId?: string;
};

// Coalesce concurrent refreshes — one in-flight attempt, all callers await it.
let refreshInFlight: Promise<Session | null> | null = null;

async function attemptRefresh(): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const current = getSessionSync();
      if (!current) return null;
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: current.refresh_token,
      });
      if (error || !data.session) {
        await clearSession();
        return null;
      }
      const next: Session = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: current.user_id,
        account_id: current.account_id,
      };
      await setSession(next);
      return next;
    } catch {
      await clearSession();
      return null;
    } finally {
      // null after this microtask so a fresh failure doesn't hang the next call.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();
  return refreshInFlight;
}

/** Force a token refresh and return the fresh access token (or null if the
 *  session is dead). Used by the streaming turn endpoint, which bypasses
 *  `api()` and must handle a mid-conversation 401 itself. Shares the same
 *  in-flight coalescing as `api()`'s 401 path. */
export async function refreshAuthToken(): Promise<string | null> {
  const s = await attemptRefresh();
  return s?.access_token ?? null;
}

export async function api<S extends ZodTypeAny>(
  path: string,
  opts: RequestOptions<S>,
): Promise<z.infer<S>>;
export async function api(path: string, opts?: RequestOptions<ZodTypeAny>): Promise<unknown>;
export async function api<S extends ZodTypeAny>(
  path: string,
  opts: RequestOptions<S> = {},
): Promise<unknown> {
  const url = new URL(path, ENV.API_URL).toString();

  async function send(token: string | null | undefined): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
    if (opts.learnerId) headers['x-learner-id'] = opts.learnerId;
    return fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  }

  const initialToken =
    opts.authOverride !== undefined ? opts.authOverride : (getSessionSync()?.access_token ?? null);
  let res = await send(initialToken);

  if (res.status === 401 && opts.authOverride === undefined && getSessionSync()) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      res = await send(refreshed.access_token);
    }
  }

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const body = json as ApiErrorBody | undefined;
    throw new ApiError(
      body?.error?.code ?? 'unknown',
      body?.error?.message ?? `Request failed: ${res.status}`,
      res.status,
      body?.error?.details,
    );
  }

  if (opts.schema) {
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        'response_validation_failed',
        `Response shape mismatch at ${path}`,
        res.status,
        parsed.error.issues,
      );
    }
    return parsed.data;
  }
  return json;
}

/** Generate a UUID-ish idempotency key suitable for retry-safe POSTs. */
export function newIdempotencyKey(): string {
  // crypto.randomUUID is available in Hermes RN runtime since RN 0.74.
  return (
    globalThis.crypto?.randomUUID?.() ??
    `idemp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
