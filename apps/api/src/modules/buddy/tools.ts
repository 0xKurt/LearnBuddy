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
// quotes must be whole words from what the learner wrote since Buddy's last answer; dates are resolved from
// DaySpec/UntilSpec in the learner's zone and must lie in the allowed range;
// agreed times may not fall into quiet hours; contact can only be reduced or
// shifted, never turned on or increased.

import {
  VOICE_NAMES,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  type ActionSummary,
  type VoiceName,
} from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import {
  addDays,
  daysBetween,
  inWindow,
  localParts,
  minutesOf,
  resolveDay,
  resolveLocalDateTime,
  resolveUntil,
  weekdayOf,
  zonedToInstant,
  type DaySpec,
  type UntilSpec,
} from '../../lib/time.js';
import { t } from '../../i18n/index.js';
import {
  MOST_QUESTIONS_AT_ONCE,
  questionCountFor,
  selectPracticeItems,
  type PracticeWish,
} from '../practice/selection.js';
import { enqueueJob } from '../scheduler/jobs.js';
import type { Aliases } from './context.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext, rollRepeatingStep } from './plan.js';
import { archiveMaterial, archiveMaterialItem } from '../materials/service.js';
import { schoolYearsOf, type ActionOf, type MemoryAbout, type ToolName } from './decision.js';
import {
  cancelGoalWakeups,
  findOrCreateSubject,
  scheduleExamWakeups,
  scheduleStepReminder,
} from './plan.js';
import type { GoalRow, MemoryRow, SettingsRow, StepRow } from './state.js';
import { loosens } from './policy.js';
import { normalizeForMatch, quoteOccursIn, unsupportedSpecifics } from './text.js';

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
  /** What the learner wrote that this decision answers (one or several quick messages). */
  learnerWords: readonly string[] | null;
  /** The turn is a safeguarding answer (TurnDecision.concern): nothing about it is remembered. */
  concern: boolean;
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
  | { type: 'rename_material_back'; material_id: string; title: string | null }
  /** Undo of "forget everything" (issue #114): exactly the notes that call retracted. */
  | { type: 'unretract_memories'; memory_ids: string[] }
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
      /**
       * Steps closing the goal cancelled: undo opens them again, each only if nothing
       * changed it since (restore-goal-leaves-steps-cancelled). Absent in older records.
       */
      steps?: Array<{ id: string; state: string; expect_version: number }>;
    }
  | { type: 'cancel_step'; step_id: string }
  | {
      type: 'restore_step';
      step_id: string;
      state: string;
      planned_date: string | null;
      planned_time: string | null;
      done_source: string | null;
      /** Absent in undo records written before repeating reminders existed (issue #112). */
      repeat?: 'daily' | 'weekdays' | 'weekly' | null;
      repeat_until?: string | null;
      expect_version: number;
    }
  | {
      type: 'restore_settings';
      /** Absent in undo records written before quiet hours could be changed. */
      quiet_start?: string;
      /** Absent in undo records written before the morning end could be changed (#114). */
      quiet_end?: string;
      preferred_start: string;
      preferred_end: string;
      avoid_weekdays: number[];
      paused_until: string | null;
      /** Written by undo records from before ADR 0006; ignored. */
      max_per_week?: number;
      expect_version: number;
    }
  | {
      type: 'restore_voice';
      voice: VoiceName;
      speed: number;
      /** Undo only while the settings are as the action left them (no blind overwrite). */
      expect_version: number;
    }
  | { type: 'cancel_check'; job_id: string };

export type ToolOutcome = { summary: ActionSummary; undo: UndoSpec | null };

/** What Buddy may know at once; at the cap he asks her what he may forget (never evicts). */
export const MAX_ACTIVE_MEMORIES = 60;
const MAX_CONSTRAINT_DAYS = 60;
const MAX_PLAN_DAYS = 366;

// ─────────────── helpers ───────────────

function requireQuote(ctx: ToolContext, quote: string | null): void {
  if (ctx.mode !== 'turn')
    throw new ToolRejection('this change is not allowed in a background check');
  if (!quote || !ctx.learnerWords || !quoteOccursIn(quote, ctx.learnerWords)) {
    throw new ToolRejection(
      `quote "${quote ?? ''}" is not the learner's exact words (whole words) from what they wrote since your last answer; only what they just said can justify this change`,
    );
  }
}

/**
 * A memory repeats only what she said: every day, time of day, month or number in the statement
 * must be in her quote (or in what was known already, for a correction) — live finding 4.
 */
function requireSupported(
  ctx: ToolContext,
  statement: string,
  quote: string | null,
  known: string | null = null,
): void {
  const extra = unsupportedSpecifics(
    statement,
    [quote ?? '', ...(known ? [known] : [])],
    ctx.locale,
  );
  if (extra.length > 0) {
    throw new ToolRejection(
      `the statement adds details the learner did not say (${extra.join(', ')}); keep only what her quote says — or quote the words where she said it`,
    );
  }
}

/** Code-enforced, not only prompted: a disclosure of distress never becomes a memory (audit M-9). */
function refuseDuringConcern(ctx: ToolContext): void {
  if (ctx.concern)
    throw new ToolRejection(
      'nothing is remembered from a message about distress (concern is true); leave memory alone',
    );
}

/**
 * What a memory may never be about — Art. 9 categories and what a learning companion has no
 * business holding about a child (`docs/dpia.md` §1).
 *
 * Until issue #108 this ban lived only in the prompt, and the only code-side guard was
 * `refuseDuringConcern`, which needs `concern === true`. Illness, an argument at home or a
 * threat without a deed are no emergency — so the live run of 29.09. stored "isst seit drei
 * Tagen fast nichts und möchte dünner werden" and a death in the family in turns the model
 * had not flagged. The model names the category in its structured answer (`about`), code
 * refuses on it: interpretation with the model, enforcement in code (rules 1 and 3).
 */
const NEVER_KEPT: readonly MemoryAbout[] = ['health', 'family', 'harm', 'identity'];

function refuseForbiddenAbout(about: MemoryAbout): void {
  if (!NEVER_KEPT.includes(about)) return;
  throw new ToolRejection(
    `about "${about}": a learner's health, trouble at home, being hurt, and who they are are never kept — in no wording and under no other label. Answer again without a memory action. What it means for learning (that they cannot practise, and until when) may be kept as a temporary situation, without the reason.`,
  );
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
  if (d > MAX_PLAN_DAYS)
    throw new ToolRejection(
      `${what} is more than a year ahead — ask her for a nearer day instead of planning one`,
    );
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
  // Counted in days, not in milliseconds. An UntilSpec ends at midnight AFTER its last day,
  // so measuring the instant made the longest expressible end (end_of_day with 60 days) always
  // too long by the rest of today — the model repaired into the same rejection and the learner
  // got model_invalid instead of an answer (issue #119).
  const lastDay = addDays(localParts(r.until, ctx.settings.timezone).date, -1);
  if (daysBetween(localParts(ctx.now, ctx.settings.timezone).date, lastDay) > MAX_CONSTRAINT_DAYS) {
    // A rejection is a repair instruction: it says the way out, not only the limit.
    throw new ToolRejection(
      `${what} is limited to ${MAX_CONSTRAINT_DAYS} days: use kind "end_of_day" with days ${MAX_CONSTRAINT_DAYS} for the longest there is, and say in your reply that this is how far it reaches`,
    );
  }
  return r.until;
}

function goalOf(ctx: ToolContext, alias: string): GoalRow {
  const g = ctx.aliases.goals.get(alias);
  if (!g)
    throw new ToolRejection(
      `there is no goal ${alias} — STATE lists every one she has. Leave this action out instead of picking another`,
    );
  return g;
}

function stepOf(ctx: ToolContext, alias: string): StepRow {
  const s = ctx.aliases.steps.get(alias);
  if (!s)
    throw new ToolRejection(
      `there is no step ${alias} — STATE lists every one she has. Leave this action out instead of picking another`,
    );
  return s;
}

function memoryOf(ctx: ToolContext, alias: string): MemoryRow {
  const m = ctx.aliases.memories.get(alias);
  if (!m)
    throw new ToolRejection(
      `there is nothing known as ${alias} — STATE lists what you know about her. Leave this action out instead of picking another`,
    );
  return m;
}

async function lockGoal(ctx: ToolContext, id: string, ref: string): Promise<GoalRow> {
  const row = await ctx.db.maybeOne<GoalRow>(
    `select g.*, s.name as subject_name from buddy_goals g left join subjects s on s.id = g.subject_id
      where g.id = $1 and g.learner_id = $2 for update of g`,
    [id, ctx.learnerId],
  );
  if (!row)
    throw new ToolRejection(
      `goal ${ref} is gone since STATE was written — leave this action out and answer her without it`,
    );
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
  if (!row)
    throw new ToolRejection(
      `step ${alias} is gone since STATE was written — leave this action out and answer her without it`,
    );
  return row;
}

// ─────────────── tools ───────────────

async function runRemember(action: ActionOf<'remember'>, ctx: ToolContext): Promise<ToolOutcome> {
  const a = action.args;
  refuseDuringConcern(ctx);
  refuseForbiddenAbout(a.about);
  requireQuote(ctx, a.quote);
  requireSupported(ctx, a.statement, a.quote);
  let validUntil: Date | null = null;
  if (a.kind === 'constraint') {
    if (!a.until) throw new ToolRejection('a temporary situation (constraint) needs an until');
    validUntil = resolveEnd(ctx, a.until, 'this situation');
  }
  const existing = await ctx.db.query<{ id: string; statement: string; valid_until: Date | null }>(
    `select id, statement, valid_until from buddy_memories
      where learner_id = $1 and status = 'active' and (valid_until is null or valid_until > $2)`,
    [ctx.learnerId, ctx.now],
  );
  const same = existing.find(
    (m) => normalizeForMatch(m.statement) === normalizeForMatch(a.statement),
  );
  if (same && validUntil && same.valid_until?.getTime() !== validUntil.getTime()) {
    // Known already, with another end: the new end is kept (it replaces the old row, which
    // undo restores) instead of being dropped while the card says "noted"
    // (remember-dedupe-misreports).
    await ctx.db.query(
      `update buddy_memories set status = 'superseded', closed_at = $3, version = version + 1
        where id = $1 and learner_id = $2 and status = 'active'`,
      [same.id, ctx.learnerId, ctx.now],
    );
    const row = await ctx.db.one<{ id: string }>(
      `insert into buddy_memories (learner_id, kind, statement, source, source_message_id, quote,
                                   valid_until, supersedes_id, created_at)
       values ($1, $2, $3, 'learner_stated', $4, $5, $6, $7, $8) returning id`,
      [
        ctx.learnerId,
        a.kind,
        same.statement,
        ctx.triggerMessageId,
        a.quote,
        validUntil,
        same.id,
        ctx.now,
      ],
    );
    return {
      summary: {
        tool: 'remember',
        memory_id: row.id,
        statement: same.statement,
        kind: a.kind,
        valid_until: validUntil.toISOString(),
      },
      undo: { type: 'restore_memory', old_id: same.id, new_id: row.id },
    };
  }
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

async function runCorrectMemory(
  action: ActionOf<'correct_memory'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  refuseDuringConcern(ctx);
  refuseForbiddenAbout(a.about);
  requireQuote(ctx, a.quote);
  const old = memoryOf(ctx, a.memory);
  requireSupported(ctx, a.statement, a.quote, old.statement);
  // A temporary situation may end at another time now (audit M-54 p2-J-memory-F1).
  if (a.until && old.kind !== 'constraint')
    throw new ToolRejection(`memory ${a.memory} is not a temporary situation; until must be null`);
  const validUntil = a.until ? resolveEnd(ctx, a.until, 'this situation') : old.valid_until;
  const updated = await ctx.db.query(
    `update buddy_memories set status = 'superseded', closed_at = $3, version = version + 1
      where id = $1 and learner_id = $2 and status = 'active' returning id`,
    [old.id, ctx.learnerId, ctx.now],
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
      validUntil,
      old.id,
      ctx.now,
    ],
  );
  return {
    summary: { tool: 'correct_memory', memory_id: row.id, statement: a.statement },
    undo: { type: 'restore_memory', old_id: old.id, new_id: row.id },
  };
}

async function runForget(action: ActionOf<'forget'>, ctx: ToolContext): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  if (a.all) {
    // Everything at once (issue #114). Not the aliases in STATE — those are only what fit
    // there; the database decides what "everything" is, so nothing survives unseen.
    const gone = await ctx.db.query<{ id: string }>(
      `update buddy_memories set status = 'retracted', closed_at = $2, version = version + 1
        where learner_id = $1 and status = 'active' returning id`,
      [ctx.learnerId, ctx.now],
    );
    if (gone.length === 0) throw new ToolRejection('there is nothing you know about her to forget');
    return {
      summary: { tool: 'forget', memory_id: null, statement: null, forgotten: gone.length },
      undo: { type: 'unretract_memories', memory_ids: gone.map((r) => r.id) },
    };
  }
  if (a.memory === null) throw new ToolRejection('forget needs a memory alias, or all=true');
  const m = memoryOf(ctx, a.memory);
  const updated = await ctx.db.query(
    `update buddy_memories set status = 'retracted', closed_at = $3, version = version + 1
      where id = $1 and learner_id = $2 and status = 'active' returning id`,
    [m.id, ctx.learnerId, ctx.now],
  );
  if (updated.length !== 1) throw new ToolRejection(`memory ${a.memory} changed meanwhile`);
  return {
    summary: { tool: 'forget', memory_id: m.id, statement: m.statement },
    undo: { type: 'unretract_memory', memory_id: m.id },
  };
}

async function runSetLevel(action: ActionOf<'set_level'>, ctx: ToolContext): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  // Code converts her school's own label into years of schooling (audit M-39).
  const fromLabel = a.level === 'school' && a.school_year ? schoolYearsOf(a.school_year) : null;
  if (a.level === 'school' && a.school_year && fromLabel === null) {
    throw new ToolRejection('that school year does not exist in that school system');
  }
  const grade = a.level === 'school' ? (fromLabel ?? a.grade) : null;
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

async function runPlanExam(action: ActionOf<'plan_exam'>, ctx: ToolContext): Promise<ToolOutcome> {
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

async function runUpdateGoal(
  action: ActionOf<'update_goal'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
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

async function runCloseGoal(
  action: ActionOf<'close_goal'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const g = await currentGoal(ctx, a.goal);
  if (g.status !== 'active')
    throw new ToolRejection(
      `goal ${a.goal} is already closed — leave this action out and just say so`,
    );
  await ctx.db.query(
    `update buddy_goals set status = $2, outcome = $3, closed_at = $4, version = version + 1 where id = $1`,
    [g.id, a.status, a.outcome, ctx.now],
  );
  const open = await ctx.db.query<{ id: string; state: string; version: number }>(
    `select id, state, version from buddy_steps
      where goal_id = $1 and state in ('planned','prepared') for update`,
    [g.id],
  );
  await ctx.db.query(
    `update buddy_steps set state = 'cancelled', version = version + 1, finished_at = $2
      where id = any($1::uuid[])`,
    [open.map((st) => st.id), ctx.now],
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
      steps: open.map((st) => ({ id: st.id, state: st.state, expect_version: st.version + 1 })),
    },
  };
}

/**
 * She has questions for this, but none that fit what she asked for (issue #113). The reason
 * says which wish found nothing, so Buddy can say it plainly instead of quietly practising
 * something else — and name the way out (new questions are written, not selected).
 */
function noneFit(wish: PracticeWish): string {
  if (wish.onlyWrong) {
    return 'none of her questions for this went wrong the last time — say so plainly (it is good news) and offer ordinary practice instead (prepare_practice without only_wrong)';
  }
  if (wish.difficulty) {
    return `her own questions for this have no ${wish.difficulty} half — say so and offer to write new ones at that level (offer_learning with difficulty)`;
  }
  if (wish.direction) {
    return 'she has no vocabulary for this in that direction — say so and offer to write it (offer_learning) or ask for a photo of the list (request_material)';
  }
  // Issue #144: she asked for vocabulary in a subject whose sheets are about other things.
  return 'there is no vocabulary here — say plainly that this sheet (or this subject) holds no word list, and offer to ask for a photo of one (request_material) or to write vocabulary with her (offer_learning). Never practise the other questions instead';
}

async function runPreparePractice(
  action: ActionOf<'prepare_practice'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  const goal = a.goal ? await targetGoal(ctx, a.goal) : null;
  if (goal && goal.status !== 'active') throw new ToolRejection(`goal ${a.goal} is not active`);
  const subjectId = a.subject
    ? (ctx.aliases.subjects.get(a.subject)?.id ??
      (() => {
        throw new ToolRejection(`unknown subject ${a.subject}`);
      })())
    : null;
  // What she said beats what the minutes guess (issue #145): a named number, or all there
  // is. The minutes are the fallback for when she said nothing about the size at all.
  const count =
    a.all_of_them === true
      ? MOST_QUESTIONS_AT_ONCE
      : a.question_count != null
        ? Math.min(MOST_QUESTIONS_AT_ONCE, a.question_count)
        : questionCountFor(a.minutes);
  // The one sheet she pointed at (issue #144). Resolved from her own aliases, so a sheet
  // that is not hers cannot be reached by guessing an id (hard rule 2).
  const material = a.sheet ? materialOf(ctx, a.sheet) : null;
  const scope = { goalId: goal?.id ?? null, subjectId, materialId: material?.id ?? null };
  // What she asked for beyond the topic (issue #113). Code decides what it means; the set is
  // never filled up with questions she did not ask for.
  const wish: PracticeWish = {
    onlyWrong: a.only_wrong === true,
    difficulty: a.difficulty ?? null,
    direction: a.direction ?? null,
    // A direction already means vocabulary; asking for vocabulary without one is the case
    // that used to fall through to the whole subject (issue #144).
    vocabularyOnly: a.vocabulary_only === true,
    ownLanguage: ctx.locale,
  };
  const narrowed =
    wish.onlyWrong === true ||
    wish.difficulty !== null ||
    wish.direction !== null ||
    wish.vocabularyOnly === true ||
    material !== null;
  const itemIds = await selectPracticeItems(
    ctx.db,
    ctx.learnerId,
    scope,
    a.focus_topics,
    count,
    ctx.now,
    wish,
  );
  // One rule for all three wishes: what fits is prepared, however few — a short set she asked
  // for beats a full one she did not (the selection already hands back fewer than `count` when
  // she simply has fewer questions). Only when nothing at all fits does Buddy have to say so.
  if (itemIds.length === 0) {
    if (narrowed) {
      // Is there anything at all here, or only nothing that fits what she asked for? The
      // answer decides what Buddy can honestly offer instead.
      const anything = await selectPracticeItems(
        ctx.db,
        ctx.learnerId,
        scope,
        a.focus_topics,
        count,
        ctx.now,
      );
      if (anything.length > 0) throw new ToolRejection(noneFit(wish));
    }
    throw new ToolRejection(
      'there are no questions for this yet — ask for a photo of the material (request_material) instead',
    );
  }
  // A background check never replaces practice she asked for in the chat (audit M-55): the
  // card she expects stays.
  if (ctx.mode === 'check') {
    const hers = await ctx.db.maybeOne(
      `select 1 from buddy_steps st
        where st.learner_id = $1 and st.kind = 'practice' and st.state = 'prepared'
          and st.goal_id is not distinct from $2 and (st.payload ->> 'subject_id') is not distinct from $3
          and exists (select 1 from buddy_actions a join buddy_decisions d on d.id = a.decision_id
                       where a.learner_id = $1 and d.mode = 'turn' and a.status = 'applied'
                         and a.tool = 'prepare_practice' and a.result ->> 'step_id' = st.id::text)`,
      [ctx.learnerId, goal?.id ?? null, subjectId],
    );
    if (hers) {
      throw new ToolRejection(
        'the learner already has practice she asked for prepared for this; leave it (no prepare_practice)',
      );
    }
  }
  // A newer preparation replaces an unstarted older one for the same scope — never one she
  // agreed to (its reminder prepared it; p2-prepare-practice-cancels-reminder-prepared-step).
  await ctx.db.query(
    `update buddy_steps set state = 'cancelled', version = version + 1, finished_at = $4
      where learner_id = $1 and kind = 'practice' and state = 'prepared' and not agreed
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
        // What she asked for, kept with the set it produced (issue #113).
        only_wrong: wish.onlyWrong,
        difficulty: wish.difficulty,
        direction: wish.direction,
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

/**
 * The first day a rhythm should run when she named none (issue #112): today if its time is
 * still ahead and the day fits the rhythm, otherwise the next day that does. "weekly" without
 * a named weekday starts on the first day that works and keeps that weekday from then on.
 */
function firstDayOfRhythm(
  ctx: ToolContext,
  repeat: 'daily' | 'weekdays' | 'weekly',
  time: string,
): string {
  const now = localParts(ctx.now, ctx.settings.timezone);
  const fits = (date: string) => repeat !== 'weekdays' || ![6, 7].includes(weekdayOf(date));
  let date = now.date;
  if (minutesOf(time) <= minutesOf(now.time)) date = addDays(date, 1);
  // At most a week: every rhythm here has a day inside any seven.
  for (let i = 0; i < 7 && !fits(date); i++) date = addDays(date, 1);
  return date;
}

async function runPlanStep(action: ActionOf<'plan_step'>, ctx: ToolContext): Promise<ToolOutcome> {
  const a = action.args;
  if (a.agreed) requireQuote(ctx, a.quote);
  if (a.agreed && ctx.mode !== 'turn') throw new ToolRejection('agreed reminders need the learner');
  const goal = a.goal ? await targetGoal(ctx, a.goal) : null;
  // "In an hour": the server does the arithmetic against its own clock, so a miscounted
  // HH:MM can no longer reach the learner as an agreed time (issue #112, rule 2). The day
  // comes out of the same calculation — an hour before midnight lands tomorrow.
  const relative = a.in_minutes ? new Date(ctx.now.getTime() + a.in_minutes * 60_000) : null;
  if (relative && a.time) {
    throw new ToolRejection('use either in_minutes or a time, not both');
  }
  const local = relative ? localParts(relative, ctx.settings.timezone) : null;
  // A rhythm usually comes without a first day — "immer an Schultagen um halb vier" says when
  // it repeats, not when it starts. The server works that day out (rule 2: the model never
  // writes dates), instead of rejecting the action and leaving the learner with an error
  // (issue #112, seen live in buddy.35).
  const rhythmStart =
    !local && a.repeat && a.repeat !== 'never' && a.day.kind === 'unknown' && a.time
      ? firstDayOfRhythm(ctx, a.repeat, a.time)
      : null;
  const date = local ? local.date : (rhythmStart ?? resolveFutureDay(ctx, a.day, 'this step'));
  let at: Date | null = relative;
  if (local && inWindow(minutesOf(local.time), ctx.settings.quiet_start, ctx.settings.quiet_end)) {
    throw new ToolRejection(
      `in ${a.in_minutes} minutes falls into the quiet hours (${ctx.settings.quiet_start}–${ctx.settings.quiet_end}); suggest another time`,
    );
  }
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
  // What the practice is about, as she named it (audit H-30): the reminder prepares
  // questions from this subject (or the goal's material) and nothing else.
  const subjectId = a.subject
    ? (ctx.aliases.subjects.get(a.subject)?.id ??
      (() => {
        throw new ToolRejection(`unknown subject ${a.subject}`);
      })())
    : null;
  // An agreed reminder is always scheduled, never silently dropped (audit M-58): without a
  // time it goes at her preferred start — unless that is already over today.
  const when = a.agreed
    ? (at ?? zonedToInstant(date, ctx.settings.preferred_start, ctx.settings.timezone))
    : null;
  if (when && when.getTime() <= ctx.now.getTime()) {
    throw new ToolRejection(
      `the usual reminder time (${ctx.settings.preferred_start}) is already over on ${date} — ask the learner for a time`,
    );
  }
  // A standing arrangement, not a suggestion repeated behind her back (issue #112).
  const repeat = a.repeat === 'never' ? null : a.repeat;
  const plannedTime = a.time ?? local?.time ?? null;
  if (repeat && !(a.agreed && plannedTime)) {
    throw new ToolRejection(
      'a repeating reminder needs her agreement and a time — ask her when it should come',
    );
  }
  // resolveUntil returns the exclusive bound (midnight after the last day), so the last day
  // it may still fire is the day before it — otherwise "bis Freitag" would run through Saturday.
  const repeatUntil =
    repeat && a.repeat_until
      ? addDays(
          localParts(resolveEnd(ctx, a.repeat_until, 'the repetition'), ctx.settings.timezone).date,
          -1,
        )
      : null;
  if (repeatUntil && repeatUntil < date) {
    throw new ToolRejection(`the repetition would end (${repeatUntil}) before its first day`);
  }
  const step = await ctx.db.one<{ id: string; version: number }>(
    `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, planned_time, agreed,
                              payload, repeat, repeat_until)
     values ($1, $2, $3, $4, 'planned', $5, $6, $7, $8, $9, $10) returning id, version`,
    [
      ctx.learnerId,
      goal?.id ?? null,
      a.kind,
      a.title,
      date,
      // A relative wish has its clock time too — the server just worked it out (#112).
      plannedTime,
      a.agreed,
      { subject_id: subjectId, focus_topics: a.focus_topics ?? [] },
      repeat,
      repeatUntil,
    ],
  );
  ctx.created.stepId = step.id;
  if (when) await scheduleStepReminder(ctx.db, ctx.learnerId, step, when);
  return {
    summary: {
      tool: 'plan_step',
      step_id: step.id,
      title: a.title,
      date,
      // The resolved time, so the card shows what was really agreed — not null because
      // she said it relative (issue #112).
      time: plannedTime,
      agreed: a.agreed,
      repeat,
      repeat_until: repeatUntil,
    },
    undo: { type: 'cancel_step', step_id: step.id },
  };
}

async function runUpdateStep(
  action: ActionOf<'update_step'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const s = await currentStep(ctx, a.step);
  if (!['planned', 'prepared'].includes(s.state)) {
    throw new ToolRejection(
      `step ${a.step} is ${s.state} and cannot be changed — leave this action out and tell her how it stands`,
    );
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
  if (a.state && (a.day || a.time)) {
    // Never report a move that was not made (update-step-state-drops-move).
    throw new ToolRejection(
      `a ${a.state} step is not moved — change either its state or its day/time`,
    );
  }
  // "nicht mehr jeden Tag" (issue #112). Ending a repetition leaves the next one standing —
  // she asked for fewer reminders, not for the one tomorrow to vanish unannounced.
  if (a.repeat !== null && a.repeat !== undefined) {
    const repeat = a.repeat === 'never' ? null : a.repeat;
    if (repeat && !(s.agreed && (a.time ?? s.planned_time))) {
      throw new ToolRejection(
        'a repeating reminder needs her agreement and a time — ask her when it should come',
      );
    }
    await ctx.db.query(
      `update buddy_steps set repeat = $2, repeat_until = case when $2::text is null then null else repeat_until end
        where id = $1 and learner_id = $3`,
      [s.id, repeat, ctx.learnerId],
    );
    if (!a.state && !a.day && !a.time) {
      return {
        summary: {
          tool: 'update_step',
          step_id: s.id,
          title: s.title,
          date: s.planned_date,
          time: s.planned_time,
          state: s.state,
        },
        undo: { ...undo, repeat: s.repeat, repeat_until: s.repeat_until },
      };
    }
  }
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
    const when = at ?? zonedToInstant(date, ctx.settings.preferred_start, ctx.settings.timezone);
    // Moving an agreed reminder into the past would drop it silently (audit M-58).
    if (when.getTime() <= ctx.now.getTime())
      throw new ToolRejection(
        `${date} ${time ?? ctx.settings.preferred_start} is already over — ask for a time`,
      );
    await scheduleStepReminder(ctx.db, ctx.learnerId, updated, when);
  }
  return {
    summary: { tool: 'update_step', step_id: s.id, title: s.title, date, time, state: s.state },
    undo,
  };
}

async function runMarkStepDone(
  action: ActionOf<'mark_step_done'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const s = await currentStep(ctx, a.step);
  if (!['planned', 'prepared', 'in_progress'].includes(s.state)) {
    throw new ToolRejection(
      `step ${a.step} is already ${s.state} — leave this action out and just say so`,
    );
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
  // On a standing arrangement "done" means done for today: the next one is set up again, so
  // saying she practised never quietly ends the repetition (issue #112).
  await rollRepeatingStep(ctx.db, ctx.learnerId, s, ctx.settings, ctx.now);
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

async function runRequestMaterial(
  action: ActionOf<'request_material'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  const goal = a.goal ? await targetGoal(ctx, a.goal) : null;
  if (goal && goal.status !== 'active') throw new ToolRejection(`goal ${a.goal} is not active`);
  // The forgotten back belongs to the sheet it was forgotten from (issue #118): without this
  // the page becomes a second sheet, and her questions end up split over two.
  const completes = a.material ? materialOf(ctx, a.material) : null;
  if (completes?.status === 'failed') {
    throw new ToolRejection(
      `sheet ${a.material} could not be read, so a page cannot join it — she photographs it anew`,
    );
  }
  const open = await ctx.db.maybeOne<{
    id: string;
    title: string;
    payload: { completes?: string };
  }>(
    `select id, title, payload from buddy_steps
      where learner_id = $1 and kind = 'capture' and state = 'planned' and goal_id is not distinct from $2
        and payload->>'completes' is not distinct from $3
      limit 1`,
    [ctx.learnerId, goal?.id ?? null, completes?.id ?? null],
  );
  if (open) {
    return {
      summary: {
        tool: 'request_material',
        step_id: open.id,
        title: open.title,
        material_id: open.payload.completes ?? null,
      },
      undo: null,
    };
  }
  const step = await ctx.db.one<{ id: string }>(
    `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload)
     values ($1, $2, 'capture', $3, 'planned', $4, $5) returning id`,
    [
      ctx.learnerId,
      goal?.id ?? null,
      a.title,
      today(ctx),
      completes ? { completes: completes.id } : {},
    ],
  );
  return {
    summary: {
      tool: 'request_material',
      step_id: step.id,
      title: a.title,
      material_id: completes?.id ?? null,
    },
    undo: { type: 'cancel_step', step_id: step.id },
  };
}

/**
 * What cannot be taken back takes two turns: Buddy asks in one answer, and only her yes in the
 * next carries the deed. The tools of a decision run before its own row is written, so the
 * newest row is the answer before this one.
 *
 * In code and not in the prompt, because the prompt did not hold it: the live run of buddy.33
 * had the model delete a whole vocabulary sheet on "mit der Vokabelliste bin ich durch" — a
 * sentence that ends a session, not a sheet (issues #111, #120). This is the library's confirm
 * sheet, in the conversation (docs/UX-PRINCIPLES.md §18).
 */
async function requireAsked(ctx: ToolContext, what: string): Promise<void> {
  const previous = await ctx.db.maybeOne<{ asked: boolean }>(
    `select coalesce((output->>'asks_permission')::boolean, false) as asked
       from buddy_decisions
      where learner_id = $1 and mode = 'turn' and disposition = 'applied'
      order by created_at desc, id desc limit 1`,
    [ctx.learnerId],
  );
  if (previous?.asked) return;
  throw new ToolRejection(
    `${what} cannot be taken back. Leave this action out of your answer, ask her plainly whether it should go (asks_permission true), and do it in your NEXT answer once she has said yes`,
  );
}

/** The sheet she named, from this learner's aliases only. */
function materialOf(ctx: ToolContext, alias: string) {
  const m = ctx.aliases.materials.get(alias);
  if (!m)
    throw new ToolRejection(
      `there is no sheet ${alias} — STATE lists her sheets. Leave this action out instead of picking another`,
    );
  return m;
}

/**
 * She asked for a sheet to go (issue #111). This is the library's own delete — the same
 * service the button calls, so merged pages, questions, running sessions and the photo and
 * content purge are handled in one place and cannot drift apart.
 *
 * No undo: `archiveMaterial` schedules the photos and the transcript for erasure right away,
 * which is the point when she deletes a private photo. Offering "rückgängig" on a card whose
 * content is already on its way out would be a promise we cannot keep (CLAUDE.md rule 5).
 *
 * Because it cannot be taken back, the confirmation is enforced here and not left to the
 * prompt: the live run of buddy.33 had the model delete a whole vocabulary sheet on "mit der
 * Vokabelliste bin ich durch" — a sentence that ends a session, not a sheet. So Buddy must
 * have asked in his previous answer (asks_permission) before this runs; the first attempt is
 * rejected and repaired into a question, and her "ja" is what carries the second one. That is
 * the library's confirm sheet, in the conversation (docs/UX-PRINCIPLES.md §18).
 */
async function runDeleteMaterial(
  action: ActionOf<'delete_material'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const m = materialOf(ctx, a.material);
  await requireAsked(ctx, `deleting "${m.title ?? 'a sheet'}"`);
  try {
    await archiveMaterial({ db: ctx.db, now: () => ctx.now }, ctx.learnerId, m.id);
  } catch (e) {
    if (e instanceof AppError && e.code === 'not_found') {
      throw new ToolRejection(
        `sheet ${a.material} is already gone — leave this action out and just say so`,
      );
    }
    throw e;
  }
  return { summary: { tool: 'delete_material', material_id: m.id, title: m.title }, undo: null };
}

async function runRenameMaterial(
  action: ActionOf<'rename_material'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const m = materialOf(ctx, a.material);
  if (m.title === a.title)
    throw new ToolRejection(
      `sheet ${a.material} is already called that — leave this action out and just say so`,
    );
  const r = await ctx.db.query(
    `update materials set title = $3
      where id = $1 and learner_id = $2 and archived_at is null returning id`,
    [m.id, ctx.learnerId, a.title],
  );
  if (r.length === 0) throw new ToolRejection(`sheet ${a.material} is gone`);
  await bumpContext(ctx.db, ctx.learnerId);
  return {
    summary: { tool: 'rename_material', material_id: m.id, title: a.title },
    undo: { type: 'rename_material_back', material_id: m.id, title: m.title },
  };
}

/**
 * One question off a sheet (issue #120). She says which one in words — "die mit den 20 Prozent"
 * is not it, the question as it stands is — and the server finds it among that sheet's own
 * questions. No id from the model (rule 2), and no guessing: if her words fit more than one,
 * the action is refused and Buddy asks which.
 *
 * Like deleting a sheet this cannot be taken back (`archiveMaterialItem` erases the text, the
 * solution and her answers by job), so it takes the same two turns: Buddy must have asked.
 */
async function runDeleteItem(
  action: ActionOf<'delete_item'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const m = materialOf(ctx, a.material);
  await requireAsked(ctx, `taking a question off "${m.title ?? 'a sheet'}"`);
  const rows = await ctx.db.query<{ id: string; prompt: string }>(
    `select id, prompt from items
      where learner_id = $1 and material_id = $2 and archived_at is null`,
    [ctx.learnerId, m.id],
  );
  if (rows.length === 0) throw new ToolRejection(`sheet ${a.material} has no questions left`);
  const wanted = normalizeForMatch(a.question);
  // Word for word first; only if that finds nothing, the question that contains her words.
  const exact = rows.filter((r) => normalizeForMatch(r.prompt) === wanted);
  const hits =
    exact.length > 0 ? exact : rows.filter((r) => normalizeForMatch(r.prompt).includes(wanted));
  if (hits.length === 0) {
    throw new ToolRejection(
      `no question on sheet ${a.material} reads like that — look them up (find_questions) and use one word for word`,
    );
  }
  if (hits.length > 1) {
    throw new ToolRejection(
      `${hits.length} questions on sheet ${a.material} fit that; nothing is deleted on a guess — name them and ask which`,
    );
  }
  const hit = hits[0]!;
  await archiveMaterialItem({ db: ctx.db, now: () => ctx.now }, ctx.learnerId, m.id, hit.id);
  return {
    summary: { tool: 'delete_item', item_id: hit.id, question: hit.prompt },
    undo: null,
  };
}

async function runSetContact(
  action: ActionOf<'set_contact'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const s = ctx.settings;
  const quietStart = a.quiet_start ?? s.quiet_start;
  // The morning end moves too (issue #114): "mornings not before nine" is LESS contact, and
  // ADR 0006 lets Buddy do that. Which end moved does not matter — the rule is the same for
  // both: every minute that was quiet stays quiet.
  const quietEnd = a.quiet_end ?? s.quiet_end;
  for (let m = 0; m < 1440; m++) {
    if (inWindow(m, s.quiet_start, s.quiet_end) && !inWindow(m, quietStart, quietEnd)) {
      throw new ToolRejection(
        `quiet hours can only grow (now ${s.quiet_start}–${s.quiet_end}): a later start or an earlier end means more contact`,
      );
    }
  }
  let preferredStart = a.preferred_start ?? s.preferred_start;
  let preferredEnd = a.preferred_end ?? s.preferred_end;
  // The preferred window starts where the quiet hours end.
  if (minutesOf(preferredStart) < minutesOf(quietEnd)) preferredStart = quietEnd;
  // The preferred window ends where the quiet hours begin.
  if (
    minutesOf(quietStart) > minutesOf(quietEnd) &&
    minutesOf(preferredEnd) > minutesOf(quietStart)
  ) {
    preferredEnd = quietStart;
  }
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
  await ctx.db.query(
    `update buddy_settings
        set preferred_start = $2, preferred_end = $3, avoid_weekdays = $4, paused_until = $5,
            quiet_start = $6, quiet_end = $7, version = version + 1
      where learner_id = $1`,
    [ctx.learnerId, preferredStart, preferredEnd, avoid, pausedUntil, quietStart, quietEnd],
  );
  if (pausedUntil && pausedUntil.getTime() > ctx.now.getTime()) {
    // Nothing Buddy queued on its own during a pause is sent afterwards (no backlog); an
    // agreed reminder stays and waits in the app at its time (D-13).
    await ctx.db.query(
      `update buddy_outreach set status = 'cancelled', status_reason = 'paused'
        where learner_id = $1 and status = 'scheduled' and origin = 'buddy'`,
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
      quiet_start: quietStart,
      quiet_end: quietEnd,
    },
    undo: {
      type: 'restore_settings',
      quiet_start: s.quiet_start,
      quiet_end: s.quiet_end,
      preferred_start: s.preferred_start,
      preferred_end: s.preferred_end,
      avoid_weekdays: s.avoid_weekdays,
      paused_until: s.paused_until ? s.paused_until.toISOString() : null,
      expect_version: s.version + 1,
    },
  };
}

/**
 * Buddy's voice as she asked for it (ADR 0008). Code decides the step: "slower" is one step
 * down from where it is, "other" the next voice of the curated set; the limits are enforced
 * here, and a request that changes nothing is sent back to the model to say so.
 */
async function runSetVoice(action: ActionOf<'set_voice'>, ctx: ToolContext): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  if (a.speed === null && a.voice === null) {
    throw new ToolRejection('set_voice needs speed or voice');
  }
  const s = ctx.settings;
  let speed = s.voice_speed;
  if (a.speed === 'slower') {
    if (speed <= VOICE_SPEED_MIN)
      throw new ToolRejection(
        'the voice is already as slow as it goes — tell her so, change nothing',
      );
    speed -= 1;
  } else if (a.speed === 'faster') {
    if (speed >= VOICE_SPEED_MAX)
      throw new ToolRejection(
        'the voice is already as fast as it goes — tell her so, change nothing',
      );
    speed += 1;
  } else if (a.speed === 'normal') {
    speed = 0;
  }
  let voice: VoiceName = s.voice;
  if (a.voice === 'other') {
    voice = VOICE_NAMES[(VOICE_NAMES.indexOf(s.voice) + 1) % VOICE_NAMES.length]!;
  } else if (a.voice !== null) {
    voice = a.voice;
  }
  if (voice === s.voice && speed === s.voice_speed) {
    throw new ToolRejection('that is already how you sound — change nothing and say so');
  }
  await ctx.db.query(
    `update buddy_settings set voice = $2, voice_speed = $3, version = version + 1
      where learner_id = $1`,
    [ctx.learnerId, voice, speed],
  );
  return {
    summary: { tool: 'set_voice', voice, speed },
    undo: {
      type: 'restore_voice',
      voice: s.voice,
      speed: s.voice_speed,
      expect_version: s.version + 1,
    },
  };
}

async function runOfferLearning(
  action: ActionOf<'offer_learning'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  // Practice or a test for a planned test stays within its sheets (live finding 6): the goal
  // the model named, or the one active goal whose title the offer names exactly.
  const forGoal = a.kind === 'test' || a.kind === 'practice';
  let goal = forGoal && a.goal ? goalOf(ctx, a.goal) : null;
  if (forGoal && !goal) {
    const named = [...ctx.aliases.goals.values()].filter(
      (g) => g.status === 'active' && normalizeForMatch(g.title) === normalizeForMatch(a.text),
    );
    goal = named.length === 1 ? named[0]! : null;
  }
  // Changes nothing: the learner starts it with a tap (the model never starts sessions).
  return {
    summary: {
      tool: 'offer_learning',
      kind: a.kind,
      text: a.text,
      goal_id: goal?.id ?? null,
      // What she asked for beyond the topic; the tap hands it to the generator (issue #113).
      // A direction only ever reaches vocabulary pairs — other questions have none.
      difficulty: a.difficulty ?? null,
      direction: a.direction ?? null,
    },
    undo: null,
  };
}

async function runScheduleCheck(
  action: ActionOf<'schedule_check'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  const date = resolveFutureDay(ctx, a.day, 'the check');
  // A time the model named is rejected on a clock change, never guessed (CLAUDE.md rule 2,
  // audit schedule-check-compatible-dst); the preferred start is the system's own choice.
  let at: Date;
  if (a.time) {
    const r = resolveLocalDateTime(date, a.time, ctx.settings.timezone, 'reject');
    if (!r.ok) {
      throw new ToolRejection(
        `${date} ${a.time} ${r.error === 'nonexistent_time' ? 'does not exist' : 'exists twice'} (clock change) — pick another time`,
      );
    }
    at = r.instant;
  } else {
    at = zonedToInstant(date, ctx.settings.preferred_start, ctx.settings.timezone);
  }
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
  if (pending.n >= 3)
    throw new ToolRejection(
      'there are already 3 checks planned — leave this action out; one of them will come anyway',
    );
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

async function runOpenArea(action: ActionOf<'open_area'>, _ctx: ToolContext): Promise<ToolOutcome> {
  // Changes nothing: the app shows a button that opens that part of the app.
  return { summary: { tool: 'open_area', area: action.args.area }, undo: null };
}

/** One handler per act tool (the registry in registry.ts attaches them to their schemas). */
export const ACT_HANDLERS: {
  [K in ToolName]: (action: ActionOf<K>, ctx: ToolContext) => Promise<ToolOutcome>;
} = {
  remember: runRemember,
  correct_memory: runCorrectMemory,
  forget: runForget,
  set_level: runSetLevel,
  plan_exam: runPlanExam,
  update_goal: runUpdateGoal,
  close_goal: runCloseGoal,
  prepare_practice: runPreparePractice,
  plan_step: runPlanStep,
  update_step: runUpdateStep,
  mark_step_done: runMarkStepDone,
  request_material: runRequestMaterial,
  delete_material: runDeleteMaterial,
  rename_material: runRenameMaterial,
  delete_item: runDeleteItem,
  set_contact: runSetContact,
  set_voice: runSetVoice,
  offer_learning: runOfferLearning,
  open_area: runOpenArea,
  schedule_check: runScheduleCheck,
};

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
