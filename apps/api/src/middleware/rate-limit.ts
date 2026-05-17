// Sliding-window rate limiter. Doc 04 §rate-limits.
// Postgres-backed so counters survive Vercel cold starts — the previous
// in-memory Map reset on every lambda invocation, making per_day limits
// ineffective in production (each instance had its own independent counter).

import type { MiddlewareHandler } from 'hono';
import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';

type CounterRow = { count: number; reset_at: string };

export function rateLimit(opts: {
  key: string;
  per_hour?: number;
  per_day?: number;
}): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get('auth');
    const learner = c.get('learner_id');
    const id = `${opts.key}:${auth?.account_id ?? 'anon'}:${learner ?? '-'}`;
    const now = Date.now();
    const limit = opts.per_hour ?? opts.per_day ?? Number.POSITIVE_INFINITY;
    const windowMs = opts.per_hour ? 3_600_000 : 86_400_000;

    const { supabase } = getDeps(c);

    const existing = await supabase
      .from('rate_limit_counters')
      .select('count, reset_at')
      .eq('id', id)
      .maybeSingle();

    if (existing.error) {
      // Storage outage — fail open so a DB hiccup doesn't block learners.
      await next();
      return;
    }

    const row = existing.data as CounterRow | null;
    const windowExpired = !row || new Date(row.reset_at).getTime() <= now;
    const currentCount = windowExpired ? 0 : row.count;

    if (currentCount >= limit) {
      const retryMs = windowExpired ? 0 : new Date(row!.reset_at).getTime() - now;
      const retry = Math.ceil(retryMs / 1000);
      c.header('Retry-After', String(retry));
      throw new ApiError('rate_limited', 'Rate limit exceeded', { retry_after_s: retry });
    }

    const newResetAt = windowExpired ? new Date(now + windowMs).toISOString() : row!.reset_at;

    await supabase.from('rate_limit_counters').upsert(
      {
        id,
        count: windowExpired ? 1 : currentCount + 1,
        reset_at: newResetAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    await next();
  };
}
