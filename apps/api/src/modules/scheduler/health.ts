// Is background work really happening? docs/architecture.md §Background work (audit S-5, N-7).
//
// "Healthy" needs all of: a heartbeat that is recent, a last run without errors, and nothing
// due that has waited long without anyone picking it up. Parked jobs (failed after their
// attempts) are counted per kind with their last error, for the operator — each kind also has
// a defined effect for the learner (jobs.ts TERMINAL).

import type { Db } from '../../lib/db.js';
import type { JobKind } from './jobs.js';

/** A tick runs every minute; ten minutes without one means the scheduler is not running. */
export const SCHEDULER_STALE_MS = 10 * 60_000;

export type SchedulerHealth = {
  ok: boolean;
  /** ok · stale (no recent run, or due work nobody picked up) · failing (last run had errors) */
  state: 'ok' | 'stale' | 'failing';
  last_run_at: string | null;
  last_error: string | null;
  /** Jobs parked as failed in the last 24 hours, per kind, with the latest error. */
  parked: Partial<Record<JobKind, { count: number; last_error: string | null }>>;
};

export async function schedulerHealth(db: Db, now: Date): Promise<SchedulerHealth> {
  const hb = await db.maybeOne<{ last_finished_at: Date | null; last_error: string | null }>(
    `select last_finished_at, last_error from system_heartbeats where name = 'tick'`,
  );
  const lastRun = hb?.last_finished_at ?? null;
  const recent = lastRun !== null && now.getTime() - lastRun.getTime() < SCHEDULER_STALE_MS;
  // Nothing ran it: work due for longer than a stale heartbeat would allow (a mistyped tick
  // secret leaves no heartbeat at all — "unknown" must not look fine, audit M-67).
  const waiting = await db.maybeOne(
    `select 1 from jobs where status = 'queued' and run_at < $1 limit 1`,
    [new Date(now.getTime() - SCHEDULER_STALE_MS)],
  );
  const parkedRows = await db.query<{ kind: JobKind; count: number; last_error: string | null }>(
    `select kind, count(*)::int as count,
            (array_agg(last_error order by finished_at desc))[1] as last_error
       from jobs
      where status = 'failed' and finished_at > $1::timestamptz - interval '24 hours'
      group by kind`,
    [now],
  );
  const parked: SchedulerHealth['parked'] = {};
  for (const r of parkedRows) parked[r.kind] = { count: r.count, last_error: r.last_error };
  const state: SchedulerHealth['state'] =
    !recent || waiting ? 'stale' : hb?.last_error ? 'failing' : 'ok';
  return {
    ok: state === 'ok',
    state,
    last_run_at: lastRun ? lastRun.toISOString() : null,
    last_error: hb?.last_error ?? null,
    parked,
  };
}
