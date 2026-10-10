// The kit every one of Buddy's tools works with (docs/architecture.md §Tools): what a tool is
// given (`ToolContext`), what it returns (`ToolOutcome`, `UndoSpec`), how it refuses
// (`ToolRejection`), and the checks they share — quotes from her own words, days resolved in her
// zone, aliases resolved to this learner only. The tools themselves are in tools.ts.

import { type ActionSummary, type VoiceName } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import {
  addDays,
  daysBetween,
  localParts,
  resolveDay,
  resolveUntil,
  type DaySpec,
  type UntilSpec,
} from '../../lib/time.js';
import type { Aliases } from './context.js';
import { type MemoryAbout } from './decision.js';
import {
  type GoalRow,
  type MemoryRow,
  type SettingsRow,
  type StepRow,
  withSubjectNames,
} from './state.js';
import { quoteOccursIn, unsupportedSpecifics } from './text.js';

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
  created: {
    goalId: string | null;
    stepId: string | null;
    /**
     * The practice an earlier action of this decision PREPARED — the card she can tap right
     * now. Kept apart from `stepId`, which any step claims for the "new" alias: a `plan_step`
     * reminder for later is nothing to tap, so it must not count as the answer's one button
     * (issue #196).
     */
    preparedStepId: string | null;
  };
};

/**
 * Undo kinds a domain adds (LearnBuddy: a sheet renamed back): it declares each by augmenting this
 * interface, keyed by its `type`, and applies them through its context provider (provider.ts).
 * Exported for that augmentation (`declare module`), which knip does not count as a use.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by the domain's augmentation
export interface DomainUndos {}
export type DomainUndo = DomainUndos[keyof DomainUndos];

export type UndoSpec =
  | DomainUndo
  | { type: 'retract_memory'; memory_id: string }
  | { type: 'restore_memory'; old_id: string; new_id: string }
  | { type: 'unretract_memory'; memory_id: string }
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

export function requireQuote(ctx: ToolContext, quote: string | null): void {
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
export function requireSupported(
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
export function refuseDuringConcern(ctx: ToolContext): void {
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

export function refuseForbiddenAbout(about: MemoryAbout): void {
  if (!NEVER_KEPT.includes(about)) return;
  throw new ToolRejection(
    `about "${about}": a learner's health, trouble at home, being hurt, and who they are are never kept — in no wording and under no other label. Answer again without a memory action. What it means for learning (that they cannot practise, and until when) may be kept as a temporary situation, without the reason.`,
  );
}

export function today(ctx: ToolContext): string {
  return localParts(ctx.now, ctx.settings.timezone).date;
}

export function resolveFutureDay(ctx: ToolContext, spec: DaySpec, what: string): string {
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

export function resolveEnd(ctx: ToolContext, spec: UntilSpec, what: string): Date {
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

export function goalOf(ctx: ToolContext, alias: string): GoalRow {
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

export function memoryOf(ctx: ToolContext, alias: string): MemoryRow {
  const m = ctx.aliases.memories.get(alias);
  if (!m)
    throw new ToolRejection(
      `there is nothing known as ${alias} — STATE lists what you know about her. Leave this action out instead of picking another`,
    );
  return m;
}

async function lockGoal(ctx: ToolContext, id: string, ref: string): Promise<GoalRow> {
  const row = await ctx.db.maybeOne<Omit<GoalRow, 'subject_name'>>(
    `select g.* from buddy_goals g where g.id = $1 and g.learner_id = $2 for update of g`,
    [id, ctx.learnerId],
  );
  if (!row)
    throw new ToolRejection(
      `goal ${ref} is gone since STATE was written — leave this action out and answer her without it`,
    );
  const [named] = await withSubjectNames(ctx.db, ctx.learnerId, [row]);
  return named!;
}

async function currentGoal(ctx: ToolContext, alias: string): Promise<GoalRow> {
  return lockGoal(ctx, goalOf(ctx, alias).id, alias);
}

/** A goal alias, or "new" = the test plan_exam created earlier in this decision. */
export async function targetGoal(ctx: ToolContext, ref: string): Promise<GoalRow> {
  if (ref !== 'new') return currentGoal(ctx, ref);
  if (!ctx.created.goalId) {
    throw new ToolRejection(
      '"new" refers to a test planned with plan_exam earlier in this same answer — there is none',
    );
  }
  return lockGoal(ctx, ctx.created.goalId, 'new');
}

/** The goal an action names (or "new"), which must still be open; none when it names none. */
export async function activeGoalOf(
  ctx: ToolContext,
  ref: string | null | undefined,
): Promise<GoalRow | null> {
  const goal = ref ? await targetGoal(ctx, ref) : null;
  if (goal && goal.status !== 'active') throw new ToolRejection(`goal ${ref} is not active`);
  return goal;
}

/** A goal she changes in her own words: the quote first, then the goal, locked. */
export async function quotedGoal(
  ctx: ToolContext,
  a: { quote: string | null; goal: string },
): Promise<GoalRow> {
  requireQuote(ctx, a.quote);
  return currentGoal(ctx, a.goal);
}

/** The subject an action names, resolved from her own aliases; none when it names none. */
export function subjectOf(ctx: ToolContext, alias: string | null | undefined): string | null {
  if (!alias) return null;
  const subject = ctx.aliases.subjects.get(alias);
  if (!subject) throw new ToolRejection(`unknown subject ${alias}`);
  return subject.id;
}

export async function currentStep(ctx: ToolContext, alias: string): Promise<StepRow> {
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

/** The sheet she named, from this learner's aliases only. */
export function materialOf(ctx: ToolContext, alias: string) {
  const m = ctx.aliases.materials.get(alias);
  if (!m)
    throw new ToolRejection(
      `there is no sheet ${alias} — STATE lists her sheets. Leave this action out instead of picking another`,
    );
  return m;
}
