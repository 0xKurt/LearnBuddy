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

import {
  DifficultyWish as DifficultyWishSchema,
  VocabDirection as VocabDirectionSchema,
  VOICE_NAMES,
} from '@learnbuddy/shared-types/contracts';
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
/**
 * A standing arrangement, not a single day (issue #112). "jeden Tag um 5", "immer montags":
 * the step keeps its time and moves itself on after each reminder. Only these three — a child
 * asks for a rhythm, not a calendar rule, and anything finer would be a form to fill in.
 */
export const RepeatSchema = z
  .enum(['daily', 'weekdays', 'weekly', 'never'])
  .describe(
    'a reminder she wants again and again: daily, weekdays (Mon-Fri), weekly (same weekday). "never" ends a repetition she already has',
  );

export const MemoryRef = alias('m', 'memory');
export const MaterialRef = alias('sh', 'sheet');
export const SubjectRef = alias('f', 'subject');

export const Quote = z
  .string()
  .min(1)
  .max(300)
  .describe(
    "the learner's exact words, whole words as written (what they wrote since your last answer)",
  );

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

/**
 * What a memory is about — the model's own label for the note AND for the words it quotes.
 * Four of these are never kept: Art. 9 categories and what a learning companion has no
 * business holding about a child. `tools.ts` refuses them whether or not the turn was
 * marked as distress (issue #108: a live run stored a child's eating and a death in the
 * family in turns where `concern` was false). The model interprets (rule 1), code enforces;
 * no word list decides it (rule 3).
 */
export const MEMORY_ABOUT = [
  'learning',
  'availability',
  'everyday',
  'health',
  'family',
  'harm',
  'identity',
] as const;
export type MemoryAbout = (typeof MEMORY_ABOUT)[number];

const About = z
  .enum(MEMORY_ABOUT)
  .describe(
    'What this note and the words you quote are about, labelled honestly: learning = school, subjects, level, topics, learning goals, how they like to learn · availability = when they can or cannot practise, and until when, without the reason · everyday = ordinary life that is none of the others · health = their body or mind, illness, symptoms, eating, sleeping, an injury, a disability, treatment · family = trouble at home · harm = being hurt, bullied, threatened, or hurting themselves · identity = their religion, origin, politics or sexuality (the school subject is learning). The app keeps the first three and refuses the rest.',
  );

const remember = z.object({
  tool: z.literal('remember'),
  args: z.object({
    about: About,
    kind: z
      .enum(['fact', 'preference', 'goal', 'constraint'])
      .describe('constraint = temporary situation that ends (requires until)'),
    statement: z
      .string()
      .trim()
      .min(3)
      .max(200)
      // The example that stood here showed the rewritten FORM — in German, with the
      // handball literal of issue #201 — on a surface that reaches the model in the same
      // request as the prompt (issue #213). The principle is the whole rule; `text.ts`
      // enforces it, and the prompt says it once in words.
      .describe(
        "Short third-person statement in the learner's language with only what her quote says — no day, time, place or detail she did not say, and nothing that only places it in the moment she is writing in",
      ),
    quote: Quote,
    until: UntilSpecSchema.nullable().describe('Required for kind=constraint, otherwise null'),
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
      .describe('The corrected statement: what was known, changed only by what her quote says'),
    quote: Quote,
    until: UntilSpecSchema.nullable()
      .default(null)
      .describe('Only for a temporary situation (constraint) whose end changed; null keeps it'),
  }),
});

const forget = z.object({
  tool: z.literal('forget'),
  args: z.object({
    // "forget everything" is one wish, not sixty (issue #114): with an action cap of six per
    // answer, alias-by-alias ran out and the rest stayed silently. Forgetting is always a
    // reduction, so Buddy may do it (ADR 0006); each note keeps its own undo window.
    memory: MemoryRef.nullable().describe('the note to forget; null only together with all=true'),
    all: z
      .boolean()
      .default(false)
      .describe(
        'true only when she asks for everything you know about her to go, not a part of it',
      ),
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
      .describe(
        'level school: the school year in her own school system, as she said it (never convert it yourself); null otherwise or when unknown',
      ),
    grade: year(1, 13)
      .nullable()
      // Named the German school year until issue #213. The six systems above are named
      // together on purpose; this fallback named exactly one of them, to every learner.
      .describe(
        'Only when school_year cannot be given: the school year as a plain number, counted from the first year of school; else null',
      ),
    quote: Quote,
  }),
});

const planExam = z.object({
  tool: z.literal('plan_exam'),
  args: z.object({
    // An example title in one language is an example for all five (issues #200, #213): what
    // the field is says it, and the language is the learner's, not the example's.
    title: Title.describe("The test's title, in the learner's language"),
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
    // The three below are optional in parsing (older scripted answers have none of them);
    // the model sees all of them. Issue #113.
    only_wrong: z
      .boolean()
      .optional()
      .describe(
        'true only when the learner asks for the questions that did not sit the last time they were asked. Then only those are chosen — never one that has not been asked yet — and there may be fewer of them than the minutes suggest.',
      ),
    difficulty: DifficultyWishSchema.nullable()
      .optional()
      .describe(
        'When the learner asks for something harder or something easier: "harder" takes the harder half of her own questions for this, "easier" the easier half. null when she said nothing about it.',
      ),
    direction: VocabDirectionSchema.nullable()
      .optional()
      .describe(
        'Vocabulary only, and only what she asked for: "recognise" shows the foreign word and asks what it means, "produce" shows it in her own language and asks for the foreign word. Either way only vocabulary is chosen; null for everything else.',
      ),
    // Two sheets of the same subject used to be one pool, so asking for the vocabulary
    // could hand her the other sheet (issue #144).
    sheet: MaterialRef.nullable()
      .optional()
      .describe(
        'the one sheet the questions must come from, when she pointed at a sheet. STATE lists her sheets with their aliases. null when she named no sheet.',
      ),
    vocabulary_only: z
      .boolean()
      .optional()
      .describe(
        'true when she asked for vocabulary and nothing else. Then only vocabulary is chosen, even from a subject whose other sheets are about something different. Leave it out when she asked for a subject or a topic in general.',
      ),
    // Without these two, "minutes" was the only thing that could set the size — a guess
    // about how long she wants to sit, standing in for what she actually said (#145).
    question_count: z
      .number()
      .int()
      .min(1)
      .max(500)
      .nullable()
      .optional()
      .describe(
        'the number of questions SHE named. null when she named none — then the minutes decide.',
      ),
    all_of_them: z
      .boolean()
      .optional()
      .describe(
        'true when she asked for everything there is (a whole word list, the whole sheet). Then the minutes do not limit it. Do not put a number in your reply: you cannot know it yet, and the card says how many it became.',
      ),
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
      .describe(
        'minutes from now, when she named a span from now instead of a clock time. The server computes day and time; leave day unknown and time null then',
      ),

    agreed: z
      .boolean()
      .describe('true only if the learner asked for / agreed to this time (a reminder)'),
    /** Needs agreed=true and a time: Buddy's own idea is a suggestion, never a standing rule. */
    repeat: RepeatSchema.nullable(),
    // Same as in_minutes: the end she named can be a date or an event, and UntilSpec carries
    // both — so the field says that it is an end she named, not how an end sounds (#213).
    repeat_until: UntilSpecSchema.nullable().describe(
      'only with repeat: the last day it should still come, when she named an end of her own; null = until she ends it',
    ),
    quote: Quote.nullable().describe('Required when agreed=true'),
    // Optional in parsing (older scripted answers have neither); the model sees both.
    subject: SubjectRef.nullable()
      .optional()
      .describe(
        'kind practice without a goal: the subject (f1) she wants to practise; null if it has no material yet',
      ),
    focus_topics: z
      .array(z.string().trim().min(1).max(60))
      .max(5)
      .optional()
      .describe('kind practice: topics she named, in her words'),
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

const requestMaterial = z.object({
  tool: z.literal('request_material'),
  args: z.object({
    goal: GoalTarget.nullable(),
    // What it is for stays (the field name alone does not say it); the German example of what
    // a sheet is called does not (#213) — the app shows this title to the learner.
    title: Title.describe("What to photograph, in the learner's language"),
    /**
     * A page that belongs to a sheet she already sent — the forgotten back, a page left out
     * (issue #118). Without it the page becomes a second sheet of its own.
     */
    material: MaterialRef.nullable()
      .optional()
      .describe('the sheet (sh1) this page belongs to, when it completes one she already sent'),
  }),
});

/**
 * One question off a sheet (issue #120). She names it in words, not by an id: the server finds
 * it in that sheet's own questions (rule 2). Like deleting a sheet it cannot be taken back —
 * the text, the solution and her answers go — so the same two turns apply.
 */
const deleteItem = z.object({
  tool: z.literal('delete_item'),
  args: z.object({
    material: MaterialRef,
    question: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .describe('the question as it stands on the sheet (from find_questions), word for word'),
    quote: Quote,
  }),
});

const setContact = z.object({
  tool: z.literal('set_contact'),
  args: z.object({
    preferred_start: LocalTimeSchema.nullable(),
    preferred_end: LocalTimeSchema.nullable(),
    quiet_start: LocalTimeSchema.nullable().describe(
      'Evening start of the quiet hours: no messages at all from this time until the morning; only earlier than it is now',
    ),
    quiet_end: LocalTimeSchema.nullable().describe(
      'Morning end of the quiet hours: nothing before this time. Only later than it is now — asking for quiet until later is less contact, and you may do that (issue #114)',
    ),
    avoid_weekdays: z
      .array(z.number().int().min(1).max(7))
      .max(7)
      .nullable()
      .describe('Full new list of weekdays without messages (1 = Monday)'),
    pause: UntilSpecSchema.nullable().describe('Nothing to the phone until then'),
    quote: Quote,
  }),
});

/**
 * What she says about one of her own sheets, instead of a button in a list (issue #111): of
 * seventeen act tools, not one ever touched a sheet, so "delete that screenshot" was answered
 * with a link to the library. Deleting is a reduction and undoable for a week, like every
 * other memory-ish thing Buddy does.
 */
const deleteMaterial = z.object({
  tool: z.literal('delete_material'),
  args: z.object({
    material: MaterialRef,
    quote: Quote.describe('her words asking for it to go'),
  }),
});
// Both deletions PROPOSE (issue #151): the app puts a card in front of her with the name
// of what would go, and her tap decides. So the reply asks — it never reports it as done.

const renameMaterialTool = z.object({
  tool: z.literal('rename_material'),
  args: z.object({
    material: MaterialRef,
    title: Title.describe('the name she gave it, in her words'),
    quote: Quote,
  }),
});

const setVoice = z.object({
  tool: z.literal('set_voice'),
  args: z.object({
    speed: z
      .enum(['slower', 'faster', 'normal'])
      .nullable()
      .describe(
        'How you are read aloud: "sprich langsamer" → slower (one step each time she asks), "schneller" → faster, "wieder normal" → normal; null = unchanged',
      ),
    voice: z
      .enum(['other', ...VOICE_NAMES])
      .nullable()
      .describe(
        '"andere Stimme" → other (the next one); one of the named voices only if she chose it; null = unchanged',
      ),
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
      .enum(['practice', 'vocab', 'speak', 'help', 'test'])
      .describe(
        'questions on a topic · a vocabulary list · speaking practice · homework help · a practice test (no hints, results at the end)',
      ),
    text: z
      .string()
      .trim()
      .min(2)
      .max(600)
      .describe(
        "What to learn, in the learner's words (topic, the vocabulary they typed, or the homework task)",
      ),
    goal: GoalRef.nullable()
      .default(null)
      .describe(
        'practice or test for a planned test in STATE: its alias (g1) — the questions then stay within the sheets she photographed for it; otherwise null',
      ),
    // Optional in parsing (older scripted answers have neither); the model sees both. Issue #113.
    difficulty: DifficultyWishSchema.nullable()
      .optional()
      .describe(
        'Only when she asks for something harder or something easier than she is getting: the new questions are written above or below her grade. null when she said nothing about it.',
      ),
    direction: VocabDirectionSchema.nullable()
      .optional()
      .describe(
        'vocab only, and only what she asked for: "recognise" asks what the foreign word means, "produce" shows it in her own language and asks for the foreign word. null asks both directions, as usual.',
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
  delete_material: deleteMaterial,
  rename_material: renameMaterialTool,
  delete_item: deleteItem,
  set_contact: setContact,
  set_voice: setVoice,
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
