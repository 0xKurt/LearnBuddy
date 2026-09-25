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
export const MemoryRef = alias('m', 'memory');
export const SubjectRef = alias('f', 'subject');

export const Quote = z
  .string()
  .min(1)
  .max(300)
  .describe("The learner's exact words from their LATEST message that justify this change");

export const DaySpecSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('date'),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe('YYYY-MM-DD — only when the learner named a calendar date'),
    }),
    z.object({
      kind: z.literal('in_days'),
      days: z.number().int().min(0).max(366).describe('0 = today, 1 = tomorrow, 14 = in two weeks'),
    }),
    z.object({
      kind: z.literal('weekday'),
      weekday: z.number().int().min(1).max(7).describe('1 = Monday … 7 = Sunday'),
      weeks_ahead: z
        .number()
        .int()
        .min(0)
        .max(8)
        .describe('0 = the next such weekday after today; 1 = one week later'),
    }),
    z.object({ kind: z.literal('unknown') }),
  ])
  .describe('A day as the learner described it; the server computes the date');

export const UntilSpecSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('end_of_day'),
      days: z
        .number()
        .int()
        .min(0)
        .max(60)
        .describe('0 = until tonight, 1 = until end of tomorrow'),
    }),
    z.object({
      kind: z.literal('end_of_week'),
      weeks_ahead: z.number().int().min(0).max(8).describe('0 = until Sunday of this week'),
    }),
    z.object({ kind: z.literal('through'), day: DaySpecSchema }),
    z.object({ kind: z.literal('unknown') }),
  ])
  .describe('How long a temporary condition lasts; the server computes the end');

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

export const TurnAction = z.discriminatedUnion('tool', [
  remember,
  correctMemory,
  forget,
  setLevel,
  planExam,
  updateGoal,
  closeGoal,
  preparePractice,
  planStep,
  updateStep,
  markStepDone,
  requestMaterial,
  setContact,
  scheduleCheck,
]);
export type TurnAction = z.infer<typeof TurnAction>;

/** In background checks Buddy may only prepare and look again — never change what the learner said. */
export const CheckAction = z.discriminatedUnion('tool', [
  preparePractice,
  requestMaterial,
  scheduleCheck,
]);
export type CheckAction = z.infer<typeof CheckAction>;

export type AnyAction = TurnAction | CheckAction;
export type ToolName = AnyAction['tool'];

export const TurnDecision = z.object({
  reply: z
    .string()
    .trim()
    .min(1)
    .max(700)
    .describe(
      "Your answer to the learner, in their language. Never claim a change you don't make in actions.",
    ),
  options: z
    .array(z.string().trim().min(1).max(40))
    .min(2)
    .max(4)
    .nullable()
    .describe('Short tappable answers if you asked a question, else null'),
  actions: z.array(TurnAction).max(6),
});
export type TurnDecision = z.infer<typeof TurnDecision>;

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
  step: StepRef.nullable(),
});
export type Outreach = z.infer<typeof Outreach>;

export const CheckDecision = z.object({
  disposition: z.enum(['act', 'wait']),
  reason: z.string().trim().min(1).max(300).describe('Short audit note (not shown to the learner)'),
  actions: z.array(CheckAction).max(3),
  outreach: Outreach.nullable(),
});
export type CheckDecision = z.infer<typeof CheckDecision>;
