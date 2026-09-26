// The model's side of the contract: what Buddy may decide, as strict schemas.
// docs/architecture.md §Buddy decisions.
//
// The model never writes ids, dates or instants itself:
//   * entities are referenced by short aliases from the context (g1, st2, m3,
//     f1) that the server resolves for THIS learner only;
//   * days are DaySpecs ("weekday 5", "in 1 day", or a date the learner
//     named) and durations UntilSpecs, resolved server-side against the time
//     the learner wrote the message;
//   * every change to memory, goals, agreed reminders or settings carries the
//     learner's exact words (`quote`), checked against their latest message.
// The same zod schemas generate the JSON schema sent to the model and
// validate its answer.

import { z } from 'zod';

const SUBJECT_KINDS = [
  'math',
  'physics',
  'chemistry',
  'biology',
  'geography',
  'history',
  'german',
  'english',
  'french',
  'spanish',
  'latin',
  'other_language',
  'religion_ethics',
  'art_music',
  'computer_science',
  'economics',
  'social_studies',
  'other',
] as const;

const alias = (prefix: string, what: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}\\d{1,3}$`), `must be a ${what} alias like ${prefix}1`)
    .describe(`${what} alias from STATE, e.g. ${prefix}1`);

export const GoalRef = alias('g', 'goal');
/** A goal from STATE, or the test planned with plan_exam earlier in the same answer. */
export const GoalTarget = z
  .string()
  .regex(/^(g\d{1,3}|new)$/, 'must be a goal alias like g1, or "new"')
  .describe(
    'goal alias from STATE (g1), or "new" for the test planned with plan_exam earlier in this same answer',
  );
export const StepRef = alias('st', 'step');
/** A step from STATE, or the practice/step created earlier in the same answer. */
export const StepTarget = z
  .string()
  .regex(/^(st\d{1,3}|new)$/, 'must be a step alias like st1, or "new"')
  .describe(
    'step alias from STATE (st1), or "new" for the practice (prepare_practice) or step (plan_step) created earlier in this same answer',
  );
export const MemoryRef = alias('m', 'memory');
export const SubjectRef = alias('f', 'subject');

export const Quote = z
  .string()
  .min(1)
  .max(300)
  .describe("the learner's exact words (latest message)");

// Days and durations as the learner described them; the server computes the date
// (hard rule 2). The model sees ONE flat object per spec — a kind plus the fields
// that kind uses — and code turns it into the exact union below. A union of four
// shapes, repeated in eight tools, cost ~7 000 input tokens per Buddy turn on
// Gemini 3.x, which bills the response schema (docs/architecture.md §Model calls).
const flatField = <T extends z.ZodTypeAny>(t: T, what: string) =>
  t.nullable().optional().describe(what);

const FlatDay = z.object({
  kind: z
    .enum(['date', 'in_days', 'weekday', 'unknown'])
    .describe('A day as the learner described it; the server computes the date'),
  date: flatField(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    'kind date: YYYY-MM-DD — only when the learner named a calendar date',
  ),
  days: flatField(
    z.number().int().min(0).max(366),
    'kind in_days: 0 = today, 1 = tomorrow, 14 = in two weeks',
  ),
  weekday: flatField(z.number().int().min(1).max(7), 'kind weekday: 1 = Monday … 7 = Sunday'),
  weeks_ahead: flatField(
    z.number().int().min(0).max(8),
    'kind weekday: 0 = next such weekday, 1 = the one after (see prompt)',
  ),
});

type DaySpecOut =
  | { kind: 'date'; date: string }
  | { kind: 'in_days'; days: number }
  | { kind: 'weekday'; weekday: number; weeks_ahead: number }
  | { kind: 'unknown' };

function missing(ctx: z.RefinementCtx, kind: string, field: string): never {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `kind ${kind} needs ${field}` });
  return z.NEVER;
}

export const DaySpecSchema = FlatDay.transform((d, ctx): DaySpecOut => {
  switch (d.kind) {
    case 'date':
      return d.date == null ? missing(ctx, 'date', 'date') : { kind: 'date', date: d.date };
    case 'in_days':
      return d.days == null ? missing(ctx, 'in_days', 'days') : { kind: 'in_days', days: d.days };
    case 'weekday':
      return d.weekday == null
        ? missing(ctx, 'weekday', 'weekday')
        : { kind: 'weekday', weekday: d.weekday, weeks_ahead: d.weeks_ahead ?? 0 };
    case 'unknown':
      return { kind: 'unknown' };
  }
});

const FlatUntil = z.object({
  kind: z
    .enum(['end_of_day', 'end_of_week', 'through', 'unknown'])
    .describe('How long a temporary condition lasts; the server computes the end'),
  days: flatField(
    z.number().int().min(0).max(60),
    'kind end_of_day: 0 = until tonight, 1 = until end of tomorrow',
  ),
  weeks_ahead: flatField(
    z.number().int().min(0).max(8),
    'kind end_of_week: 0 = until Sunday of this week',
  ),
  day: flatField(DaySpecSchema, 'kind through: the last day it lasts'),
});

type UntilSpecOut =
  | { kind: 'end_of_day'; days: number }
  | { kind: 'end_of_week'; weeks_ahead: number }
  | { kind: 'through'; day: DaySpecOut }
  | { kind: 'unknown' };

export const UntilSpecSchema = FlatUntil.transform((u, ctx): UntilSpecOut => {
  switch (u.kind) {
    case 'end_of_day':
      return u.days == null
        ? missing(ctx, 'end_of_day', 'days')
        : { kind: 'end_of_day', days: u.days };
    case 'end_of_week':
      return u.weeks_ahead == null
        ? missing(ctx, 'end_of_week', 'weeks_ahead')
        : { kind: 'end_of_week', weeks_ahead: u.weeks_ahead };
    case 'through':
      return u.day == null ? missing(ctx, 'through', 'day') : { kind: 'through', day: u.day };
    case 'unknown':
      return { kind: 'unknown' };
  }
});

const LocalTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe('HH:MM, learner-local 24h time');

const Title = z.string().trim().min(1).max(80);

// ─────────────── tools ───────────────

const remember = z.object({
  tool: z.literal('remember'),
  args: z.object({
    kind: z
      .enum(['fact', 'preference', 'goal', 'constraint'])
      .describe('constraint = temporary situation that ends (requires until)'),
    statement: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .describe(
        'Short third-person statement in the learner\'s language, e.g. "Hat donnerstags Fußball"',
      ),
    quote: Quote,
    until: UntilSpecSchema.nullable().describe('Required for kind=constraint, otherwise null'),
  }),
});

const correctMemory = z.object({
  tool: z.literal('correct_memory'),
  args: z.object({ memory: MemoryRef, statement: z.string().trim().min(3).max(200), quote: Quote }),
});

const forget = z.object({
  tool: z.literal('forget'),
  args: z.object({ memory: MemoryRef, quote: Quote }),
});

const setLevel = z.object({
  tool: z.literal('set_level'),
  args: z.object({
    level: z.enum(['school', 'university', 'adult']),
    grade: z
      .number()
      .int()
      .min(1)
      .max(13)
      .nullable()
      .describe('School grade (Klasse), null otherwise'),
    quote: Quote,
  }),
});

const planExam = z.object({
  tool: z.literal('plan_exam'),
  args: z.object({
    title: Title.describe('e.g. "Mathearbeit Brüche"'),
    subject: z.string().trim().min(1).max(40).describe("Subject name in the learner's language"),
    subject_kind: z.enum(SUBJECT_KINDS),
    day: DaySpecSchema,
    topics: z.array(z.string().trim().min(1).max(60)).max(8),
    quote: Quote,
  }),
});

const updateGoal = z.object({
  tool: z.literal('update_goal'),
  args: z.object({
    goal: GoalRef,
    title: Title.nullable(),
    day: DaySpecSchema.nullable(),
    topics: z.array(z.string().trim().min(1).max(60)).max(8).nullable(),
    quote: Quote,
  }),
});

const closeGoal = z.object({
  tool: z.literal('close_goal'),
  args: z.object({
    goal: GoalRef,
    status: z
      .enum(['done', 'dropped'])
      .describe('done = the test happened; dropped = no longer relevant'),
    outcome: z
      .enum(['good', 'ok', 'hard'])
      .nullable()
      .describe('How it went, if the learner said so'),
    quote: Quote,
  }),
});

const preparePractice = z.object({
  tool: z.literal('prepare_practice'),
  args: z.object({
    goal: GoalTarget.nullable(),
    subject: SubjectRef.nullable(),
    minutes: z.number().int().min(5).max(30),
    focus_topics: z.array(z.string().trim().min(1).max(60)).max(5),
  }),
});

const planStep = z.object({
  tool: z.literal('plan_step'),
  args: z.object({
    goal: GoalTarget.nullable(),
    kind: z.enum(['practice', 'capture']),
    title: Title,
    day: DaySpecSchema,
    time: LocalTimeSchema.nullable(),
    agreed: z
      .boolean()
      .describe('true only if the learner asked for / agreed to this time (a reminder)'),
    quote: Quote.nullable().describe('Required when agreed=true'),
  }),
});

const updateStep = z.object({
  tool: z.literal('update_step'),
  args: z.object({
    step: StepRef,
    day: DaySpecSchema.nullable(),
    time: LocalTimeSchema.nullable(),
    state: z.enum(['skipped', 'cancelled']).nullable(),
    quote: Quote,
  }),
});

const markStepDone = z.object({
  tool: z.literal('mark_step_done'),
  args: z.object({ step: StepRef, quote: Quote }),
});

const requestMaterial = z.object({
  tool: z.literal('request_material'),
  args: z.object({
    goal: GoalTarget.nullable(),
    title: Title.describe('What to photograph, e.g. "Arbeitsblatt Brüche"'),
  }),
});

const setContact = z.object({
  tool: z.literal('set_contact'),
  args: z.object({
    preferred_start: LocalTimeSchema.nullable(),
    preferred_end: LocalTimeSchema.nullable(),
    quiet_start: LocalTimeSchema.nullable().describe(
      'No messages at all from this time until the morning ("nicht nach 19 Uhr" → 19:00); only earlier than now',
    ),
    avoid_weekdays: z
      .array(z.number().int().min(1).max(7))
      .max(7)
      .nullable()
      .describe('Full new list of weekdays without messages (1 = Monday)'),
    pause: UntilSpecSchema.nullable().describe('Pause all messages until then'),
    fewer: z.boolean().describe('Learner wants fewer messages'),
    quote: Quote,
  }),
});

const scheduleCheck = z.object({
  tool: z.literal('schedule_check'),
  args: z.object({
    day: DaySpecSchema,
    time: LocalTimeSchema.nullable(),
    reason: z.string().trim().min(1).max(120),
  }),
});

const offerLearning = z.object({
  tool: z.literal('offer_learning'),
  args: z.object({
    kind: z
      .enum(['explain', 'practice', 'vocab', 'speak', 'help', 'test'])
      .describe(
        'explain a topic · questions on a topic · a vocabulary list · speaking practice · homework help · a practice test (no hints, results at the end)',
      ),
    text: z
      .string()
      .trim()
      .min(2)
      .max(600)
      .describe(
        "What to learn, in the learner's words (topic, the vocabulary they typed, or the homework task)",
      ),
  }),
});

const openArea = z.object({
  tool: z.literal('open_area'),
  args: z.object({
    area: z
      .enum(['library', 'memory', 'settings', 'history', 'capture'])
      .describe(
        "library = her sheets and their questions · memory = what you know about her · settings = contact, language, parents' area · history = all earlier messages · capture = take a photo of a sheet",
      ),
  }),
});

/** Every act tool's call schema, by name (surfaces and handlers: registry.ts). */
export const ACT_SCHEMAS = {
  remember,
  correct_memory: correctMemory,
  forget,
  set_level: setLevel,
  plan_exam: planExam,
  update_goal: updateGoal,
  close_goal: closeGoal,
  prepare_practice: preparePractice,
  plan_step: planStep,
  update_step: updateStep,
  mark_step_done: markStepDone,
  request_material: requestMaterial,
  set_contact: setContact,
  schedule_check: scheduleCheck,
  offer_learning: offerLearning,
  open_area: openArea,
} as const;

export type ToolName = keyof typeof ACT_SCHEMAS;
/** One call of the act tool K. */
export type ActionOf<K extends ToolName> = z.infer<(typeof ACT_SCHEMAS)[K]>;
export type AnyAction = { [K in ToolName]: ActionOf<K> }[ToolName];

export const Outreach = z.object({
  kind: z.enum(['idea', 'checkin', 'result']),
  topic_key: z
    .string()
    .regex(/^[a-z0-9:_-]{3,80}$/)
    .describe('Stable key for the topic, e.g. "exam:g1:prep"'),
  title: z.string().trim().min(1).max(60),
  body: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .describe('Concrete and useful without opening the app; no scores or personal details'),
  why: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe('Why this fits the learner now (shown in the app)'),
  relevance: z.number().min(0).max(1),
  expires_in_hours: z.number().int().min(2).max(72),
  goal: GoalRef.nullable(),
  /** What the message is about: once that step is done or gone, the message is not sent. */
  step: StepTarget.nullable(),
});
export type Outreach = z.infer<typeof Outreach>;
