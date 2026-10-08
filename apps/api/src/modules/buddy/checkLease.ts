// The background check's lease: one worker per learner, held while it runs (gate 1).
// Split from check.ts (#311); docs/architecture.md §Proactivity.

import { randomUUID } from 'node:crypto';

import type { Deps } from '../../deps.js';
import type { JobRow } from '../scheduler/jobs.js';

export const LEASE_SECONDS = 150;

/** This worker's hold on one learner's checks, and on the jobs it claimed for them. */
export type CheckLease = { learnerId: string; token: string; jobs: JobRow[] };

/** Another worker took over (our lease ran out): stop without writing anything. */
export class LeaseLost extends Error {}

export async function acquireLease(
  deps: Deps,
  learnerId: string,
  now: Date,
): Promise<string | null> {
  const token = randomUUID();
  const row = await deps.db.maybeOne(
    `update buddy_settings set check_lease_token = $2, check_lease_until = $3::timestamptz + make_interval(secs => $4)
      where learner_id = $1 and (check_lease_until is null or check_lease_until < $3)
      returning learner_id`,
    [learnerId, token, now, LEASE_SECONDS],
  );
  return row ? token : null;
}

/**
 * Heartbeat (audit M-47 check-lease-shorter-than-runtime): before every model call the
 * learner lease and the claimed jobs' leases are extended by a full lease, so a check that
 * runs longer than one lease (several lookup and repair rounds on a slow provider day) is
 * never taken over — and run twice — while it is still alive. If the lease is already gone,
 * another worker owns the learner now: this one stops.
 */
export async function extendLease(deps: Deps, lease: CheckLease): Promise<void> {
  const now = deps.now();
  const held = await deps.db.maybeOne(
    `update buddy_settings set check_lease_until = $3::timestamptz + make_interval(secs => $4)
      where learner_id = $1 and check_lease_token = $2
      returning learner_id`,
    [lease.learnerId, lease.token, now, LEASE_SECONDS],
  );
  if (!held) throw new LeaseLost();
  await deps.db.query(
    `update jobs j set lease_until = $3::timestamptz + make_interval(secs => $4)
       from unnest($1::uuid[], $2::uuid[]) as mine(id, token)
      where j.id = mine.id and j.lease_token = mine.token and j.status = 'running'`,
    [lease.jobs.map((j) => j.id), lease.jobs.map((j) => j.lease_token), now, LEASE_SECONDS],
  );
}

export async function releaseLease(deps: Deps, learnerId: string, token: string): Promise<void> {
  await deps.db.query(
    `update buddy_settings set check_lease_token = null, check_lease_until = null
      where learner_id = $1 and check_lease_token = $2`,
    [learnerId, token],
  );
}
