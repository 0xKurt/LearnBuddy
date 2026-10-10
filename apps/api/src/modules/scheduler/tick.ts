// One scheduler run: everything Buddy does while the app is closed.
// docs/architecture.md §Background work.
//
// Called every minute by pg_cron (or any cron) via POST /internal/tick, and
// right after a learner submits photos. Safe to run concurrently: every
// piece of work is claimed with a lease (jobs, outreach, per-learner Buddy
// lease) and every handler is idempotent. Bounded by a time budget so a run
// never exceeds the function limit; unfinished work stays queued.

import type { Deps } from '../../deps.js';
import { runLearnerJobs } from '../buddy/check.js';
import { queueStalledTurns } from '../buddy/turnRecovery.js';
import { checkReceipts, sendDueOutreach, type DeliveryStats } from '../buddy/delivery.js';
import { executeAccountDeletion } from '../identity/privacy.js';
import {
  drainStorageDeletions,
  purgeClosedMemories,
  purgeDecisionContent,
} from '../identity/retention.js';
import { planSummaries, runSummary } from '../buddy/summarise.js';
import { planConsolidations, runConsolidation } from '../buddy/consolidate.js';
import { purgeSpeechCache } from '../voice/speech.js';
import { jobKinds, tickWork, type JobHandler } from './registry.js';
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
  /** Closed memories erased after their 7-day undo window. */
  closed_memories: number;
  /** Expired cached speech rows deleted. */
  speech_cache: number;
  /** Old decision contents blanked plus old call-log rows deleted (90/180 days). */
  decision_content: number;
  /**
   * What a domain's own sweeps touched, by the key it registered (scheduler/registry.ts) — in
   * LearnBuddy `swept_photos`: materials whose forgotten photos got a purge job planned.
   */
  [sweep: string]: number;
};

export type TickStats = {
  recovered: number;
  stalledTurns: number;
  /** Jobs a learner waits for (in LearnBuddy: reading her photos), run by this tick. */
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
    // What the domain's own jobs left stuck when they gave up (registry.ts).
    for (const w of tickWork()) if (w.recover) await w.recover(deps);
  });

  // What was left alone past its limit is closed (in LearnBuddy: practice sessions, whose step
  // goes back to Buddy — decision D-5).
  await guard('sessions', async () => {
    for (const w of tickWork()) if (w.closeIdle) stats.idleSessions += await w.closeIdle(deps);
  });

  // Every parked job gets its defined effect (terminal.ts): no job kind ends silently.
  await guard('terminal', async () => {
    await handleParkedJobs(deps);
  });

  // What a learner waits for first (in LearnBuddy: reading her photos).
  await guard('extract', async () => {
    const waiting = jobKinds('waiting');
    while (waiting.length > 0 && left() > 20_000) {
      const [job] = await claimJobs(deps.db, {
        now: deps.now(),
        kinds: waiting.map((k) => k.kind),
        limit: 1,
        leaseSeconds: WAITING_LEASE_SECONDS,
        // Reading and Buddy wait for an account's consent to the current privacy text;
        // erasure never does (p2-ml-consent-version-not-enforced-server-side).
        consentVersion: deps.config.CONSENT_VERSION,
      });
      if (!job) break;
      await runJobSafely(deps, job, () => handlerOf(job)(deps, job));
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
        kinds: [...jobKinds('erasure').map((k) => k.kind), 'delete_account'],
        limit: 1,
        leaseSeconds: 120,
      });
      if (!job) break;
      await runJobSafely(deps, job, () => handlerOf(job)(deps, job));
      stats.maintenance++;
    }
  });

  // Retention that no job carries: photos Storage still owes after an account deletion,
  // the domain's own sweeps (in LearnBuddy: photos no purge is planned for), memories past their
  // undo window, Buddy's spoken audio after a day, and what the model wrote while deciding
  // (docs/privacy.md). The pass records what it removed on its own heartbeat — only when it ran
  // to the end, so a half-run never poses as a clean one (issue #78; GET /health reports it).
  await guard('retention', async () => {
    if (left() < 5_000) return;
    const startedAt = deps.now();
    const storage = await drainStorageDeletions(deps);
    const swept: Record<string, number> = {};
    for (const w of tickWork()) if (w.sweep) swept[w.sweep.key] = await w.sweep.run(deps);
    const closedMemories = await purgeClosedMemories(deps);
    const speechCache = await purgeSpeechCache(deps);
    const decisionContent = await purgeDecisionContent(deps);
    stats.retention = {
      storage_removed: storage.removed,
      storage_waiting: storage.waiting,
      ...swept,
      closed_memories: closedMemories,
      speech_cache: speechCache,
      decision_content: decisionContent,
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

/** The lease of a job a learner waits for. */
const WAITING_LEASE_SECONDS = 180;

/**
 * The handler of a claimed job of the waiting or the erasure lane (the kinds claimed above, and
 * only those): the registered one, or the core's own account deletion. Only work that must run
 * during a deletion or with consent long gone is in the erasure lane — model work
 * (summarise_session, consolidate_memories) is claimed behind the consent gate above and never
 * lands here (issue #85).
 */
function handlerOf(job: JobRow): JobHandler {
  const spec = [...jobKinds('waiting'), ...jobKinds('erasure')].find((k) => k.kind === job.kind);
  return spec?.run ?? executeAccountDeletion;
}

/**
 * Request-path accelerator after a learner sent something she waits for (in LearnBuddy: her
 * photos): run it now instead of on the next scheduler run. The job lease makes this safe to
 * race with the scheduler.
 */
export async function runWaitingJobNow(deps: Deps, learnerId: string): Promise<void> {
  const waiting = jobKinds('waiting');
  if (waiting.length === 0) return;
  const [job] = await claimJobs(deps.db, {
    now: deps.now(),
    kinds: waiting.map((k) => k.kind),
    limit: 1,
    leaseSeconds: WAITING_LEASE_SECONDS,
    learnerId,
  });
  if (!job) return;
  await runJobSafely(deps, job, () => handlerOf(job)(deps, job));
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
