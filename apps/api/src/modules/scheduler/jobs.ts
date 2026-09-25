// Durable job queue on Postgres. docs/architecture.md §Background work.
//
// At-least-once execution with fencing: a claim sets a fresh lease token;
// finishing or retrying is a compare-and-set on that token, so a worker whose
// lease expired (crash, timeout, slow model call) can never overwrite the
// result of the worker that took over. Handlers are written to be idempotent.
// All times come from the caller's clock.

import type { Db } from '../../lib/db.js';

export type JobKind =
  | 'extract_material'
  | 'buddy_check'
  | 'buddy_turn'
  | 'purge_photos'
  | 'delete_account';

export type JobRow = {
  id: string;
  learner_id: string | null;
  kind: JobKind;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  run_at: Date;
  dedupe_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  lease_token: string | null;
  lease_until: Date | null;
  last_error: string | null;
};

export type NewJob = {
  learnerId: string | null;
  kind: JobKind;
  runAt: Date;
  /** Runs at most once per key and kind (a cancelled job with the key can be planned again). */
  dedupeKey: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
};

/**
 * Insert unless a job with the same kind + dedupe key is already queued,
 * running or finished. A cancelled one is planned again with the new time —
 * e.g. an exam moved away and back, an undone "exam is over", a deletion
 * that was cancelled and requested again. Returns the job id or null.
 */
export async function enqueueJob(db: Db, job: NewJob): Promise<string | null> {
  const row = await db.maybeOne<{ id: string }>(
    `insert into jobs (learner_id, kind, run_at, dedupe_key, payload, max_attempts)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (kind, dedupe_key) do update
       set status = 'queued', run_at = excluded.run_at, payload = excluded.payload,
           max_attempts = excluded.max_attempts, attempts = 0, lease_token = null, lease_until = null,
           last_error = null, result = null, finished_at = null
       where jobs.status = 'cancelled'
     returning id`,
    [job.learnerId, job.kind, job.runAt, job.dedupeKey, job.payload ?? {}, job.maxAttempts ?? 3],
  );
  return row?.id ?? null;
}

/** Return expired leases to the queue (or park them as failed after max attempts). */
export async function recoverExpiredLeases(db: Db, now: Date): Promise<number> {
  const rows = await db.query(
    `update jobs
        set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
            last_error = 'lease_expired',
            lease_token = null,
            lease_until = null,
            finished_at = case when attempts >= max_attempts then $1::timestamptz else null end
      where status = 'running' and lease_until < $1
      returning id`,
    [now],
  );
  return rows.length;
}

/** Claim up to `limit` due jobs of the given kinds (any learner). */
export async function claimJobs(
  db: Db,
  opts: { now: Date; kinds: JobKind[]; limit: number; leaseSeconds: number; learnerId?: string },
): Promise<JobRow[]> {
  return db.tx(async (tx) =>
    tx.query<JobRow>(
      `with due as (
         select id from jobs
          where status = 'queued' and run_at <= $1 and kind = any($2::text[])
            and ($5::uuid is null or learner_id = $5)
          order by run_at
          limit $3
          for update skip locked
       )
       update jobs j
          set status = 'running',
              lease_token = gen_random_uuid(),
              lease_until = $1 + make_interval(secs => $4),
              attempts = j.attempts + 1
         from due
        where j.id = due.id
       returning j.*`,
      [opts.now, opts.kinds, opts.limit, opts.leaseSeconds, opts.learnerId ?? null],
    ),
  );
}

/** Learners that have due jobs of these kinds (for per-learner batching). */
export async function learnersWithDueJobs(
  db: Db,
  now: Date,
  kinds: JobKind[],
  limit: number,
): Promise<string[]> {
  const rows = await db.query<{ learner_id: string }>(
    `select learner_id from jobs
      where status = 'queued' and run_at <= $1 and kind = any($2::text[]) and learner_id is not null
      group by learner_id
      order by min(run_at)
      limit $3`,
    [now, kinds, limit],
  );
  return rows.map((r) => r.learner_id);
}

/** Complete a job; false if the lease was lost (another worker owns it now). */
export async function finishJob(
  db: Db,
  job: JobRow,
  now: Date,
  outcome: { status: 'done' | 'failed'; result?: Record<string, unknown>; error?: string },
): Promise<boolean> {
  const rows = await db.query(
    `update jobs set status = $3, result = $4, last_error = $5, finished_at = $6,
                     lease_token = null, lease_until = null
      where id = $1 and lease_token = $2 and status = 'running'
      returning id`,
    [job.id, job.lease_token, outcome.status, outcome.result ?? null, outcome.error ?? null, now],
  );
  return rows.length === 1;
}

/**
 * Try again later. `countAttempt=false` (defer) gives the attempt back — used
 * when the job was not wrong, just not possible yet (quiet hours, learner busy).
 */
export async function retryJob(
  db: Db,
  job: JobRow,
  opts: { runAt: Date; error: string; countAttempt: boolean; now: Date },
): Promise<boolean> {
  const rows = await db.query(
    `update jobs
        set status = case when $5 and attempts >= max_attempts then 'failed' else 'queued' end,
            attempts = case when $5 then attempts else greatest(attempts - 1, 0) end,
            run_at = $3,
            last_error = $4,
            lease_token = null,
            lease_until = null,
            finished_at = case when $5 and attempts >= max_attempts then $6::timestamptz else null end
      where id = $1 and lease_token = $2 and status = 'running'
      returning id`,
    [job.id, job.lease_token, opts.runAt, opts.error, opts.countAttempt, opts.now],
  );
  return rows.length === 1;
}

export async function cancelQueuedJobs(
  db: Db,
  learnerId: string,
  kind: JobKind,
  filter: { payloadKey: string; value: string },
): Promise<number> {
  const rows = await db.query(
    `update jobs set status = 'cancelled'
      where learner_id = $1 and kind = $2 and status = 'queued' and payload ->> $3 = $4
      returning id`,
    [learnerId, kind, filter.payloadKey, filter.value],
  );
  return rows.length;
}
