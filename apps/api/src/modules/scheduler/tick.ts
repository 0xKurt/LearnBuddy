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
  purgeDecisionContent,
  purgePhotos,
  sweepForgottenPhotos,
} from '../materials/purge.js';
import { planSummaries, runSummary } from '../buddy/summarise.js';
import { planConsolidations, runConsolidation } from '../buddy/consolidate.js';
import { purgeSpeechCache } from '../voice/speech.js';
import { purgePerf } from '../perf/service.js';
import { purgeSpeculations } from '../practice/speculation.js';
import { abandonStaleUploads, markMaterialFailed, runExtraction } from '../materials/service.js';
import { closeIdleSessions } from '../practice/lifecycle.js';
import { handleParkedJobs } from './terminal.js';
import { modelThrottle, throttleAlarm, type ModelThrottle } from './throttle.js';
import {
  claimJobs,
  finishJob,
  learnersWithDueJobs,
  PERSISTENT_KINDS,
  recoverExpiredLeases,
  rescheduleJob,
  type JobRow,
} from './jobs.js';

/**
 * What one retention pass removed, per rule (issue #78: the sweeps must be observable —
 * counts and rows touched, never content). Stored on the 'retention' heartbeat and
 * reported by GET /health, so "do the cleanup jobs run?" has an answer.
 */
export type RetentionStats = {
  /** Storage paths removed from / still waiting on the durable deletion queue. */
  storage_removed: number;
  storage_waiting: number;
  /** Materials whose forgotten photos got a purge job planned (safety net). */
  swept_photos: number;
  /** Closed memories erased after their 7-day undo window. */
  closed_memories: number;
  /** Expired cached speech rows deleted. */
  speech_cache: number;
  /** Old decision contents blanked plus old call-log rows deleted (90/180 days). */
  decision_content: number;
  /** Records of preparations ahead older than 30 days (issue #59). */
  speculations: number;
  /** Device timing counts older than 180 days (issue #169). */
  perf_rollups: number;
};

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
  /** Null when the budget left no room for the retention pass this run. */
  retention: RetentionStats | null;
  /** The provider's 429 share over the last hour (issue #206); alarms into `errors`. */
  throttle: ModelThrottle | null;
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
    retention: null,
    throttle: null,
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

  // First, and one cheap query: is the provider refusing us? When it is, that is the reason
  // behind most of the other errors this run will report, so it leads the list — and the
  // owner reads an actionable line (a quota) instead of a dozen consequences (issue #206).
  await guard('throttle', async () => {
    stats.throttle = await modelThrottle(deps.db, deps.now());
    if (!stats.throttle.alarming) return;
    const alarm = throttleAlarm(stats.throttle);
    // Becomes the scheduler's last_error below, which GET /health reports with a 503.
    stats.errors.push(alarm);
    // And in the function log, where an operator looks first.
    console.warn('[scheduler] model throttle', { alarm });
  });

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

  // A conversation that has come to rest is written down in two to four sentences, so Buddy
  // still knows weeks later what she was doing (issue #22, modules/buddy/summarise.ts).
  // A model call on her conversation, so it stands behind the SAME consent gate as every
  // other model work — never in the erasure batch, which skips that gate on purpose
  // (issue #85: it inherited the exemption meant for deletions).
  await guard('summaries', async () => {
    if (left() < 10_000) return;
    await planSummaries(deps);
    while (left() > 10_000) {
      const [job] = await claimJobs(deps.db, {
        now: deps.now(),
        kinds: ['summarise_session'],
        limit: 1,
        leaseSeconds: 120,
        consentVersion: deps.config.CONSENT_VERSION,
      });
      if (!job) break;
      await runJobSafely(deps, job, () => runSummary(deps, job));
    }
  });

  // From ~45 things Buddy knows about her, the model is asked once per kind what says the
  // same thing twice and what a newer item contradicts, so there is room for something new
  // (issue #20, modules/buddy/consolidate.ts). A model call on what she told Buddy, so it
  // is claimed behind the SAME consent gate as the summaries above — never in the
  // maintenance batch, which skips that gate for deletions on purpose (issue #85).
  await guard('consolidate', async () => {
    if (left() < 10_000) return;
    await planConsolidations(deps);
    while (left() > 10_000) {
      const [job] = await claimJobs(deps.db, {
        now: deps.now(),
        kinds: ['consolidate_memories'],
        limit: 1,
        leaseSeconds: 120,
        consentVersion: deps.config.CONSENT_VERSION,
      });
      if (!job) break;
      await runJobSafely(deps, job, () => runConsolidation(deps, job));
    }
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
      await runJobSafely(deps, job, () => runMaintenanceJob(deps, job));
      stats.maintenance++;
    }
  });

  // Retention that no job carries: photos Storage still owes after an account deletion,
  // photos no purge is planned for, memories past their undo window, Buddy's spoken audio
  // after a day, and what the model wrote while deciding (docs/privacy.md). The pass
  // records what it removed on its own heartbeat — only when it ran to the end, so a
  // half-run never poses as a clean one (issue #78; GET /health reports it).
  await guard('retention', async () => {
    if (left() < 5_000) return;
    const startedAt = deps.now();
    const storage = await drainStorageDeletions(deps);
    const sweptPhotos = await sweepForgottenPhotos(deps);
    const closedMemories = await purgeClosedMemories(deps);
    const speechCache = await purgeSpeechCache(deps);
    const decisionContent = await purgeDecisionContent(deps);
    const speculations = await purgeSpeculations(deps);
    const perfRollups = await purgePerf(deps);
    stats.retention = {
      storage_removed: storage.removed,
      storage_waiting: storage.waiting,
      swept_photos: sweptPhotos,
      closed_memories: closedMemories,
      speech_cache: speechCache,
      decision_content: decisionContent,
      speculations,
      perf_rollups: perfRollups,
    };
    await deps.db.query(
      `insert into system_heartbeats (name, last_started_at, last_finished_at, stats)
       values ('retention', $1, $2, $3)
       on conflict (name) do update
         set last_started_at = $1, last_finished_at = $2, stats = $3`,
      [startedAt, deps.now(), JSON.stringify(stats.retention)],
    );
  });

  await deps.db.query(
    `update system_heartbeats set last_finished_at = $1, last_error = $2, stats = $3 where name = 'tick'`,
    [deps.now(), stats.errors[0] ?? null, JSON.stringify(stats)],
  );
  return stats;
}

/** The handler of a claimed maintenance job (the kinds claimed above, and only those). */
// Only work that must run during a deletion or with consent long gone — model work
// (summarise_session, consolidate_memories) is claimed behind the consent gate above
// and never lands here (issue #85).
function runMaintenanceJob(deps: Deps, job: JobRow): Promise<void> {
  switch (job.kind) {
    case 'purge_photos':
      return purgePhotos(deps, job);
    case 'purge_content':
      return purgeContent(deps, job);
    default:
      return executeAccountDeletion(deps, job);
  }
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
