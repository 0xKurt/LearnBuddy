// Sliding-window rate limiter. Doc 04 §rate-limits.
// Stub: in-memory counters only; production uses Postgres-backed counters.

import type { MiddlewareHandler } from 'hono';
import { ApiError } from '../lib/errors.js';

type Window = { count: number; reset_at: number };
const buckets = new Map<string, Window>();

export function rateLimit(opts: { key: string; per_hour?: number; per_day?: number }): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get('auth');
    const learner = c.get('learner_id');
    const id = `${opts.key}:${auth?.account_id ?? 'anon'}:${learner ?? '-'}`;
    const now = Date.now();
    const limit = opts.per_hour ?? opts.per_day ?? Number.POSITIVE_INFINITY;
    const windowMs = opts.per_hour ? 3_600_000 : 86_400_000;
    const cur = buckets.get(id);
    if (!cur || cur.reset_at <= now) {
      buckets.set(id, { count: 1, reset_at: now + windowMs });
    } else if (cur.count >= limit) {
      const retry = Math.ceil((cur.reset_at - now) / 1000);
      c.header('Retry-After', String(retry));
      throw new ApiError('rate_limited', 'Rate limit exceeded', { retry_after_s: retry });
    } else {
      cur.count++;
    }
    await next();
  };
}
