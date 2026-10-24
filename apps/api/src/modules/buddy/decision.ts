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

import { VOICE_NAMES } from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

export const SUBJECT_KINDS = [
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
    .describe(`${what} alias (${prefix}N)`);

export const GoalRef = alias('g', 'goal');
/** A goal from STATE, or the test planned with plan_exam earlier in the same answer. */
export const GoalTarget = z
  .string()
  .regex(/^(g\d{1,3}|new)$/, 'must be a goal alias like g1, or "new"')
  .describe('goal alias; new = plan_exam in this answer');
const StepRef = alias('st', 'step');
/** A step from STATE, or the practice/step created earlier in the same answer. */
const StepTarget = z
  .string()
  .regex(/^(st\d{1,3}|new)$/, 'must be a step alias like st1, or "new"')
  .describe(
    'step alias from STATE (st1), or "new" for the practice (prepare_practice) or step (plan_step) created earlier in this same answer',
  );
/**
 * A standing arrangement, not a single day (issue #112). "jeden Tag um 5", "immer montags":
 * the step keeps its time and moves itself on after each reminder. Only these three — a child
 * asks for a rhythm, not a calendar rule, and anything finer would be a form to fill in.
 */
const RepeatSchema = z
  .enum(['daily', 'weekdays', 'weekly', 'never'])
  .describe('weekdays = Mon-Fri, weekly = same weekday; "never" ends a repetition she has');

const MemoryRef = alias('m', 'memory');
export const MaterialRef = alias('sh', 'sheet');
export const SubjectRef = alias('f', 'subject');

export const Quote = z.string().min(1).max(300);

// Days and durations as the learner described them; the server computes the date
// (hard rule 2). The model sees ONE flat object per spec — a kind plus the fields
// that kind uses — and code turns it into the exact union below. A union of four
// shapes, repeated in eight tools, cost ~7 000 input tokens per Buddy turn on
// Gemini 3.x, which bills the response schema (docs/architecture.md §Model calls).
const flatField = <T extends z.ZodTypeAny>(t: T, what?: string) =>
  what ? t.nullable().optional().describe(what) : t.nullable().optional();

/** Calendar field units, sent once rather than on every repeated DaySpec. */
export const DAY_FIELD_CONVENTIONS =
  'Day fields: date = YYYY-MM-DD; days 0 = today; weekday 1–7 = Monday–Sunday; weeks_ahead 0 = next occurrence. Until: days 0 = tonight; weeks_ahead 0 = this Sunday.';

const FlatDay = z.object({
  // The rule for choosing a kind stands once in the prompt (#667); here only the form.
  kind: z.enum(['date', 'in_days', 'weekday', 'unknown']),
  date: flatField(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  days: flatField(z.number().int().min(0).max(366)),
  weekday: flatField(z.number().int().min(1).max(7)),
  weeks_ahead: flatField(z.number().int().min(0).max(8)),
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
  kind: z.enum(['end_of_day', 'end_of_week', 'through', 'unknown']),
  days: flatField(z.number().int().min(0).max(60)),
  weeks_ahead: flatField(z.number().int().min(0).max(8)),
  day: flatField(DaySpecSchema, 'through: the last day'),
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
  .describe('HH:MM, 24h');

export const Title = z.string().trim().min(1).max(80);

// ─────────────── tools ───────────────

/**
 * What a memory is about — the model's own label for the note AND for the words it quotes.
 * Four of these are never kept: Art. 9 categories and what a learning companion has no
 * business holding about a child. `tools.ts` refuses them whether or not the turn was
 * marked as distress (issue #108: a live run stored a child's eating and a death in the
 * family in turns where `concern` was false). The model interprets (rule 1), code enforces;
 * no word list decides it (rule 3).
 */
const MEMORY_ABOUT = [
  'learning',
  'availability',
  'everyday',
  'health',
  'family',
  'harm',
  'identity',
] as const;
export type MemoryAbout = (typeof MEMORY_ABOUT)[number];

// What each label means stands once, in the prompt's safety rules (#667): it was here twice.
const About = z.enum(MEMORY_ABOUT).describe('what the note and its quote are about');

const remember = z.object({
  tool: z.literal('remember'),
  args: z.object({
    about: About,
    kind: z
      .enum(['fact', 'preference', 'goal', 'constraint'])
      .describe('constraint = temporary, with until'),
    statement: z
      .string()
      .trim()
      .min(3)
      .max(200)
      // The example that stood here showed the rewritten FORM — in German, with the
      // handball literal of issue #201 — on a surface that reaches the model in the same
      // request as the prompt (issue #213). The principle is the whole rule; `text.ts`
      // enforces it, and the prompt says it once in words.
      .describe('short, third person, in her language: only what her quote says'),
    quote: Quote,
    until: UntilSpecSchema.nullable().describe('kind constraint only, else null'),
  }),
});

const correctMemory = z.object({
  tool: z.literal('correct_memory'),
  args: z.object({
    about: About,
    memory: MemoryRef,
    statement: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .describe('what was known, changed only by what her quote says'),
    quote: Quote,
    until: UntilSpecSchema.nullable()
      .default(null)
      .describe("a constraint's new end; null keeps it"),
  }),
});

const forget = z.object({
  tool: z.literal('forget'),
  args: z.object({
    // "forget everything" is one wish, not sixty (issue #114): with an action cap of six per
    // answer, alias-by-alias ran out and the rest stayed silently. Forgetting is always a
    // reduction, so Buddy may do it (ADR 0006); each note keeps its own undo window.
    memory: MemoryRef.nullable().describe('null only with all'),
    all: z.boolean().default(false).describe('she wants everything you know about her gone'),
    quote: Quote,
  }),
});

const year = (lo: number, hi: number) => z.number().int().min(lo).max(hi);

/**
 * The school year as the learner's own school system names it (audit M-39): the model picks
 * the label she used, code converts it (schoolYearsOf). One entry per system.
 */
export const SchoolYear = z.discriminatedUnion('system', [
  z
    .object({ system: z.literal('de'), klasse: year(1, 13) })
    .describe('Germany, Austria, Switzerland: "7. Klasse" → klasse 7'),
  z
    .object({
      system: z.literal('fr'),
      classe: z.enum([
        'CP',
        'CE1',
        'CE2',
        'CM1',
        'CM2',
        '6e',
        '5e',
        '4e',
        '3e',
        '2nde',
        '1re',
        'Tle',
      ]),
    })
    .describe('France: "je suis en 4e" → classe 4e'),
  z
    .object({
      system: z.literal('es'),
      etapa: z.enum(['primaria', 'eso', 'bachillerato']),
      curso: year(1, 6),
    })
    .describe('Spain: "2º de la ESO" → etapa eso, curso 2'),
  z
    .object({
      system: z.literal('it'),
      scuola: z.enum(['primaria', 'media', 'superiore']),
      classe: year(1, 5),
    })
    .describe('Italy: "terza media" → scuola media, classe 3'),
  z
    .object({ system: z.literal('uk'), year: year(1, 13) })
    .describe('England and Wales: "Year 8" → year 8'),
  z
    .object({ system: z.literal('us'), grade: year(1, 12) })
    .describe('USA, Canada: "8th grade" → grade 8'),
]);
export type SchoolYear = z.infer<typeof SchoolYear>;

const FR_CLASSES = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e', '2nde', '1re', 'Tle'];

/**
 * Years of schooling, counted like the German Klasse (1 = first school year) — the one scale
 * `learners.grade` and every prompt use. Null when the label does not exist in that system
 * (e.g. 5º de la ESO).
 */
export function schoolYearsOf(y: SchoolYear): number | null {
  switch (y.system) {
    case 'de':
      return y.klasse;
    case 'fr':
      return FR_CLASSES.indexOf(y.classe) + 1;
    case 'es': {
      const [offset, max] = y.etapa === 'primaria' ? [0, 6] : y.etapa === 'eso' ? [6, 4] : [10, 2];
      return y.curso <= max ? offset + y.curso : null;
    }
    case 'it': {
      const [offset, max] =
        y.scuola === 'primaria' ? [0, 5] : y.scuola === 'media' ? [5, 3] : [8, 5];
      return y.classe <= max ? offset + y.classe : null;
    }
    case 'uk':
      // Year 1 starts a year earlier than German Klasse 1 (age 5–6).
      return Math.max(1, y.year - 1);
    case 'us':
      return y.grade;
  }
}

const setLevel = z.object({
  tool: z.literal('set_level'),
  args: z.object({
    level: z.enum(['school', 'university', 'adult']),
    school_year: SchoolYear.nullable()
      .default(null)
      .describe('level school: her own school system, as she said it; never convert it'),
    grade: year(1, 13)
      .nullable()
      // Named the German school year until issue #213. The six systems above are named
      // together on purpose; this fallback named exactly one of them, to every learner.
      .describe('only when school_year cannot be given: years of school; else null'),
    quote: Quote,
  }),
});

const planExam = z.object({
  tool: z.literal('plan_exam'),
  args: z.object({
    // An example title in one language is an example for all five (issues #200, #213): what
    // the field is says it, and the language is the learner's, not the example's.
    title: Title.describe('in her language'),
    subject: z.string().trim().min(1).max(40).describe('in her language'),
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
      .describe('done = it happened; dropped = no longer relevant'),
    outcome: z.enum(['good', 'ok', 'hard']).nullable().describe('if she said'),
    quote: Quote,
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
    /**
     * "in an hour", "in 20 minutes", "gleich": the SERVER turns this into a day and a time
     * against its own clock (issue #112). Until now the model had to read the clock out of
     * STATE, add, decide the midnight roll-over and write HH:MM — the one piece of time
     * arithmetic left to it, and code could not check the result against the wish.
     */
    in_minutes: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .nullable()
      // The German span that stood here as an example is restated by what her words DO
      // (issues #201, #213): a length of time from now instead of a point on the clock.
      .describe('a span from now she named; then day unknown and time null'),

    agreed: z.boolean().describe('she asked for or agreed to this time'),
    /** Needs agreed=true and a time: Buddy's own idea is a suggestion, never a standing rule. */
    repeat: RepeatSchema.nullable(),
    // Same as in_minutes: the end she named can be a date or an event, and UntilSpec carries
    // both — so the field says that it is an end she named, not how an end sounds (#213).
    repeat_until: UntilSpecSchema.nullable().describe(
      'only with repeat: an end she named, else null',
    ),
    quote: Quote.nullable().describe('needed when agreed'),
    // Optional in parsing (older scripted answers have neither); the model sees both.
    subject: SubjectRef.nullable()
      .optional()
      .describe('kind practice without a goal: its subject; null without material'),
    focus_topics: z
      .array(z.string().trim().min(1).max(60))
      .max(5)
      .optional()
      .describe('kind practice: topics she named'),
  }),
});

const updateStep = z.object({
  tool: z.literal('update_step'),
  args: z.object({
    step: StepRef,
    day: DaySpecSchema.nullable(),
    time: LocalTimeSchema.nullable(),
    state: z.enum(['skipped', 'cancelled']).nullable(),
    /** "nicht mehr jeden Tag" ends the repetition and leaves the next one standing (#112). */
    repeat: RepeatSchema.nullable(),
    quote: Quote,
  }),
});

const markStepDone = z.object({
  tool: z.literal('mark_step_done'),
  args: z.object({ step: StepRef, quote: Quote }),
});

const setContact = z.object({
  tool: z.literal('set_contact'),
  args: z.object({
    preferred_start: LocalTimeSchema.nullable(),
    preferred_end: LocalTimeSchema.nullable(),
    quiet_start: LocalTimeSchema.nullable().describe('evening start of quiet hours; only earlier'),
    quiet_end: LocalTimeSchema.nullable().describe('morning end of quiet hours; only later'),
    avoid_weekdays: z
      .array(z.number().int().min(1).max(7))
      .max(7)
      .nullable()
      .describe('Full new list of weekdays without messages (1 = Monday)'),
    pause: UntilSpecSchema.nullable().describe('nothing to the phone until then'),
    quote: Quote,
  }),
});

const setVoice = z.object({
  tool: z.literal('set_voice'),
  args: z.object({
    speed: z
      .enum(['slower', 'faster', 'normal'])
      .nullable()
      .describe('one step per wish; null = unchanged'),
    voice: z
      .enum(['other', ...VOICE_NAMES])
      .nullable()
      .describe('other = the next one; a named voice only if she chose it; null = unchanged'),
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

const openArea = z.object({
  tool: z.literal('open_area'),
  args: z.object({
    area: z
      .enum(['library', 'memory', 'settings', 'history', 'capture', 'practice'])
      .describe(
        "library = her sheets · memory = what you know · settings = contact, language, parents' area · history = earlier messages · capture = a photo · practice = the start of the practice you prepared",
      ),
  }),
});

/** The core's act tools, in the order the model reads them; a domain adds its own. */
const CORE_ACT_SCHEMAS = {
  remember,
  correct_memory: correctMemory,
  forget,
  set_level: setLevel,
  plan_exam: planExam,
  update_goal: updateGoal,
  close_goal: closeGoal,
  plan_step: planStep,
  update_step: updateStep,
  mark_step_done: markStepDone,
  set_contact: setContact,
  set_voice: setVoice,
  schedule_check: scheduleCheck,
  open_area: openArea,
} as const;

/**
 * The act tools a domain adds (issue #107, cut 7b): it declares their call schemas by augmenting
 * this interface and registers them at start-up, each at its place in the order the model reads
 * (`registerActTools`, registry.ts). The core names none of them.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DomainActSchemas {}

type ActSchemas = typeof CORE_ACT_SCHEMAS & DomainActSchemas;

/**
 * Every act tool's call schema, by name, in the order the model reads them (surfaces and
 * handlers: registry.ts). The domain's join at start-up (`placeActSchema`).
 */
export const ACT_SCHEMAS = { ...CORE_ACT_SCHEMAS } as ActSchemas;

/**
 * Puts a domain's act tool into `ACT_SCHEMAS` before the core tool `before` (at the end for
 * null), so the tools stand where they always stood: the order is part of the schema the model
 * reads and of the prompt's hash. Registering a tool again moves nothing.
 */
export function placeActSchema(name: string, schema: z.ZodTypeAny, before: string | null): void {
  const entries = Object.entries(ACT_SCHEMAS).filter(([n]) => n !== name);
  const at = before === null ? entries.length : entries.findIndex(([n]) => n === before);
  if (at < 0) throw new Error(`act tool ${name}: no tool ${before} to stand before`);
  entries.splice(at, 0, [name, schema]);
  const live = ACT_SCHEMAS as unknown as Record<string, z.ZodTypeAny>;
  for (const n of Object.keys(live)) delete live[n];
  Object.assign(live, Object.fromEntries(entries));
}

export type ToolName = keyof ActSchemas & string;
/** One call of the act tool K. */
export type ActionOf<K extends ToolName> = z.infer<ActSchemas[K]>;
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
