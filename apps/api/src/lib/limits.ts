// One lockout and rate-limit primitive (docs/architecture.md §Limits).
//
// A budget is a row in `attempt_counters` (migration 0014), keyed by scope and
// account. `consume` changes it with one atomic `insert … on conflict do
// update … returning`, so parallel requests are counted exactly: Postgres
// serialises the upsert on the row, and every attempt sees the count the one
// before it wrote. Times come from the app clock (rule 7).
//
// Two kinds of policy:
// - a rate limit (`limit` per `windowMs`): the attempt beyond the limit is
//   refused until the window ends;
// - a lockout (`lock` set): the attempt that reaches `limit` still runs, and
//   locks the budget for `lock.ms` — the same every time, no escalation
//   (ADR 0006). After the lock the count starts again. `reset` (e.g. the
//   right PIN) clears count and lock.
//
// Budgets exist only against abuse and never limit normal use (ADR 0006).

import type { Db } from './db.js';
import { AppError } from './errors.js';

export type LimitPolicy = {
  limit: number;
  windowMs: number;
  lock?: { ms: number };
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Budgets (docs/architecture.md §Limits, ADR 0006). */
export const POLICIES = {
  /** Wrong PINs, shared by every route that checks the PIN: 5 wrong → 15 minutes. */
  pin: { limit: 5, windowMs: 24 * HOUR, lock: { ms: 15 * MINUTE } },
  /** Replacing a forgotten PIN after a fresh password sign-in. */
  pin_recovery: { limit: 5, windowMs: HOUR },
  /** Practice answers (typed and spoken): a script, not a learner (10 a minute for an hour). */
  answers: { limit: 600, windowMs: HOUR },
  /** Messages to Buddy: a script, not a learner (2 a minute for an hour). */
  messages: { limit: 120, windowMs: HOUR },
  /**
   * Sentences newly read in Buddy's natural voice (cost protection, ADR 0008): far above a
   * whole hour of conversation. Beyond it the app reads with the phone's voice — never silence.
   */
  speech: { limit: 1000, windowMs: HOUR },
  /** Dictation (speech to text): like answers — a script, not a learner (issue #86). */
  voice: { limit: 600, windowMs: HOUR },
} as const satisfies Record<string, LimitPolicy>;

export type LimitScope = keyof typeof POLICIES;

export type ConsumeResult =
  | { allowed: true; count: number; lockedUntil: Date | null }
  | { allowed: false; reason: 'locked' | 'limit'; retryAfterMs: number; until: Date };

type CounterRow = {
  count: number;
  window_start: Date;
  locked_until: Date | null;
  refused: boolean;
};

/**
 * Takes one attempt from the budget. Atomic: a burst of parallel calls is
 * counted exactly, and at most `limit` of them are allowed per window/lock.
 */
export async function consume(
  db: Db,
  scope: LimitScope,
  accountId: string,
  now: Date,
  policy: LimitPolicy = POLICIES[scope],
): Promise<ConsumeResult> {
  const lock = policy.lock ?? null;
  // $1 scope, $2 account, $3 now, $4 window ms, $5 limit, $6 lock on?, $7 lock ms
  const row = await db.one<CounterRow>(
    `with p as (select $3::timestamptz as now, $5::int as lim, $6::boolean as lockout)
     insert into attempt_counters as a
       (scope, account_id, window_start, count, locked_until, refused, updated_at)
     select $1, $2, p.now,
            case when p.lockout and 1 >= p.lim then 0 else 1 end,
            case when p.lockout and 1 >= p.lim
                 then p.now + $7::bigint * interval '1 millisecond' end,
            false, p.now
       from p
     on conflict (scope, account_id) do update set
       -- The attempt number this call gets (1 when the window has run out).
       count = case
         when a.locked_until > $3::timestamptz then a.count
         when (case when a.window_start + ($4::bigint * interval '1 millisecond') <= $3::timestamptz
                    then 1 else a.count + 1 end) >= $5::int and $6::boolean then 0
         when a.window_start + ($4::bigint * interval '1 millisecond') <= $3::timestamptz then 1
         when not $6::boolean and a.count >= $5::int then a.count
         else a.count + 1 end,
       window_start = case
         when a.locked_until > $3::timestamptz then a.window_start
         when a.window_start + ($4::bigint * interval '1 millisecond') <= $3::timestamptz then $3::timestamptz
         else a.window_start end,
       locked_until = case
         when a.locked_until > $3::timestamptz then a.locked_until
         when $6::boolean and (case when a.window_start + ($4::bigint * interval '1 millisecond') <= $3::timestamptz
                                    then 1 else a.count + 1 end) >= $5::int
           then $3::timestamptz + $7::bigint * interval '1 millisecond'
         else null end,
       refused = coalesce(a.locked_until > $3::timestamptz, false)
         or (not $6::boolean
             and a.window_start + ($4::bigint * interval '1 millisecond') > $3::timestamptz
             and a.count >= $5::int),
       updated_at = $3::timestamptz
     returning count, window_start, locked_until, refused`,
    [scope, accountId, now, policy.windowMs, policy.limit, lock !== null, lock?.ms ?? 0],
  );
  if (row.refused) {
    const until =
      row.locked_until && row.locked_until > now
        ? row.locked_until
        : new Date(row.window_start.getTime() + policy.windowMs);
    return {
      allowed: false,
      reason: row.locked_until && row.locked_until > now ? 'locked' : 'limit',
      retryAfterMs: Math.max(0, until.getTime() - now.getTime()),
      until,
    };
  }
  return {
    allowed: true,
    count: row.count,
    lockedUntil: row.locked_until && row.locked_until > now ? row.locked_until : null,
  };
}

/** The lock currently in force, without taking an attempt. */
export async function lockedUntil(
  db: Db,
  scope: LimitScope,
  accountId: string,
  now: Date,
): Promise<Date | null> {
  const row = await db.maybeOne<{ locked_until: Date | null }>(
    `select locked_until from attempt_counters where scope = $1 and account_id = $2`,
    [scope, accountId],
  );
  return row?.locked_until && row.locked_until > now ? row.locked_until : null;
}

/** Clears count and lock (e.g. after the right PIN). */
export async function resetCounter(db: Db, scope: LimitScope, accountId: string): Promise<void> {
  await db.query(`delete from attempt_counters where scope = $1 and account_id = $2`, [
    scope,
    accountId,
  ]);
}

/** The error for a refused attempt: 423 for a lock, 429 for a rate limit, with Retry-After. */
export function limitError(result: Extract<ConsumeResult, { allowed: false }>): AppError {
  const details = {
    until: result.until.toISOString(),
    retry_after_s: Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
  };
  return result.reason === 'locked'
    ? new AppError('pin_locked', 'Too many wrong attempts', details)
    : new AppError('rate_limited', 'Too many requests; try again later', details);
}
