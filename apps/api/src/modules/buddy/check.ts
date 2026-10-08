// Background checks: Buddy acts without being asked. docs/architecture.md §Proactivity.
//
// Triggered by durable wake-ups (jobs): an exam approaching, the day after an
// exam, material that finished processing, a finished practice session, an
// agreed reminder, a check Buddy scheduled itself, a daily routine check.
//
// Order of gates (cheap and deterministic first, model last):
//   1. one worker per learner (lease on buddy_settings, checkLease.ts);
//   2. agreed reminders → deterministic template, no model (checkReminder.ts);
//   3. learner is in the app right now → look again in 20 minutes;
//   4. nothing to work with (no goals, no material) → silence, no model call;
//   5. model decides (prepare / propose a message / wait) within budget (checkDecide.ts);
//   6. apply atomically with the context fence; the contact policy decides
//      whether and when a proposed message is sent;
//   7. if the model is unavailable, fixed fallbacks keep time-critical help
//      working (prepared practice before an exam, "how did it go"; checkFallback.ts).
//
// The same worker takes over the learner's interrupted conversation turns (turnRecovery.ts).

import type { Deps } from '../../deps.js';
import { addDays, localParts, zonedToInstant } from '../../lib/time.js';
import { isMinor, type LearnerRow } from '../identity/model.js';
import { claimJobs, enqueueJob, finishJob } from '../scheduler/jobs.js';
import { decide } from './checkDecide.js';
import { fallback } from './checkFallback.js';
import { acquireLease, LEASE_SECONDS, LeaseLost, releaseLease } from './checkLease.js';
import { sendAgreedReminder } from './checkReminder.js';
import { triggerOf } from './checkTrigger.js';
import { markHandled } from './events.js';
import { testAhead } from './plan.js';
import { REVIEW_REASONS, runReviews } from './review.js';
import type { SettingsRow } from './state.js';
import { resumeTurns } from './turnRecovery.js';

export type CheckStats = { jobs: number; outcome: string };

/** Process all due Buddy jobs of one learner. Safe to call concurrently. */
export async function runLearnerJobs(deps: Deps, learnerId: string): Promise<CheckStats> {
  const now = deps.now();
  const token = await acquireLease(deps, learnerId, now);
  if (!token) return { jobs: 0, outcome: 'locked' };
  try {
    const jobs = await claimJobs(deps.db, {
      now,
      kinds: ['buddy_check', 'buddy_turn'],
      limit: 10,
      leaseSeconds: LEASE_SECONDS,
      learnerId,
    });
    if (jobs.length === 0) return { jobs: 0, outcome: 'none' };
    const learnerRow = await deps.db.maybeOne<LearnerRow>(`select * from learners where id = $1`, [
      learnerId,
    ]);
    if (!learnerRow) {
      for (const j of jobs)
        await finishJob(deps.db, j, now, { status: 'done', result: { outcome: 'no_learner' } });
      return { jobs: jobs.length, outcome: 'no_learner' };
    }
    const learner = { ...learnerRow, isMinor: isMinor(learnerRow, now) };

    // Interrupted conversation turns: take over with a new claim, run again.
    await resumeTurns(
      deps,
      learner,
      jobs.filter((j) => j.kind === 'buddy_turn'),
      now,
    );

    const triggers = jobs.filter((j) => j.kind === 'buddy_check').map(triggerOf);
    // Decided by code alone: agreed reminders, and Buddy's offers to review (#446).
    const byCode = new Set(['step_due', ...REVIEW_REASONS]);
    const agreed = triggers.filter((t) => t.reason === 'step_due');
    const reviews = triggers.filter((t) => REVIEW_REASONS.has(t.reason));
    // A check whose worker failed all its attempts comes back once, model-free (terminal.ts).
    const parked = triggers.filter((t) => !byCode.has(t.reason) && t.job.payload.fallback_only);
    const others = triggers.filter((t) => !byCode.has(t.reason) && !t.job.payload.fallback_only);

    for (const trig of agreed) await sendAgreedReminder(deps, learner, trig);
    await runReviews(
      deps,
      learner,
      reviews.map((r) => r.job),
    );
    if (parked.length > 0) {
      try {
        await fallback(deps, learner, parked, 'parked', { learnerId, token, jobs });
      } catch (err) {
        if (!(err instanceof LeaseLost)) throw err;
        return { jobs: jobs.length, outcome: 'lease_lost' };
      }
    }

    let outcome = 'done';
    if (others.length > 0) {
      try {
        outcome = await decide(deps, learner, others, { learnerId, token, jobs });
      } catch (err) {
        if (!(err instanceof LeaseLost)) throw err;
        return { jobs: jobs.length, outcome: 'lease_lost' };
      }
    }
    await markHandled(
      deps.db,
      learnerId,
      others.flatMap((t) => (t.eventId ? [t.eventId] : [])),
      deps.now(),
    );
    await ensureRoutine(deps, learnerId);
    return { jobs: jobs.length, outcome };
  } finally {
    await releaseLease(deps, learnerId, token);
  }
}

/** One quiet daily look while something is coming up; nothing when there is nothing to do. */
async function ensureRoutine(deps: Deps, learnerId: string): Promise<void> {
  const now = deps.now();
  const s = await deps.db.one<SettingsRow>(`select * from buddy_settings where learner_id = $1`, [
    learnerId,
  ]);
  const tz = s.timezone;
  const today = localParts(now, tz).date;
  if (!(await testAhead(deps.db, learnerId, today))) return;
  const next = addDays(today, 1);
  await enqueueJob(deps.db, {
    learnerId,
    kind: 'buddy_check',
    runAt: zonedToInstant(next, s.preferred_start, tz),
    dedupeKey: `routine:${learnerId}:${next}`,
    payload: { reason: 'routine' },
  });
}
