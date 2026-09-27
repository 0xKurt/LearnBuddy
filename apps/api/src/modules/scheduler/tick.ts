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
import {
  drainStorageDeletions,
  purgeClosedMemories,
  purgeContent,
  purgePhotos,
  sweepForgottenPhotos,
} from '../materials/purge.js';
import { abandonStaleUploads, markMaterialFailed, runExtraction } from '../materials/service.js';
import { closeIdleSessions } from '../practice/lifecycle.js';
import { handleParkedJobs } from './terminal.js';
import {
  claimJobs,
  finishJob,
  learnersWithDueJobs,
  PERSISTENT_KINDS,
  recoverExpiredLeases,
  rescheduleJob,
  type JobRow,
} from './jobs.js';

export type TickStats = {
  recovered: number;
  stalledTurns: number;
  extractions: number;
  learners: number;
  maintenance: number;
  /** Idle practice sessions finished or abandoned by this run. */
  idleSessions: number;
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
    idleSessions: 0,
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
    // Material whose reading job gave up must not look "in progress" forever. It fails the
    // same way as in the job — with its photo purge and a context bump (repro-14).
    await deps.db.tx(async (tx) => {
      const stuck = await tx.query<{ id: string }>(
        `select m.id from materials m
          where m.status in ('queued','processing') and m.archived_at is null
            and not exists (select 1 from jobs j where j.kind = 'extract_material'
                              and j.payload ->> 'material_id' = m.id::text
                              and j.status in ('queued','running'))
          for update of m skip locked`,
      );
      for (const m of stuck) await markMaterialFailed(tx, m.id, 'model_error', deps.now());
    });
    await abandonStaleUploads(deps);
  });

  // Sessions left alone past their limit are closed; their step goes back to Buddy
  // (decision D-5, practice/lifecycle.ts).
  await guard('sessions', async () => {
    stats.idleSessions = await closeIdleSessions(deps);
  });

  // Every parked job gets its defined effect (terminal.ts): no job kind ends silently.
  await guard('terminal', async () => {
    await handleParkedJobs(deps);
  });

  // Reading photos first: a learner is usually waiting for it.
  await guard('extract', async () => {
    while (left() > 20_000) {
      const [job] = await claimJobs(deps.db, {
        now: deps.now(),
        kinds: ['extract_material'],
        limit: 1,
        leaseSeconds: 180,
        // Reading and Buddy wait for an account's consent to the current privacy text;
        // erasure never does (p2-ml-consent-version-not-enforced-server-side).
        consentVersion: deps.config.CONSENT_VERSION,
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
      deps.config.CONSENT_VERSION,
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
        kinds: ['purge_photos', 'purge_content', 'delete_account'],
        limit: 1,
        leaseSeconds: 120,
      });
      if (!job) break;
      await runJobSafely(deps, job, () =>
        job.kind === 'purge_photos'
          ? purgePhotos(deps, job)
          : job.kind === 'purge_content'
            ? purgeContent(deps, job)
            : executeAccountDeletion(deps, job),
      );
      stats.maintenance++;
    }
  });
  // Retention that no job carries: photos Storage still owes after an account deletion,
  // photos no purge is planned for, and memories past their undo window (docs/privacy.md).
  await guard('retention', async () => {
    if (left() < 5_000) return;
    await drainStorageDeletions(deps);
    await sweepForgottenPhotos(deps);
    await purgeClosedMemories(deps);
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

/**
 * A handler that throws unexpectedly leaves the job to its lease/attempt limits. Erasure
 * jobs are never parked: they are queued again after a backoff, with the reason recorded.
 */
async function runJobSafely(deps: Deps, job: JobRow, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : 'error';
    if (PERSISTENT_KINDS.includes(job.kind)) {
      await rescheduleJob(deps.db, job, { now: deps.now(), error: message });
      return;
    }
    if (job.attempts >= job.max_attempts) {
      await finishJob(deps.db, job, deps.now(), { status: 'failed', error: message });
    }
    // Otherwise the lease expires and the job is retried by a later run.
  }
}
