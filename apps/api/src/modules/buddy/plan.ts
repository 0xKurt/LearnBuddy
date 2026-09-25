// Planning primitives shared by tools, routes and background jobs: context
// versioning, subjects, exam wake-ups, agreed-step reminders.

import type { Db } from '../../lib/db.js';
import { addDays, daysBetween, localParts, zonedToInstant } from '../../lib/time.js';
import { cancelQueuedJobs, enqueueJob } from '../scheduler/jobs.js';
import type { SettingsRow } from './state.js';

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
