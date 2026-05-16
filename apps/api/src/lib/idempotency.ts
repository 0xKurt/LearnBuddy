// Idempotency-Key handling. Doc 04 §Conventions.
//
// For mutating endpoints, callers may include an `Idempotency-Key` header.
// If the same (account_id, key, route) is seen again within 24h, we return
// the original stored response instead of re-running the handler.
//
// Storage is Postgres — table `idempotency_keys` — created by a future
// migration. Until that migration lands the helper is in-memory and the
// behavior is best-effort. The contract is the same either way, so route
// handlers don't change when the table arrives.

import type { Context, MiddlewareHandler } from 'hono';

type StoredResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
  stored_at: number;
};

const REPLAY_WINDOW_MS = 24 * 3_600 * 1_000;
const inMemory = new Map<string, StoredResponse>();

function bucketKey(c: Context, key: string): string {
  const auth = c.get('auth');
  const route = c.req.path;
  return `${auth?.account_id ?? 'anon'}:${route}:${key}`;
}

/**
 * Middleware: if `Idempotency-Key` is present and we've seen it before,
 * replay the stored response. Otherwise, run the handler and store the
 * response (for 2xx only — errors are not cached).
 */
export const idempotency: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('idempotency-key');
  if (!key) {
    return next();
  }
  const bucket = bucketKey(c, key);
  const cached = inMemory.get(bucket);
  if (cached && Date.now() - cached.stored_at < REPLAY_WINDOW_MS) {
    for (const [name, value] of Object.entries(cached.headers)) {
      c.header(name, value);
    }
    c.header('Idempotent-Replay', 'true');
    return c.body(cached.body, cached.status as 200);
  }

  await next();

  const res = c.res;
  if (res && res.status >= 200 && res.status < 300) {
    const body = await res.clone().text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      headers[name] = value;
    });
    inMemory.set(bucket, {
      status: res.status,
      headers,
      body,
      stored_at: Date.now(),
    });
  }
};

/** Test helper — clears the in-memory cache between test cases. */
export function _resetIdempotencyForTests(): void {
  inMemory.clear();
}
