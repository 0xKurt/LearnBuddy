// One scheduler run: everything Buddy does while the app is closed.
// docs/architecture.md §Background work.
//
// Called every minute by pg_cron (or any cron) via POST /internal/tick, and
// right after a learner submits photos. Safe to run concurrently: every
// piece of work is claimed with a lease (jobs, outreach, per-learner Buddy
// lease) and every handler is idempotent. Bounded by a time budget so a run
// never exceeds the function limit; unfinished work stays queued.

import type { Deps } from '../../deps.js';
import { queueStalledTurns, runLearnerJobs } from '../buddy/check.js';
import { checkReceipts, sendDueOutreach, type DeliveryStats } from '../buddy/delivery.js';
import { executeAccountDeletion } from '../identity/privacy.js';
import { abandonStaleUploads, purgePhotos, runExtraction } from '../materials/service.js';
import {
  claimJobs,
  finishJob,
  learnersWithDueJobs,
  recoverExpiredLeases,
  type JobRow,
} from './jobs.js';

export type TickStats = {
  recovered: number;
  stalledTurns: number;
  extractions: number;
  learners: number;
  maintenance: number;
  delivery: DeliveryStats | null;
  receipts: { checked: number; rejected: number } | null;
  errors: string[];
};

export async function runTick(deps: Deps, opts: { budgetMs?: number } = {}): Promise<TickStats> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const left = () => budget - (Date.now() - started);
  const stats: TickStats = {
    recovered: 0,
    stalledTurns: 0,
    extractions: 0,
    learners: 0,
    maintenance: 0,
    delivery: null,
    receipts: null,
    errors: [],
  };
  await deps.db.query(
    `insert into system_heartbeats (name, last_started_at) values ('tick', $1)
     on conflict (name) do update set last_started_at = $1`,
    [deps.now()],
  );

  const guard = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      stats.errors.push(`${label}: ${err instanceof Error ? err.message : 'error'}`);
    }
  };

  await guard('recover', async () => {
    stats.recovered = await recoverExpiredLeases(deps.db, deps.now());
    stats.stalledTurns = await queueStalledTurns(deps);
    // Material whose reading job gave up must not look "in progress" forever.
    await deps.db.query(
      `update materials m set status = 'failed', failure_reason = 'model_error'
        where m.status in ('queued','processing')
          and not exists (select 1 from jobs j where j.kind = 'extract_material'
                            and j.payload ->> 'material_id' = m.id::text and j.status in ('queued','running'))`,
    );
    await abandonStaleUploads(deps);
  });

  // Reading photos first: a learner is usually waiting for it.
  await guard('extract', async () => {
    while (left() > 20_000) {
      const [job] = await claimJobs(deps.db, {
        now: deps.now(),
        kinds: ['extract_material'],
        limit: 1,
        leaseSeconds: 180,
      });
      if (!job) break;
      await runJobSafely(deps, job, () => runExtraction(deps, job));
      stats.extractions++;
    }
  });

  await guard('buddy', async () => {
    const learners = await learnersWithDueJobs(
      deps.db,
      deps.now(),
      ['buddy_check', 'buddy_turn'],
      25,
    );
    for (const learnerId of learners) {
      if (left() < 12_000) break;
      // One learner's failure must not stop Buddy for everybody else; the
      // jobs stay leased and come back after the lease (bounded by attempts).
      await guard(`buddy[${learnerId.slice(0, 8)}]`, async () => {
        await runLearnerJobs(deps, learnerId);
      });
      stats.learners++;
    }
  });

  await guard('delivery', async () => {
    if (left() > 5_000) stats.delivery = await sendDueOutreach(deps);
  });
  await guard('receipts', async () => {
    if (left() > 5_000 && deps.push.enabled) stats.receipts = await checkReceipts(deps);
  });

  await guard('maintenance', async () => {
    while (left() > 5_000) {
      const [job] = await claimJobs(deps.db, {
        now: deps.now(),
        kinds: ['purge_photos', 'delete_account'],
        limit: 1,
        leaseSeconds: 120,
      });
      if (!job) break;
      await runJobSafely(deps, job, () =>
        job.kind === 'purge_photos' ? purgePhotos(deps, job) : executeAccountDeletion(deps, job),
      );
      stats.maintenance++;
    }
  });

  await deps.db.query(
    `update system_heartbeats set last_finished_at = $1, last_error = $2, stats = $3 where name = 'tick'`,
    [deps.now(), stats.errors[0] ?? null, JSON.stringify(stats)],
  );
  return stats;
}

/**
 * Request-path accelerator after a learner submits photos: read them now
 * instead of on the next scheduler run. The job lease makes this safe to
 * race with the scheduler.
 */
export async function runQueuedExtraction(deps: Deps, learnerId: string): Promise<void> {
  const [job] = await claimJobs(deps.db, {
    now: deps.now(),
    kinds: ['extract_material'],
    limit: 1,
    leaseSeconds: 180,
    learnerId,
  });
  if (!job) return;
  await runJobSafely(deps, job, () => runExtraction(deps, job));
  // The learner is waiting: let Buddy act on the result right away.
  await runLearnerJobs(deps, learnerId);
}

/** A handler that throws unexpectedly leaves the job to its lease/attempt limits. */
async function runJobSafely(deps: Deps, job: JobRow, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : 'error';
    if (job.attempts >= job.max_attempts) {
      await finishJob(deps.db, job, deps.now(), { status: 'failed', error: message });
    }
    // Otherwise the lease expires and the job is retried by a later run.
  }
}
