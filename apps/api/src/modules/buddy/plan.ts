// Planning primitives shared by tools, routes and background jobs: context
// versioning, subjects, exam wake-ups, agreed-step reminders.

import type { Db } from '../../lib/db.js';
import { addDays, daysBetween, localParts, weekdayOf, zonedToInstant } from '../../lib/time.js';
import { cancelQueuedJobs, enqueueJob } from '../scheduler/jobs.js';
import type { SettingsRow } from './state.js';

/**
 * The one lock order (audit M-45 apply-vs-tap-lock-order-deadlock): every transaction that
 * bumps the context takes the learner's settings row FIRST, before any step, goal, memory or
 * outreach row — as applying a decision does. Taps then wait for a running apply instead of
 * deadlocking with it.
 */
export async function lockContext(db: Db, learnerId: string): Promise<void> {
  await db.query(`select 1 from buddy_settings where learner_id = $1 for update`, [learnerId]);
}

/**
 * Every change Buddy's decisions depend on must go through here (or the
 * decision apply, which bumps once for the whole decision). A decision made
 * on an older version is stale and is not applied.
 */
export async function bumpContext(db: Db, learnerId: string): Promise<number> {
  const row = await db.one<{ context_version: number }>(
    `update buddy_settings set context_version = context_version + 1
      where learner_id = $1 returning context_version`,
    [learnerId],
  );
  return row.context_version;
}

/** Find the learner's subject by name (case-insensitive) or unique kind; else create it. */
export async function findOrCreateSubject(
  db: Db,
  learnerId: string,
  name: string,
  kind: string,
): Promise<{ id: string; name: string; created: boolean }> {
  const byName = await db.maybeOne<{ id: string; name: string }>(
    `select id, name from subjects
      where learner_id = $1 and archived_at is null and lower(name) = lower($2)`,
    [learnerId, name],
  );
  if (byName) return { ...byName, created: false };
  if (kind !== 'other') {
    const byKind = await db.query<{ id: string; name: string }>(
      `select id, name from subjects where learner_id = $1 and archived_at is null and kind = $2`,
      [learnerId, kind],
    );
    if (byKind.length === 1) return { ...byKind[0]!, created: false };
  }
  const created = await db.one<{ id: string; name: string }>(
    `insert into subjects (learner_id, name, kind) values ($1, $2, $3)
     on conflict (learner_id, lower(name)) where archived_at is null
       do update set name = subjects.name
     returning id, name`,
    [learnerId, name.slice(0, 60), kind],
  );
  return { ...created, created: true };
}

const COUNTDOWN_DAYS = [5, 3, 1] as const;

/**
 * Wake-ups for an exam: a few days before (to prepare or ask for material)
 * and the day after (to ask how it went). Times are the start of the
 * learner's preferred window, in their zone. Old wake-ups for the goal are
 * cancelled first, so moving a date never produces reminders for both dates.
 */
export async function scheduleExamWakeups(
  db: Db,
  learnerId: string,
  goalId: string,
  dueDate: string,
  settings: Pick<SettingsRow, 'timezone' | 'preferred_start'>,
  now: Date,
): Promise<void> {
  await cancelQueuedJobs(db, learnerId, 'buddy_check', { payloadKey: 'goal_id', value: goalId });
  const tz = settings.timezone;
  const today = localParts(now, tz).date;
  for (const n of COUNTDOWN_DAYS) {
    const day = addDays(dueDate, -n);
    if (daysBetween(today, day) < 0) continue;
    const runAt = zonedToInstant(day, settings.preferred_start, tz);
    if (runAt.getTime() <= now.getTime()) continue;
    await enqueueJob(db, {
      learnerId,
      kind: 'buddy_check',
      runAt,
      dedupeKey: `exam:${goalId}:${dueDate}:d${n}`,
      payload: { reason: 'exam_countdown', goal_id: goalId, days_before: n },
    });
  }
  const after = addDays(dueDate, 1);
  await enqueueJob(db, {
    learnerId,
    kind: 'buddy_check',
    runAt: zonedToInstant(after, settings.preferred_start, tz),
    dedupeKey: `exam:${goalId}:${dueDate}:after`,
    payload: { reason: 'exam_followup', goal_id: goalId },
  });
}

export async function cancelGoalWakeups(db: Db, learnerId: string, goalId: string): Promise<void> {
  await cancelQueuedJobs(db, learnerId, 'buddy_check', { payloadKey: 'goal_id', value: goalId });
}

/** Reminder job for an agreed step; the key includes the step version so a moved step gets a new one. */
export async function scheduleStepReminder(
  db: Db,
  learnerId: string,
  step: { id: string; version: number },
  at: Date,
): Promise<void> {
  await cancelQueuedJobs(db, learnerId, 'buddy_check', { payloadKey: 'step_id', value: step.id });
  await enqueueJob(db, {
    learnerId,
    kind: 'buddy_check',
    runAt: at,
    dedupeKey: `step:${step.id}:v${step.version}`,
    payload: { reason: 'step_due', step_id: step.id },
  });
}

/**
 * A repeating reminder moves itself on once its own reminder has fired (issue #112): the step
 * keeps its title, its time and its identity, and only its date advances. No row per
 * occurrence — rule 6 forbids showing a learner counts of missed days, so a history of
 * occurrences would be data we must never use.
 *
 * Returns the new date, or null when the repetition has run out (and is then cleared, so the
 * step is an ordinary one again and her state shows the truth).
 */
export async function rollRepeatingStep(
  db: Db,
  learnerId: string,
  step: {
    id: string;
    version: number;
    planned_date: string | null;
    planned_time: string | null;
    repeat: 'daily' | 'weekdays' | 'weekly' | null;
    repeat_until: string | null;
  },
  settings: { timezone: string },
  now: Date,
): Promise<string | null> {
  if (!step.repeat || !step.planned_time) return null;
  // Always counted from today, never from the stored date. That makes rolling idempotent:
  // the reminder fires at 17:00 and rolls, she practises at 17:05 and it rolls again — both
  // land on tomorrow, not on the day after. It is also what a phone that was off for a week
  // needs: one reminder tomorrow, not six missed ones at once.
  const today = localParts(now, settings.timezone).date;
  let next = addDays(today, 1);
  if (step.repeat === 'weekdays') {
    // Saturday and Sunday are skipped: "jeden Tag nach der Schule" means school days.
    while ([6, 7].includes(weekdayOf(next))) next = addDays(next, 1);
  } else if (step.repeat === 'weekly') {
    const target = weekdayOf(step.planned_date ?? today);
    while (weekdayOf(next) !== target) next = addDays(next, 1);
  }
  if (step.repeat_until && next > step.repeat_until) {
    await db.query(
      `update buddy_steps set repeat = null, repeat_until = null, version = version + 1 where id = $1`,
      [step.id],
    );
    return null;
  }
  const moved = await db.one<{ id: string; version: number }>(
    `update buddy_steps set planned_date = $2, state = 'planned', prepared_at = null,
                            evidence = null, done_source = null, finished_at = null,
                            version = version + 1
      where id = $1 returning id, version`,
    [step.id, next],
  );
  await scheduleStepReminder(
    db,
    learnerId,
    moved,
    zonedToInstant(next, step.planned_time, settings.timezone),
  );
  return next;
}
