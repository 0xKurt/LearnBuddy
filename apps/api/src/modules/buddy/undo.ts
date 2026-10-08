// Undo: an applied action reversed — only while the thing it changed is still as it left it.
// Split from tools.ts (#311); the rules every tool keeps are written there.

import type { Db } from '../../lib/db.js';
import { daysBetween, localParts, zonedToInstant } from '../../lib/time.js';
import {
  bumpContext,
  cancelGoalWakeups,
  scheduleExamWakeups,
  scheduleStepReminder,
} from './plan.js';
import { loosens } from './policy.js';
import type { SettingsRow } from './state.js';
import { normalizeForMatch } from './text.js';
import { MAX_ACTIVE_MEMORIES, type UndoSpec } from './toolKit.js';

/**
 * Whether `runUndo` would apply right now: the same conditions, read-only. The home offers
 * "undo" only then (a photo request whose photo arrived, or settings changed since, cannot be
 * undone, so the button would only fail).
 */
export async function undoApplies(db: Db, learnerId: string, undo: UndoSpec): Promise<boolean> {
  const exists = async (sql: string, params: unknown[]) =>
    (await db.maybeOne(sql, params)) !== null;
  switch (undo.type) {
    case 'retract_memory':
      return exists(
        `select 1 from buddy_memories where id = $1 and learner_id = $2 and status = 'active'`,
        [undo.memory_id, learnerId],
      );
    case 'restore_memory':
      return exists(
        `select 1 from buddy_memories where id = $1 and learner_id = $2 and status = 'active'`,
        [undo.new_id, learnerId],
      );
    case 'unretract_memory':
      return (await unretractPlan(db, learnerId, undo.memory_id)) !== 'no';
    case 'rename_material_back':
      return exists(
        `select 1 from materials where id = $1 and learner_id = $2 and archived_at is null`,
        [undo.material_id, learnerId],
      );
    case 'unretract_memories': {
      // Offered while at least one of them can still come back; the ones whose undo window
      // has passed are gone for good and are not counted against it.
      const plans = await Promise.all(
        undo.memory_ids.map((id) => unretractPlan(db, learnerId, id)),
      );
      return plans.some((p) => p !== 'no');
    }
    case 'restore_level':
      return exists(
        `select 1 from learners where id = $1 and level = $2 and grade is not distinct from $3`,
        [learnerId, undo.expect_level, undo.expect_grade],
      );
    case 'drop_goal':
      return exists(
        `select 1 from buddy_goals where id = $1 and learner_id = $2 and status = 'active'`,
        [undo.goal_id, learnerId],
      );
    case 'restore_goal':
      return exists(
        `select 1 from buddy_goals where id = $1 and learner_id = $2 and version = $3`,
        [undo.goal_id, learnerId, undo.expect_version],
      );
    case 'cancel_step':
      return exists(
        `select 1 from buddy_steps where id = $1 and learner_id = $2 and state in ('planned','prepared')`,
        [undo.step_id, learnerId],
      );
    case 'restore_step':
      return exists(
        `select 1 from buddy_steps where id = $1 and learner_id = $2 and version = $3
            and state in ('planned','prepared','skipped','cancelled','done')`,
        [undo.step_id, learnerId, undo.expect_version],
      );
    case 'restore_settings':
      return exists(`select 1 from buddy_settings where learner_id = $1 and version = $2`, [
        learnerId,
        undo.expect_version,
      ]);
    case 'restore_voice':
      return exists(`select 1 from buddy_settings where learner_id = $1 and version = $2`, [
        learnerId,
        undo.expect_version,
      ]);
    case 'cancel_check':
      return exists(`select 1 from jobs where id = $1 and learner_id = $2 and status = 'queued'`, [
        undo.job_id,
        learnerId,
      ]);
  }
}

/**
 * Undoing a forget: 'restore' brings the memory back; 'known' means the same is known again
 * meanwhile, so the undo is done without a second copy (p2-J-memory-F7); 'no' when it is not
 * retracted any more or memory is full (the same cap as remember).
 */
async function unretractPlan(
  db: Db,
  learnerId: string,
  memoryId: string,
): Promise<'restore' | 'known' | 'no'> {
  const m = await db.maybeOne<{ statement: string }>(
    `select statement from buddy_memories where id = $1 and learner_id = $2 and status = 'retracted'`,
    [memoryId, learnerId],
  );
  if (!m) return 'no';
  const active = await db.query<{ statement: string }>(
    `select statement from buddy_memories where learner_id = $1 and status = 'active'`,
    [learnerId],
  );
  const key = normalizeForMatch(m.statement);
  if (active.some((a) => normalizeForMatch(a.statement) === key)) return 'known';
  return active.length >= MAX_ACTIVE_MEMORIES ? 'no' : 'restore';
}

/**
 * True when undoing this action would allow more contact to the phone than now (undoing a
 * pause, earlier quiet hours or avoided days). Under 16 that needs the adult (rule 6, ADR 0006).
 */
export async function undoLoosensContact(
  db: Db,
  learnerId: string,
  undo: UndoSpec,
  now: Date,
): Promise<boolean> {
  if (undo.type !== 'restore_settings') return false;
  const current = await db.one<SettingsRow>(`select * from buddy_settings where learner_id = $1`, [
    learnerId,
  ]);
  const restored: SettingsRow = {
    ...current,
    quiet_start: undo.quiet_start ?? current.quiet_start,
    quiet_end: undo.quiet_end ?? current.quiet_end,
    preferred_start: undo.preferred_start,
    preferred_end: undo.preferred_end,
    avoid_weekdays: undo.avoid_weekdays,
    paused_until: undo.paused_until ? new Date(undo.paused_until) : null,
  };
  return loosens(current, restored, now);
}

/** Reverse an applied action. Returns false when the thing changed since (no blind overwrite). */
export async function runUndo(
  db: Db,
  learnerId: string,
  undo: UndoSpec,
  now: Date,
): Promise<boolean> {
  switch (undo.type) {
    case 'retract_memory': {
      const r = await db.query(
        `update buddy_memories set status = 'retracted', closed_at = $3, version = version + 1
          where id = $1 and learner_id = $2 and status = 'active' returning id`,
        [undo.memory_id, learnerId, now],
      );
      return r.length === 1;
    }
    case 'restore_memory': {
      const r = await db.query(
        `update buddy_memories set status = 'retracted', closed_at = $3, version = version + 1
          where id = $1 and learner_id = $2 and status = 'active' returning id`,
        [undo.new_id, learnerId, now],
      );
      if (r.length !== 1) return false;
      await db.query(
        `update buddy_memories set status = 'active', closed_at = null, version = version + 1
          where id = $1 and learner_id = $2 and status = 'superseded'`,
        [undo.old_id, learnerId],
      );
      return true;
    }
    case 'unretract_memory': {
      const plan = await unretractPlan(db, learnerId, undo.memory_id);
      if (plan !== 'restore') return plan === 'known';
      const r = await db.query(
        `update buddy_memories set status = 'active', closed_at = null, version = version + 1
          where id = $1 and learner_id = $2 and status = 'retracted' returning id`,
        [undo.memory_id, learnerId],
      );
      return r.length === 1;
    }
    case 'unretract_memories': {
      let back = 0;
      for (const id of undo.memory_ids) {
        const plan = await unretractPlan(db, learnerId, id);
        if (plan === 'known') back++;
        if (plan !== 'restore') continue;
        const r = await db.query(
          `update buddy_memories set status = 'active', closed_at = null, version = version + 1
            where id = $1 and learner_id = $2 and status = 'retracted' returning id`,
          [id, learnerId],
        );
        back += r.length;
      }
      // Nothing came back only when every one of them is past its undo window.
      return back > 0;
    }
    case 'rename_material_back': {
      const r = await db.query(
        `update materials set title = $3
          where id = $1 and learner_id = $2 and archived_at is null returning id`,
        [undo.material_id, learnerId, undo.title],
      );
      await bumpContext(db, learnerId);
      return r.length === 1;
    }
    case 'restore_level': {
      const r = await db.query(
        `update learners set level = $2, grade = $3, version = version + 1
          where id = $1 and level = $4 and grade is not distinct from $5 returning id`,
        [learnerId, undo.level, undo.grade, undo.expect_level, undo.expect_grade],
      );
      return r.length === 1;
    }
    case 'drop_goal': {
      const r = await db.query(
        `update buddy_goals set status = 'dropped', closed_at = $3, version = version + 1
          where id = $1 and learner_id = $2 and status = 'active' returning id`,
        [undo.goal_id, learnerId, now],
      );
      if (r.length !== 1) return false;
      await db.query(
        `update buddy_steps set state = 'cancelled', version = version + 1, finished_at = $2
          where goal_id = $1 and state in ('planned','prepared')`,
        [undo.goal_id, now],
      );
      await cancelGoalWakeups(db, learnerId, undo.goal_id);
      return true;
    }
    case 'restore_goal': {
      const settings = await db.one<SettingsRow>(
        `select * from buddy_settings where learner_id = $1`,
        [learnerId],
      );
      const r = await db.query(
        `update buddy_goals set title = $3, due_date = $4, topics = $5, status = $6, outcome = $7,
                                closed_at = case when $6 = 'active' then null else closed_at end,
                                version = version + 1
          where id = $1 and learner_id = $2 and version = $8 returning kind`,
        [
          undo.goal_id,
          learnerId,
          undo.title,
          undo.due_date,
          undo.topics,
          undo.status,
          undo.outcome,
          undo.expect_version,
        ],
      );
      if (r.length !== 1) return false;
      if (
        undo.status === 'active' &&
        undo.due_date &&
        daysBetween(localParts(now, settings.timezone).date, undo.due_date) >= 0
      ) {
        await scheduleExamWakeups(db, learnerId, undo.goal_id, undo.due_date, settings, now);
      }
      for (const st of undo.steps ?? []) {
        const [step] = await db.query<{
          id: string;
          version: number;
          agreed: boolean;
          planned_date: string | null;
          planned_time: string | null;
        }>(
          `update buddy_steps set state = $3, finished_at = null, version = version + 1
            where id = $1 and learner_id = $2 and state = 'cancelled' and version = $4
            returning id, version, agreed, planned_date, planned_time`,
          [st.id, learnerId, st.state, st.expect_version],
        );
        // Her agreed reminder comes back with it, if its time is still ahead.
        if (step?.agreed && step.planned_date) {
          const when = zonedToInstant(
            step.planned_date,
            step.planned_time ?? settings.preferred_start,
            settings.timezone,
          );
          if (when.getTime() > now.getTime()) await scheduleStepReminder(db, learnerId, step, when);
        }
      }
      return true;
    }
    case 'cancel_step': {
      const r = await db.query(
        `update buddy_steps set state = 'cancelled', version = version + 1, finished_at = $3
          where id = $1 and learner_id = $2 and state in ('planned','prepared') returning id`,
        [undo.step_id, learnerId, now],
      );
      await db.query(
        `update jobs set status = 'cancelled'
          where learner_id = $1 and kind = 'buddy_check' and status = 'queued' and payload ->> 'step_id' = $2`,
        [learnerId, undo.step_id],
      );
      return r.length === 1;
    }
    case 'restore_step': {
      const r = await db.query(
        // `repeat` only when the undo record carries it: older records must not clear a
        // repetition they never knew about (issue #112).
        `update buddy_steps set state = $3, planned_date = $4, planned_time = $5, done_source = $6,
                                repeat = case when $8 then $9 else repeat end,
                                repeat_until = case when $8 then $10 else repeat_until end,
                                finished_at = null, version = version + 1
          where id = $1 and learner_id = $2 and version = $7
            and state in ('planned','prepared','skipped','cancelled','done')
          returning id, version, agreed, planned_date, planned_time`,
        [
          undo.step_id,
          learnerId,
          undo.state,
          undo.planned_date,
          undo.planned_time,
          undo.done_source,
          undo.expect_version,
          undo.repeat !== undefined,
          undo.repeat ?? null,
          undo.repeat_until ?? null,
        ],
      );
      const step = r[0] as { id: string; version: number; agreed: boolean } | undefined;
      if (!step) return false;
      if (step.agreed && undo.planned_date) {
        const settings = await db.one<SettingsRow>(
          `select * from buddy_settings where learner_id = $1`,
          [learnerId],
        );
        const when = zonedToInstant(
          undo.planned_date,
          undo.planned_time ?? settings.preferred_start,
          settings.timezone,
        );
        if (when.getTime() > now.getTime()) await scheduleStepReminder(db, learnerId, step, when);
      }
      return true;
    }
    case 'restore_settings': {
      // Only while the settings are exactly as the action left them: an
      // adult's later change is never overwritten by the learner's undo.
      const r = await db.query(
        `update buddy_settings set preferred_start = $2, preferred_end = $3, avoid_weekdays = $4,
                                   paused_until = $5,
                                   quiet_start = coalesce($7, quiet_start),
                                   quiet_end = coalesce($8, quiet_end), version = version + 1
          where learner_id = $1 and version = $6 returning learner_id`,
        [
          learnerId,
          undo.preferred_start,
          undo.preferred_end,
          undo.avoid_weekdays,
          undo.paused_until,
          undo.expect_version,
          undo.quiet_start ?? null,
          undo.quiet_end ?? null,
        ],
      );
      return r.length === 1;
    }
    case 'restore_voice': {
      // Only while nothing changed the settings since (an adult's change is never overwritten).
      const r = await db.query(
        `update buddy_settings set voice = $2, voice_speed = $3, version = version + 1
          where learner_id = $1 and version = $4 returning learner_id`,
        [learnerId, undo.voice, undo.speed, undo.expect_version],
      );
      return r.length === 1;
    }
    case 'cancel_check': {
      const r = await db.query(
        `update jobs set status = 'cancelled' where id = $1 and learner_id = $2 and status = 'queued' returning id`,
        [undo.job_id, learnerId],
      );
      return r.length === 1;
    }
  }
}
