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
//   locks the budget for `lock.baseMs`, doubling with every lock that follows
//   (15 min, 30 min, 1 h … up to `lock.maxMs`). `reset` (e.g. the right PIN)
//   clears count, lock and escalation.

import type { Db } from './db.js';
import { AppError } from './errors.js';

export type LimitPolicy = {
  limit: number;
  windowMs: number;
  lock?: { baseMs: number; maxMs: number };
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Budgets decided in D-14 (docs/architecture.md §Limits). */
export const POLICIES = {
  /** Wrong PINs, shared by every route that checks the PIN. */
  pin: { limit: 5, windowMs: 24 * HOUR, lock: { baseMs: 15 * MINUTE, maxMs: 24 * HOUR } },
  /** Replacing a forgotten PIN after a fresh password sign-in. */
  pin_recovery: { limit: 5, windowMs: HOUR },
  /** Practice answers (typed and spoken). */
  answers: { limit: 600, windowMs: HOUR },
  /** Messages to Buddy. */
  messages: { limit: 120, windowMs: HOUR },
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
  // $1 scope, $2 account, $3 now, $4 window ms, $5 limit, $6 lock on?, $7 base ms, $8 max ms
  const row = await db.one<CounterRow>(
    `with p as (
       select $3::timestamptz as now, ($4::bigint * interval '1 millisecond') as win,
              $5::int as lim, $6::boolean as lockout,
              $7::bigint as base_ms, $8::bigint as max_ms
     )
     insert into attempt_counters as a
       (scope, account_id, window_start, count, locked_until, lock_level, refused, updated_at)
     select $1, $2, p.now,
            case when p.lockout and 1 >= p.lim then 0 else 1 end,
            case when p.lockout and 1 >= p.lim
                 then p.now + least(p.base_ms, p.max_ms) * interval '1 millisecond' end,
            case when p.lockout and 1 >= p.lim then 1 else 0 end,
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
           then $3::timestamptz + least($7::bigint * power(2, a.lock_level)::bigint, $8::bigint)
                                  * interval '1 millisecond'
         else null end,
       lock_level = case
         when a.locked_until > $3::timestamptz then a.lock_level
         when $6::boolean and (case when a.window_start + ($4::bigint * interval '1 millisecond') <= $3::timestamptz
                                    then 1 else a.count + 1 end) >= $5::int
           then least(a.lock_level + 1, 30)
         else a.lock_level end,
       refused = coalesce(a.locked_until > $3::timestamptz, false)
         or (not $6::boolean
             and a.window_start + ($4::bigint * interval '1 millisecond') > $3::timestamptz
             and a.count >= $5::int),
       updated_at = $3::timestamptz
     returning count, window_start, locked_until, refused`,
    [
      scope,
      accountId,
      now,
      policy.windowMs,
      policy.limit,
      lock !== null,
      lock?.baseMs ?? 0,
      lock?.maxMs ?? 0,
    ],
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

/** Clears count, lock and escalation (e.g. after the right PIN). */
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
