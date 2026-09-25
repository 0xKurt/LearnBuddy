// Buddy's tools: the only way a model decision changes anything.
// docs/architecture.md §Tools.
//
// Each tool validates its arguments against the CURRENT database state
// (inside the decision's transaction), applies a bounded internal change,
// and returns a summary for the card plus what is needed to undo it. A
// ToolRejection aborts the whole decision (nothing is applied) and its
// message goes back to the model for one repair round.
//
// Enforced here, not in the prompt: aliases resolve to this learner only;
// quotes must occur in the learner's latest message; dates are resolved from
// DaySpec/UntilSpec in the learner's zone and must lie in the allowed range;
// agreed times may not fall into quiet hours; contact can only be reduced or
// shifted, never turned on or increased.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import {
  daysBetween,
  inWindow,
  localParts,
  minutesOf,
  resolveDay,
  resolveLocalDateTime,
  resolveUntil,
  zonedToInstant,
  type DaySpec,
  type UntilSpec,
} from '../../lib/time.js';
import { t } from '../../i18n/index.js';
import { questionCountFor, selectPracticeItems } from '../practice/selection.js';
import { enqueueJob } from '../scheduler/jobs.js';
import type { Aliases } from './context.js';
import type { AnyAction } from './decision.js';
import {
  cancelGoalWakeups,
  findOrCreateSubject,
  scheduleExamWakeups,
  scheduleStepReminder,
} from './plan.js';
import type { GoalRow, MemoryRow, SettingsRow, StepRow } from './state.js';
import { normalizeForMatch, quoteOccursIn } from './text.js';

export class ToolRejection extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolRejection';
  }
}

export type ToolContext = {
  db: Db;
  learnerId: string;
  settings: SettingsRow;
  aliases: Aliases;
  now: Date;
  /** When the learner wrote the message this decision answers (or now for checks). */
  reference: Date;
  mode: 'turn' | 'check';
  latestLearnerText: string | null;
  triggerMessageId: string | null;
  /** Learner's app language, for titles the server writes itself. */
  locale: string;
  /** Shared by all actions of one decision: what earlier actions created. */
  created: { goalId: string | null; stepId: string | null };
};

export type UndoSpec =
  | { type: 'retract_memory'; memory_id: string }
  | { type: 'restore_memory'; old_id: string; new_id: string }
  | { type: 'unretract_memory'; memory_id: string }
  | {
      type: 'restore_level';
      level: string;
      grade: number | null;
      expect_level: string;
      expect_grade: number | null;
    }
  | { type: 'drop_goal'; goal_id: string }
  | {
      type: 'restore_goal';
      goal_id: string;
      title: string;
      due_date: string | null;
      topics: string[];
      status: string;
      outcome: string | null;
      /** Undo only if nothing changed the goal since (no blind overwrite). */
      expect_version: number;
    }
  | { type: 'cancel_step'; step_id: string }
  | {
      type: 'restore_step';
      step_id: string;
      state: string;
      planned_date: string | null;
      planned_time: string | null;
      done_source: string | null;
      expect_version: number;
    }
  | {
      type: 'restore_settings';
      preferred_start: string;
      preferred_end: string;
      avoid_weekdays: number[];
      paused_until: string | null;
      max_per_week: number;
      expect_version: number;
    }
  | { type: 'cancel_check'; job_id: string };

export type ToolOutcome = { summary: ActionSummary; undo: UndoSpec | null };

const MAX_ACTIVE_MEMORIES = 60;
const MAX_CONSTRAINT_DAYS = 60;
const MAX_PLAN_DAYS = 366;

// ─────────────── helpers ───────────────

function requireQuote(ctx: ToolContext, quote: string | null): void {
  if (ctx.mode !== 'turn')
    throw new ToolRejection('this change is not allowed in a background check');
  if (!quote || !ctx.latestLearnerText || !quoteOccursIn(quote, ctx.latestLearnerText)) {
    throw new ToolRejection(
      `quote "${quote ?? ''}" is not the learner's exact words from their latest message; only what they just said can justify this change`,
    );
  }
}

function today(ctx: ToolContext): string {
  return localParts(ctx.now, ctx.settings.timezone).date;
}

function resolveFutureDay(ctx: ToolContext, spec: DaySpec, what: string): string {
  const r = resolveDay(spec, ctx.reference, ctx.settings.timezone);
  if (!r.ok) {
    throw new ToolRejection(
      r.error === 'unresolved_time'
        ? `the day for ${what} is unclear — ask the learner instead of guessing`
        : `the day for ${what} is invalid (${r.error})`,
    );
  }
  const d = daysBetween(today(ctx), r.date);
  if (d < 0)
    throw new ToolRejection(
      `${what} would be on ${r.date}, which is in the past — ask the learner`,
    );
  if (d > MAX_PLAN_DAYS) throw new ToolRejection(`${what} is more than a year ahead`);
  return r.date;
}

function resolveEnd(ctx: ToolContext, spec: UntilSpec, what: string): Date {
  const r = resolveUntil(spec, ctx.reference, ctx.settings.timezone);
  if (!r.ok) {
    throw new ToolRejection(
      r.error === 'unresolved_time'
        ? `how long ${what} lasts is unclear — ask the learner`
        : `the end of ${what} is invalid (${r.error})`,
    );
  }
  if (r.until.getTime() <= ctx.now.getTime())
    throw new ToolRejection(`${what} would already be over`);
  if (r.until.getTime() - ctx.now.getTime() > MAX_CONSTRAINT_DAYS * 86_400_000) {
    throw new ToolRejection(`${what} is limited to ${MAX_CONSTRAINT_DAYS} days`);
  }
  return r.until;
}

function goalOf(ctx: ToolContext, alias: string): GoalRow {
  const g = ctx.aliases.goals.get(alias);
  if (!g) throw new ToolRejection(`unknown goal ${alias}`);
  return g;
}

function stepOf(ctx: ToolContext, alias: string): StepRow {
  const s = ctx.aliases.steps.get(alias);
  if (!s) throw new ToolRejection(`unknown step ${alias}`);
  return s;
}

function memoryOf(ctx: ToolContext, alias: string): MemoryRow {
  const m = ctx.aliases.memories.get(alias);
  if (!m) throw new ToolRejection(`unknown memory ${alias}`);
  return m;
}

async function lockGoal(ctx: ToolContext, id: string, ref: string): Promise<GoalRow> {
  const row = await ctx.db.maybeOne<GoalRow>(
    `select g.*, s.name as subject_name from buddy_goals g left join subjects s on s.id = g.subject_id
      where g.id = $1 and g.learner_id = $2 for update of g`,
    [id, ctx.learnerId],
  );
  if (!row) throw new ToolRejection(`goal ${ref} no longer exists`);
  return row;
}

async function currentGoal(ctx: ToolContext, alias: string): Promise<GoalRow> {
  return lockGoal(ctx, goalOf(ctx, alias).id, alias);
}

/** A goal alias, or "new" = the test plan_exam created earlier in this decision. */
async function targetGoal(ctx: ToolContext, ref: string): Promise<GoalRow> {
  if (ref !== 'new') return currentGoal(ctx, ref);
  if (!ctx.created.goalId) {
    throw new ToolRejection(
      '"new" refers to a test planned with plan_exam earlier in this same answer — there is none',
    );
  }
  return lockGoal(ctx, ctx.created.goalId, 'new');
}

async function currentStep(ctx: ToolContext, alias: string): Promise<StepRow> {
  const s = stepOf(ctx, alias);
  const row = await ctx.db.maybeOne<StepRow>(
    `select * from buddy_steps where id = $1 and learner_id = $2 for update`,
    [s.id, ctx.learnerId],
  );
  if (!row) throw new ToolRejection(`step ${alias} no longer exists`);
  return row;
}

// ─────────────── tools ───────────────

export async function runTool(action: AnyAction, ctx: ToolContext): Promise<ToolOutcome> {
  switch (action.tool) {
    case 'remember': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      let validUntil: Date | null = null;
      if (a.kind === 'constraint') {
        if (!a.until) throw new ToolRejection('a temporary situation (constraint) needs an until');
        validUntil = resolveEnd(ctx, a.until, 'this situation');
      }
      const existing = await ctx.db.query<{ id: string; statement: string }>(
        `select id, statement from buddy_memories
          where learner_id = $1 and status = 'active' and (valid_until is null or valid_until > $2)`,
        [ctx.learnerId, ctx.now],
      );
      const same = existing.find(
        (m) => normalizeForMatch(m.statement) === normalizeForMatch(a.statement),
      );
      if (same) {
        return {
          summary: {
            tool: 'remember',
            memory_id: same.id,
            statement: same.statement,
            kind: a.kind,
            valid_until: null,
          },
          undo: null,
        };
      }
      if (existing.length >= MAX_ACTIVE_MEMORIES) {
        throw new ToolRejection('memory is full — ask the learner which old item to forget');
      }
      const row = await ctx.db.one<{ id: string }>(
        `insert into buddy_memories (learner_id, kind, statement, source, source_message_id, quote, valid_until,
                                     created_at)
         values ($1, $2, $3, 'learner_stated', $4, $5, $6, $7) returning id`,
        [ctx.learnerId, a.kind, a.statement, ctx.triggerMessageId, a.quote, validUntil, ctx.now],
      );
      return {
        summary: {
          tool: 'remember',
          memory_id: row.id,
          statement: a.statement,
          kind: a.kind,
          valid_until: validUntil ? validUntil.toISOString() : null,
        },
        undo: { type: 'retract_memory', memory_id: row.id },
      };
    }

    case 'correct_memory': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      const old = memoryOf(ctx, a.memory);
      const updated = await ctx.db.query(
        `update buddy_memories set status = 'superseded', version = version + 1
          where id = $1 and learner_id = $2 and status = 'active' returning id`,
        [old.id, ctx.learnerId],
      );
      if (updated.length !== 1) throw new ToolRejection(`memory ${a.memory} changed meanwhile`);
      const row = await ctx.db.one<{ id: string }>(
        `insert into buddy_memories (learner_id, kind, statement, source, source_message_id, quote,
                                     valid_until, supersedes_id, created_at)
         values ($1, $2, $3, 'learner_stated', $4, $5, $6, $7, $8) returning id`,
        [
          ctx.learnerId,
          old.kind,
          a.statement,
          ctx.triggerMessageId,
          a.quote,
          old.valid_until,
          old.id,
          ctx.now,
        ],
      );
      return {
        summary: { tool: 'correct_memory', memory_id: row.id, statement: a.statement },
        undo: { type: 'restore_memory', old_id: old.id, new_id: row.id },
      };
    }

    case 'forget': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      const m = memoryOf(ctx, a.memory);
      const updated = await ctx.db.query(
        `update buddy_memories set status = 'retracted', version = version + 1
          where id = $1 and learner_id = $2 and status = 'active' returning id`,
        [m.id, ctx.learnerId],
      );
      if (updated.length !== 1) throw new ToolRejection(`memory ${a.memory} changed meanwhile`);
      return {
        summary: { tool: 'forget', memory_id: m.id, statement: m.statement },
        undo: { type: 'unretract_memory', memory_id: m.id },
      };
    }

    case 'set_level': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      const grade = a.level === 'school' ? a.grade : null;
      const before = await ctx.db.one<{ level: string; grade: number | null }>(
        `select level, grade from learners where id = $1 for update`,
        [ctx.learnerId],
      );
      await ctx.db.query(
        `update learners set level = $2, grade = $3, version = version + 1 where id = $1`,
        [ctx.learnerId, a.level, grade],
      );
      return {
        summary: { tool: 'set_level', level: a.level, grade },
        undo: {
          type: 'restore_level',
          level: before.level,
          grade: before.grade,
          expect_level: a.level,
          expect_grade: grade,
        },
      };
    }

    case 'plan_exam': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      const due = resolveFutureDay(ctx, a.day, 'the test');
      const subject = await findOrCreateSubject(ctx.db, ctx.learnerId, a.subject, a.subject_kind);
      const duplicate = await ctx.db.maybeOne<{ id: string; title: string }>(
        `select id, title from buddy_goals
          where learner_id = $1 and kind = 'exam' and status = 'active' and subject_id = $2 and due_date = $3`,
        [ctx.learnerId, subject.id, due],
      );
      if (duplicate) {
        throw new ToolRejection(
          `an active test "${duplicate.title}" already exists for this subject on ${due}; use update_goal instead`,
        );
      }
      const goal = await ctx.db.one<{ id: string }>(
        `insert into buddy_goals (learner_id, kind, title, subject_id, due_date, topics)
         values ($1, 'exam', $2, $3, $4, $5) returning id`,
        [ctx.learnerId, a.title, subject.id, due, a.topics],
      );
      await scheduleExamWakeups(ctx.db, ctx.learnerId, goal.id, due, ctx.settings, ctx.now);
      ctx.created.goalId = goal.id;
      return {
        summary: {
          tool: 'plan_exam',
          goal_id: goal.id,
          title: a.title,
          due_date: due,
          subject_name: subject.name,
        },
        undo: { type: 'drop_goal', goal_id: goal.id },
      };
    }

    case 'update_goal': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      const g = await currentGoal(ctx, a.goal);
      if (g.status !== 'active') throw new ToolRejection(`goal ${a.goal} is not active`);
      const due = a.day ? resolveFutureDay(ctx, a.day, 'the new date') : g.due_date;
      const title = a.title ?? g.title;
      const topics = a.topics ?? g.topics;
      await ctx.db.query(
        `update buddy_goals set title = $2, due_date = $3, topics = $4, version = version + 1 where id = $1`,
        [g.id, title, due, topics],
      );
      if (due && due !== g.due_date && g.kind === 'exam') {
        await scheduleExamWakeups(ctx.db, ctx.learnerId, g.id, due, ctx.settings, ctx.now);
      }
      return {
        summary: { tool: 'update_goal', goal_id: g.id, title, due_date: due },
        undo: {
          type: 'restore_goal',
          goal_id: g.id,
          title: g.title,
          due_date: g.due_date,
          topics: g.topics,
          status: g.status,
          outcome: g.outcome,
          expect_version: g.version + 1,
        },
      };
    }

    case 'close_goal': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      const g = await currentGoal(ctx, a.goal);
      if (g.status !== 'active') throw new ToolRejection(`goal ${a.goal} is already closed`);
      await ctx.db.query(
        `update buddy_goals set status = $2, outcome = $3, closed_at = $4, version = version + 1 where id = $1`,
        [g.id, a.status, a.outcome, ctx.now],
      );
      await ctx.db.query(
        `update buddy_steps set state = 'cancelled', version = version + 1, finished_at = $2
          where goal_id = $1 and state in ('planned','prepared')`,
        [g.id, ctx.now],
      );
      await cancelGoalWakeups(ctx.db, ctx.learnerId, g.id);
      return {
        summary: {
          tool: 'close_goal',
          goal_id: g.id,
          title: g.title,
          status: a.status,
          outcome: a.outcome,
        },
        undo: {
          type: 'restore_goal',
          goal_id: g.id,
          title: g.title,
          due_date: g.due_date,
          topics: g.topics,
          status: 'active',
          outcome: null,
          expect_version: g.version + 1,
        },
      };
    }

    case 'prepare_practice': {
      const a = action.args;
      const goal = a.goal ? await targetGoal(ctx, a.goal) : null;
      if (goal && goal.status !== 'active') throw new ToolRejection(`goal ${a.goal} is not active`);
      const subjectId = a.subject
        ? (ctx.aliases.subjects.get(a.subject)?.id ??
          (() => {
            throw new ToolRejection(`unknown subject ${a.subject}`);
          })())
        : null;
      const count = questionCountFor(a.minutes);
      const itemIds = await selectPracticeItems(
        ctx.db,
        ctx.learnerId,
        { goalId: goal?.id ?? null, subjectId },
        a.focus_topics,
        count,
        ctx.now,
      );
      if (itemIds.length === 0) {
        throw new ToolRejection(
          'there are no questions for this yet — ask for a photo of the material (request_material) instead',
        );
      }
      // A newer preparation replaces an unstarted older one for the same scope.
      await ctx.db.query(
        `update buddy_steps set state = 'cancelled', version = version + 1, finished_at = $4
          where learner_id = $1 and kind = 'practice' and state = 'prepared'
            and goal_id is not distinct from $2 and (payload ->> 'subject_id') is not distinct from $3`,
        [ctx.learnerId, goal?.id ?? null, subjectId, ctx.now],
      );
      const minutes = Math.max(5, Math.round(itemIds.length / 1.2));
      const title = goal
        ? goal.title
        : subjectId
          ? [...ctx.aliases.subjects.values()].find((s) => s.id === subjectId)!.name
          : t(ctx.locale, 'practice.untitled');
      const step = await ctx.db.one<{ id: string }>(
        `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload, prepared_at)
         values ($1, $2, 'practice', $3, 'prepared', $4, $5, $6) returning id`,
        [
          ctx.learnerId,
          goal?.id ?? null,
          title,
          today(ctx),
          {
            item_ids: itemIds,
            est_minutes: minutes,
            focus_topics: a.focus_topics,
            subject_id: subjectId,
          },
          ctx.now,
        ],
      );
      ctx.created.stepId = step.id;
      return {
        summary: {
          tool: 'prepare_practice',
          step_id: step.id,
          title,
          question_count: itemIds.length,
          est_minutes: minutes,
        },
        undo: { type: 'cancel_step', step_id: step.id },
      };
    }

    case 'plan_step': {
      const a = action.args;
      if (a.agreed) requireQuote(ctx, a.quote);
      if (a.agreed && ctx.mode !== 'turn')
        throw new ToolRejection('agreed reminders need the learner');
      const goal = a.goal ? await targetGoal(ctx, a.goal) : null;
      const date = resolveFutureDay(ctx, a.day, 'this step');
      let at: Date | null = null;
      if (a.time) {
        const r = resolveLocalDateTime(date, a.time, ctx.settings.timezone, 'reject');
        if (!r.ok) {
          throw new ToolRejection(
            `${date} ${a.time} ${r.error === 'nonexistent_time' ? 'does not exist' : 'exists twice'} (clock change) — ask for another time`,
          );
        }
        at = r.instant;
        if (at.getTime() <= ctx.now.getTime())
          throw new ToolRejection(`${date} ${a.time} is already over`);
        if (inWindow(minutesOf(a.time), ctx.settings.quiet_start, ctx.settings.quiet_end)) {
          throw new ToolRejection(
            `${a.time} is inside the quiet hours (${ctx.settings.quiet_start}–${ctx.settings.quiet_end}); suggest another time`,
          );
        }
      }
      const step = await ctx.db.one<{ id: string; version: number }>(
        `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, planned_time, agreed)
         values ($1, $2, $3, $4, 'planned', $5, $6, $7) returning id, version`,
        [ctx.learnerId, goal?.id ?? null, a.kind, a.title, date, a.time, a.agreed],
      );
      ctx.created.stepId = step.id;
      if (a.agreed) {
        const when =
          at ?? zonedToInstant(date, ctx.settings.preferred_start, ctx.settings.timezone);
        if (when.getTime() > ctx.now.getTime()) {
          await scheduleStepReminder(ctx.db, ctx.learnerId, step, when);
        }
      }
      return {
        summary: {
          tool: 'plan_step',
          step_id: step.id,
          title: a.title,
          date,
          time: a.time,
          agreed: a.agreed,
        },
        undo: { type: 'cancel_step', step_id: step.id },
      };
    }

    case 'update_step': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      const s = await currentStep(ctx, a.step);
      if (!['planned', 'prepared'].includes(s.state)) {
        throw new ToolRejection(`step ${a.step} is ${s.state} and cannot be changed`);
      }
      const undo: UndoSpec = {
        type: 'restore_step',
        step_id: s.id,
        state: s.state,
        planned_date: s.planned_date,
        planned_time: s.planned_time,
        done_source: s.done_source,
        expect_version: s.version + 1,
      };
      if (a.state) {
        await ctx.db.query(
          `update buddy_steps set state = $2, version = version + 1, finished_at = $3 where id = $1`,
          [s.id, a.state, ctx.now],
        );
        await ctx.db.query(
          `update jobs set status = 'cancelled'
            where learner_id = $1 and kind = 'buddy_check' and status = 'queued' and payload ->> 'step_id' = $2`,
          [ctx.learnerId, s.id],
        );
        return {
          summary: {
            tool: 'update_step',
            step_id: s.id,
            title: s.title,
            date: s.planned_date,
            time: s.planned_time,
            state: a.state,
          },
          undo,
        };
      }
      const date = a.day ? resolveFutureDay(ctx, a.day, 'the step') : s.planned_date;
      const time = a.time ?? s.planned_time;
      if (!date) throw new ToolRejection('nothing to change: give a day, a time or a state');
      let at: Date | null = null;
      if (time) {
        const r = resolveLocalDateTime(date, time, ctx.settings.timezone, 'reject');
        if (!r.ok)
          throw new ToolRejection(
            `${date} ${time} is ambiguous or missing on the clock change — ask again`,
          );
        at = r.instant;
        if (inWindow(minutesOf(time), ctx.settings.quiet_start, ctx.settings.quiet_end)) {
          throw new ToolRejection(`${time} is inside the quiet hours; suggest another time`);
        }
      }
      const updated = await ctx.db.one<{ id: string; version: number }>(
        `update buddy_steps set planned_date = $2, planned_time = $3, version = version + 1
          where id = $1 returning id, version`,
        [s.id, date, time],
      );
      if (s.agreed) {
        const when =
          at ?? zonedToInstant(date, ctx.settings.preferred_start, ctx.settings.timezone);
        if (when.getTime() > ctx.now.getTime())
          await scheduleStepReminder(ctx.db, ctx.learnerId, updated, when);
      }
      return {
        summary: { tool: 'update_step', step_id: s.id, title: s.title, date, time, state: s.state },
        undo,
      };
    }

    case 'mark_step_done': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      const s = await currentStep(ctx, a.step);
      if (!['planned', 'prepared', 'in_progress'].includes(s.state)) {
        throw new ToolRejection(`step ${a.step} is already ${s.state}`);
      }
      await ctx.db.query(
        `update buddy_steps set state = 'done', done_source = 'learner_reported', finished_at = $2,
                                version = version + 1 where id = $1`,
        [s.id, ctx.now],
      );
      await ctx.db.query(
        `update jobs set status = 'cancelled'
          where learner_id = $1 and kind = 'buddy_check' and status = 'queued' and payload ->> 'step_id' = $2`,
        [ctx.learnerId, s.id],
      );
      return {
        summary: { tool: 'mark_step_done', step_id: s.id, title: s.title },
        undo: {
          type: 'restore_step',
          step_id: s.id,
          state: s.state,
          planned_date: s.planned_date,
          planned_time: s.planned_time,
          done_source: s.done_source,
          expect_version: s.version + 1,
        },
      };
    }

    case 'request_material': {
      const a = action.args;
      const goal = a.goal ? await targetGoal(ctx, a.goal) : null;
      if (goal && goal.status !== 'active') throw new ToolRejection(`goal ${a.goal} is not active`);
      const open = await ctx.db.maybeOne<{ id: string; title: string }>(
        `select id, title from buddy_steps
          where learner_id = $1 and kind = 'capture' and state = 'planned' and goal_id is not distinct from $2
          limit 1`,
        [ctx.learnerId, goal?.id ?? null],
      );
      if (open) {
        return {
          summary: { tool: 'request_material', step_id: open.id, title: open.title },
          undo: null,
        };
      }
      const step = await ctx.db.one<{ id: string }>(
        `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date)
         values ($1, $2, 'capture', $3, 'planned', $4) returning id`,
        [ctx.learnerId, goal?.id ?? null, a.title, today(ctx)],
      );
      return {
        summary: { tool: 'request_material', step_id: step.id, title: a.title },
        undo: { type: 'cancel_step', step_id: step.id },
      };
    }

    case 'set_contact': {
      const a = action.args;
      requireQuote(ctx, a.quote);
      const s = ctx.settings;
      const preferredStart = a.preferred_start ?? s.preferred_start;
      const preferredEnd = a.preferred_end ?? s.preferred_end;
      if (minutesOf(preferredStart) >= minutesOf(preferredEnd)) {
        throw new ToolRejection('the preferred window must start before it ends');
      }
      const avoid = a.avoid_weekdays ? [...new Set(a.avoid_weekdays)].sort() : s.avoid_weekdays;
      if (s.avoid_weekdays.some((d) => !avoid.includes(d))) {
        throw new ToolRejection(
          'removing days without messages means more contact — only the learner or an adult can do that in the settings',
        );
      }
      let pausedUntil = s.paused_until;
      if (a.pause) {
        const until = resolveEnd(ctx, a.pause, 'the pause');
        if (!pausedUntil || until.getTime() > pausedUntil.getTime()) pausedUntil = until;
      }
      const maxPerWeek = a.fewer ? Math.max(1, Math.floor(s.max_per_week / 2)) : s.max_per_week;
      await ctx.db.query(
        `update buddy_settings
            set preferred_start = $2, preferred_end = $3, avoid_weekdays = $4, paused_until = $5,
                max_per_week = $6, version = version + 1
          where learner_id = $1`,
        [ctx.learnerId, preferredStart, preferredEnd, avoid, pausedUntil, maxPerWeek],
      );
      if (pausedUntil && pausedUntil.getTime() > ctx.now.getTime()) {
        // Nothing queued during a pause is sent afterwards (no backlog).
        await ctx.db.query(
          `update buddy_outreach set status = 'cancelled', status_reason = 'paused'
            where learner_id = $1 and status = 'scheduled'`,
          [ctx.learnerId],
        );
      }
      return {
        summary: {
          tool: 'set_contact',
          preferred_start: preferredStart,
          preferred_end: preferredEnd,
          avoid_weekdays: avoid,
          paused_until: pausedUntil ? pausedUntil.toISOString() : null,
          max_per_week: maxPerWeek,
        },
        undo: {
          type: 'restore_settings',
          preferred_start: s.preferred_start,
          preferred_end: s.preferred_end,
          avoid_weekdays: s.avoid_weekdays,
          paused_until: s.paused_until ? s.paused_until.toISOString() : null,
          max_per_week: s.max_per_week,
          expect_version: s.version + 1,
        },
      };
    }

    case 'schedule_check': {
      const a = action.args;
      const date = resolveFutureDay(ctx, a.day, 'the check');
      const at = zonedToInstant(
        date,
        a.time ?? ctx.settings.preferred_start,
        ctx.settings.timezone,
      );
      const minAt = ctx.now.getTime() + 3_600_000;
      const maxAt = ctx.now.getTime() + 21 * 86_400_000;
      if (at.getTime() < minAt || at.getTime() > maxAt) {
        throw new ToolRejection('a check must be between 1 hour and 21 days from now');
      }
      const pending = await ctx.db.one<{ n: number }>(
        `select count(*)::int as n from jobs
          where learner_id = $1 and kind = 'buddy_check' and status = 'queued'
            and payload ->> 'reason' = 'checkin_requested'`,
        [ctx.learnerId],
      );
      if (pending.n >= 3) throw new ToolRejection('there are already 3 checks planned');
      const id = await enqueueJob(ctx.db, {
        learnerId: ctx.learnerId,
        kind: 'buddy_check',
        runAt: at,
        dedupeKey: `check:${ctx.learnerId}:${at.toISOString()}`,
        payload: { reason: 'checkin_requested', note: a.reason },
      });
      return {
        summary: { tool: 'schedule_check', at: at.toISOString() },
        undo: id ? { type: 'cancel_check', job_id: id } : null,
      };
    }
  }
}

/** Reverse an applied action. Returns false when the thing changed since (no blind overwrite). */
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
      return exists(
        `select 1 from buddy_memories where id = $1 and learner_id = $2 and status = 'retracted'`,
        [undo.memory_id, learnerId],
      );
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
    case 'cancel_check':
      return exists(`select 1 from jobs where id = $1 and learner_id = $2 and status = 'queued'`, [
        undo.job_id,
        learnerId,
      ]);
  }
}

export async function runUndo(
  db: Db,
  learnerId: string,
  undo: UndoSpec,
  now: Date,
): Promise<boolean> {
  switch (undo.type) {
    case 'retract_memory': {
      const r = await db.query(
        `update buddy_memories set status = 'retracted', version = version + 1
          where id = $1 and learner_id = $2 and status = 'active' returning id`,
        [undo.memory_id, learnerId],
      );
      return r.length === 1;
    }
    case 'restore_memory': {
      const r = await db.query(
        `update buddy_memories set status = 'retracted', version = version + 1
          where id = $1 and learner_id = $2 and status = 'active' returning id`,
        [undo.new_id, learnerId],
      );
      if (r.length !== 1) return false;
      await db.query(
        `update buddy_memories set status = 'active', version = version + 1
          where id = $1 and learner_id = $2 and status = 'superseded'`,
        [undo.old_id, learnerId],
      );
      return true;
    }
    case 'unretract_memory': {
      const r = await db.query(
        `update buddy_memories set status = 'active', version = version + 1
          where id = $1 and learner_id = $2 and status = 'retracted' returning id`,
        [undo.memory_id, learnerId],
      );
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
        `update buddy_steps set state = $3, planned_date = $4, planned_time = $5, done_source = $6,
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
                                   paused_until = $5, max_per_week = $6, version = version + 1
          where learner_id = $1 and version = $7 returning learner_id`,
        [
          learnerId,
          undo.preferred_start,
          undo.preferred_end,
          undo.avoid_weekdays,
          undo.paused_until,
          undo.max_per_week,
          undo.expect_version,
        ],
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
