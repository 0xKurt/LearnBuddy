// Idempotency-Key handling. Doc 04 §Conventions.
//
// For mutating endpoints, callers may include an `Idempotency-Key` header.
// If the same (account_id, route, key) tuple is seen again within 24h, we
// return the original stored response instead of re-running the handler.
//
// Storage is Postgres (`idempotency_keys`, migration 0010). The previous
// in-memory implementation broke on Vercel cold starts — a retry that
// landed on a different lambda instance would re-execute and potentially
// double-debit credits or double-call Vertex. The Postgres backing means
// the replay window holds across every instance in the deployment.

import type { MiddlewareHandler } from 'hono';

import { getDeps } from './deps.js';

const REPLAY_WINDOW_MS = 24 * 3_600 * 1_000;

type StoredRow = {
  status_code: number;
  response_body: string;
  response_headers: Record<string, string>;
  stored_at: string;
};

/**
 * Middleware: if `Idempotency-Key` is present and we've seen it before,
 * replay the stored response. Otherwise, run the handler and store the
 * response (for 2xx only — errors are not cached). Storage failures are
 * logged but do not block the request.
 */
export const idempotency: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('idempotency-key');
  if (!key) {
    return next();
  }
  const { supabase } = getDeps(c);
  const auth = c.get('auth');
  const accountKey = auth?.account_id ?? null;
  const route = c.req.path;

  // Look up an existing stored response. The unique index in migration 0010
  // uses `coalesce(account_id::text, 'anon')` so the (anon, route, key) tuple
  // collides correctly when no account is attached (i.e. on /auth/signup).
  // For the authenticated bucket use `.eq`; for the anon bucket use `.is(null)`
  // because PostgREST rejects `.eq(col, null)` (it would try to bind a null
  // parameter). The fake-supabase matches both forms identically.
  let lookupQ = supabase
    .from('idempotency_keys')
    .select('status_code, response_body, response_headers, stored_at')
    .eq('route', route)
    .eq('key', key);
  lookupQ =
    accountKey === null ? lookupQ.is('account_id', null) : lookupQ.eq('account_id', accountKey);
  const lookup = await lookupQ.maybeSingle();
  if (lookup.error) {
    // Storage outage shouldn't break the request. Log and proceed.
    console.warn(`[idempotency] lookup failed: ${lookup.error.message}`);
  }
  if (!lookup.error && lookup.data) {
    const row = lookup.data as StoredRow;
    const storedAt = row.stored_at ? new Date(row.stored_at).getTime() : Date.now();
    const age = Date.now() - storedAt;
    if (age < REPLAY_WINDOW_MS) {
      for (const [name, value] of Object.entries(row.response_headers ?? {})) {
        c.header(name, value);
      }
      c.header('Idempotent-Replay', 'true');
      return c.body(row.response_body, row.status_code as 200);
    }
  }

  await next();

  const res = c.res;
  if (res && res.status >= 200 && res.status < 300) {
    const body = await res.clone().text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      headers[name] = value;
    });
    const ins = await supabase.from('idempotency_keys').insert({
      account_id: accountKey,
      route,
      key,
      status_code: res.status,
      response_body: body,
      response_headers: headers,
      stored_at: new Date().toISOString(),
    });
    if (ins.error) {
      // A race where two concurrent requests both write the same key
      // raises a unique-violation on the partial index; harmless — the
      // first writer's value wins and is what subsequent retries see.
      console.warn(
        `[idempotency] store failed for ${accountKey ?? 'anon'}:${route}:${key}: ${ins.error.message}`,
      );
    }
  }
};

/** Test helper — no-op now that storage is Postgres-backed; the
 *  fake-supabase already wipes its tables between tests. Kept exported
 *  so existing test files don't break. */
export function _resetIdempotencyForTests(): void {
  // intentional no-op
}
