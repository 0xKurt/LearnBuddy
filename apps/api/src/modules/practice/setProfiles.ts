// What a topic run may use, and the schema built from it (issue #281, D2): the set the model
// answers with (`GeneratedSet`), one profile per kind of run (`SET_PROFILES`), what the model is
// SHOWN for it (`setSchemaForModel`, `explainSchemaFor`) and what code KEEPS of its answer
// (`parseSetFor`). docs/architecture.md §Practice. The call itself is `generate.ts`.
//
// The structured forms a run can use and the rules the model is told about them stand here side
// by side (`STRUCTURED_FORMS`, `STRUCTURED_RULES`): a new structured kind is one entry in each.

import {
  BarTask,
  type ItemKind,
  MAX_LISTEN_QUESTIONS,
  StaffTask,
  type StartTopicRequest,
  type StructuredKind,
  TASK_PARTS_MAX,
  TASK_PARTS_MIN,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import type { JsonSchema } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { MAX_BAR_ITEMS } from './bars.js';
import { CLOZE_RULES } from './cloze.js';
import { DictationDraft, DictationDraftParsed } from './dictation.js';
import { GRID_RULES } from './grid.js';
import { EssayDraft, MAX_ESSAYS } from './essayTask.js';
import { unusedItemFields } from './itemFields.js';
import { ItemDraft, itemsOneByOne } from './items.js';
import { ListenDraft, ListenQuestion } from './listen.js';
import { COLUMN_RULES } from './columnCalc.js';
import { FIND_ERROR_RULES } from './findError.js';
import { MARK_RULES } from './mark.js';
import { MATCH_RULES } from './match.js';
import { SELECT_RULES } from './selectAll.js';
import { MAX_STAFF_ITEMS } from './staff.js';
import { MAX_STRUCTURED_ITEMS, ORDER_RULES, StructuredDraftNoHelp } from './structured.js';
import { TABLE_RULES } from './table.js';
import { BuddyReadingDraft, BuddyReadingDraftParse } from './readText.js';
import { MAX_TEACH_BACK, TeachBackDraft } from './teachBack.js';
import { MAX_PART_TASKS, PART_KINDS, PartDraft, PartTaskDraft } from './taskParts.js';

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

export const GeneratedSet = z.object({
  usable: z
    .boolean()
    .describe('false if the request is not about learning something or cannot be done well'),
  title: z.string().trim().min(1).max(80),
  subject: z
    .object({ name: z.string().trim().min(1).max(40), kind: z.enum(SUBJECT_KINDS) })
    .nullable(),
  // Hints and worked solutions are written right after, in the background
  // (hints.ts): she starts at once instead of waiting for them.
  items: z.array(ItemDraft.omit({ hints: true, worked_solution: true })).max(25),
  /**
   * Fraction-bar tasks (issue #162). A separate list on purpose: here the model picks a
   * reviewed task and its numbers and NOTHING else — there is no field for a question text,
   * an answer or a figure, so it cannot write one that disagrees with the solution code
   * computes (`practice/bars.ts`).
   */
  bars: z.array(BarTask).max(MAX_BAR_ITEMS).default([]),
  /**
   * The one listening task of a listening run (issue #210): the text that is READ ALOUD and
   * the questions about it. A separate list for the same reason as `bars`: a listening
   * question is not an ordinary item that happens to mention a text — its stimulus is the
   * text, every answer has to stand IN that text (`practice/listen.ts`, Rule 0), and the
   * questions become items only once code has checked that.
   *
   * It is in the schema the model sees ONLY for a listening run (`omit` below): a field that
   * is there gets filled in, and a listening text in a maths practice is a text nobody asked
   * to hear.
   */
  listen: ListenDraft.nullable().default(null),
  /**
   * Note-line tasks (issue #226). A separate list for exactly the reason the bars are one: here
   * the model picks a reviewed task and its musical parameters and NOTHING else — there is no
   * field for a question text, an answer, options or a drawing, so it cannot write one whose key
   * disagrees with the staff that is drawn (`practice/staff.ts`).
   */
  staffs: z.array(StaffTask).max(MAX_STAFF_ITEMS).default([]),
  /**
   * Structured items (issues #228–#230): an order to find, a table to fill in, links to make.
   * Their own list, because their key is a shape code builds and checks
   * (`practice/structured.ts`, Regel 0 of #224), not a text in `answer`.
   */
  structured: z.array(StructuredDraftNoHelp).max(MAX_STRUCTURED_ITEMS).default([]),
  /**
   * The entries of a Diktat run (issue #242): words or sentences to be read aloud and typed. A
   * separate list for the reason `listen` is one — an entry is not a question the model writes,
   * it is a KEY, held to her list by code before it becomes one (`practice/dictation.ts`). In the
   * schema the model sees only for a Diktat run.
   */
  dictation: DictationDraft.nullable().default(null),
  /**
   * The open questions of a teach_back run (issue #236), each with its key points. A separate list
   * for the reason `dictation` is one: the key points ARE the key, held to their rules by code
   * before a question is stored (`practice/teachBack.ts`). In the schema only for that run.
   */
  teach_back: z.array(TeachBackDraft).max(MAX_TEACH_BACK).default([]),
  /**
   * The one reading text of a reading run (#368): Buddy's own text and the questions about it. A
   * separate list for the reason `listen` is one — its questions become items only once code has
   * checked the text's level and language and each question against it (`practice/readText.ts`).
   * In the schema the model sees only for that run.
   */
  reading: BuddyReadingDraft.nullable().default(null),
  /**
   * Tasks in parts (#297): a situation and subtasks a), b), c) on it. A separate list for the
   * reason `reading` is one — its parts become items only once code has checked every one of
   * them and recomputed every formula between them (`practice/taskParts.ts`).
   */
  part_tasks: z.array(PartTaskDraft).max(MAX_PART_TASKS).default([]),
  /**
   * The writing task of an essay run (issue #258): its wording, its text type and the text it is
   * about. A separate list for the reason `teach_back` is one: code sets the key points from the
   * type and holds the text to her sheet (`practice/essayTask.ts`). In the schema only for that run.
   */
  essay: z.array(EssayDraft).max(MAX_ESSAYS).default([]),
});
export type GeneratedSet = z.infer<typeof GeneratedSet>;
const DraftItem = ItemDraft.omit({ hints: true, worked_solution: true });

type ModelItemKind = ItemDraft['kind'];

/**
 * What a run of each kind can USE — the forms that can reach her (issue #281, D2). The one table
 * both directions are derived from:
 *
 *   - what the model is SHOWN (`setSchemaForModel`): a form no run of this kind can use is not
 *     in its schema, down through the nested unions — the item `kind` enum, the structured
 *     union's branches, and the fields an item kind never keeps (`itemFields.ts`: a rubric
 *     without a long answer, a tolerance without a number, a spelling mode without a typed word);
 *   - what code KEEPS (`parseSetFor`, `preparedFrom`): a form outside the table is dropped,
 *     whatever the model wrote (Rule 0: reject, never repair).
 *
 * So a profile can only leave out what code already threw away before D2 — derived from the
 * mode alone, never from the subject (a chart is as much geography as maths). Every row here was
 * a rule in `preparedFrom` before it became a row: `KINDS`, `STRUCTURED`, bars only in practice
 * (#162), note lines in practice and tests (#226), the listening task only in a listening run
 * (#210).
 */
export type SetProfile = {
  items: readonly ModelItemKind[];
  structured: readonly StructuredKind[];
  bars: boolean;
  staffs: boolean;
  listen: boolean;
  /** A Diktat's entries (#242): only in a Diktat run, where they are all there is. */
  dictation: boolean;
  /** Explanation questions with key points (#236): only in a teach_back run. */
  teachBack: boolean;
  /** Buddy's reading text and its questions (#368): only in a reading run. */
  reading: boolean;
  /**
   * Tasks in parts (#297): in practice and tests, where a class test's tasks belong. Their parts
   * take the item kinds of `items` (`partTaskSchemaFor`): an open part only where a long answer is.
   */
  partTasks: boolean;
  /** A long-text task (#258): only in an essay run, where it is all there is. */
  essay: boolean;
};

const STRUCTURED_FORMS = [
  'order',
  'table_fill',
  'match',
  'cloze',
  'select_all',
  'mark',
  'find_error',
  'column_calc',
  'grid_draw',
] as const satisfies StructuredKind[];

/**
 * What the generator is told about the structured forms, one "- " line each, in the order of
 * `GENERATE_SYSTEM` (`generate.ts`).
 */
export const STRUCTURED_RULES = [
  ORDER_RULES,
  TABLE_RULES,
  MATCH_RULES,
  CLOZE_RULES,
  SELECT_RULES,
  MARK_RULES,
  FIND_ERROR_RULES,
  COLUMN_RULES,
  GRID_RULES,
]
  .map((rule) => `- ${rule}`)
  .join('\n');

/** A profile with these item kinds and no list of its own. */
function onlyItems(items: readonly ModelItemKind[]): SetProfile {
  return {
    items,
    structured: [],
    bars: false,
    staffs: false,
    listen: false,
    dictation: false,
    teachBack: false,
    reading: false,
    partTasks: false,
    essay: false,
  };
}

export const SET_PROFILES: Record<StartTopicRequest['kind'], SetProfile> = {
  practice: {
    items: ['short', 'long', 'numeric', 'multiple_choice', 'formula', 'vocab'],
    structured: STRUCTURED_FORMS,
    bars: true,
    staffs: true,
    listen: false,
    dictation: false,
    teachBack: false,
    reading: false,
    partTasks: true,
    essay: false,
  },
  // One try per question: no long answer, and no bar — a test is not a place to try a surface.
  test: {
    items: ['short', 'numeric', 'multiple_choice', 'formula', 'vocab'],
    structured: STRUCTURED_FORMS,
    bars: false,
    staffs: true,
    listen: false,
    dictation: false,
    teachBack: false,
    reading: false,
    partTasks: true,
    essay: false,
  },
  vocab: onlyItems(['vocab']),
  speak: onlyItems(['speak']),
  // Nothing in `items` at all: the questions of a listening run come out of `listen`, where each
  // is checked against the spoken text first (#210, `listen.ts` Rule 0).
  listen: { ...onlyItems([]), listen: true },
  // Nothing in `items` either: a Diktat's words come out of `dictation`, held to her list (#242).
  spelling_dictation: { ...onlyItems([]), dictation: true },
  // „Erklär mal" (#236): nothing in `items` — its questions come out of `teach_back`, each with key
  // points code checked first.
  teach_back: { ...onlyItems([]), teachBack: true },
  // Leseverständnis without a photo (#368): nothing in `items` — the questions come out of
  // `reading`, each held to Buddy's text after its level and language were checked.
  read: { ...onlyItems([]), reading: true },
  // Lange Texte (#258): nothing in `items` — the one task comes out of `essay`.
  essay: { ...onlyItems([]), essay: true },
  // Homework is the task she typed: no form of the app's own around it.
  help: onlyItems(['short', 'long', 'numeric', 'multiple_choice', 'formula']),
};

/**
 * The fallback when no kind is known: every form but the listening task — the schema every run
 * without sheets was sent before D2, byte for byte (`GENERATED_SCHEMA`). Today every explain call
 * knows its kind (the contract requires it), so nothing sends it; it stays the measured baseline
 * and the answer for a caller that cannot narrow.
 */
export const FALLBACK_PROFILE: SetProfile = {
  items: ['short', 'long', 'numeric', 'multiple_choice', 'formula', 'vocab', 'speak'],
  structured: STRUCTURED_FORMS,
  bars: true,
  staffs: true,
  listen: false,
  dictation: false,
  teachBack: false,
  reading: false,
  partTasks: true,
  essay: false,
};

/** No form switched off: what a caller without a configuration gets. */
const ALL_ON: ReadonlySet<ItemKind> = new Set();

/**
 * A profile with the forms switched off in this environment taken out (issue #296,
 * `config.FORMS_OFF`): an item kind, a structured kind, a Diktat. Out of the profile means out of
 * the schema the model is shown AND out of what code keeps — the profile is the one table both
 * are derived from. A run left with nothing says so like any run without questions.
 */
function profileFor(
  kind: StartTopicRequest['kind'] | null,
  off: ReadonlySet<ItemKind> = ALL_ON,
): SetProfile {
  const profile = kind === null ? FALLBACK_PROFILE : SET_PROFILES[kind];
  if (off.size === 0) return profile;
  return {
    ...profile,
    items: profile.items.filter((k) => !off.has(k)),
    structured: profile.structured.filter((k) => !off.has(k)),
    dictation: profile.dictation && !off.has('spelling_dictation'),
  };
}

/**
 * The item a run asks for. Built from her sheets: every question's topic is one of theirs — the
 * schema offers only those, and a question on anything else is dropped (live finding 6). Its kind
 * is one the profile allows — in the enum's own order, so an unnarrowed enum stays byte-equal.
 * This is the PARSE side: every field stays, with its default.
 */
function itemSchemaFor(profile: SetProfile, topics: [string, ...string[]] | null) {
  const base = topics
    ? DraftItem.extend({
        topic: z.enum(topics).describe('Exactly one of the SHEETS topics — never another'),
      })
    : DraftItem;
  const kinds = DraftItem.shape.kind.options.filter((k) => profile.items.includes(k));
  const [first, ...rest] = kinds;
  // No item kind at all (a listening run): a schema that takes nothing, so any item is dropped.
  if (first === undefined) return null;
  return base.extend({ kind: DraftItem.shape.kind.extract([first, ...rest]) });
}

/** The structured union narrowed to the profile's branches, or null when none is allowed. */
function structuredSchemaFor(profile: SetProfile) {
  const options = StructuredDraftNoHelp.options.filter((o) =>
    profile.structured.includes(o.shape.type.value),
  );
  const [first, ...rest] = options;
  return first === undefined ? null : z.discriminatedUnion('type', [first, ...rest]);
}

/** A task in parts whose parts are `part`. */
function withParts<P extends z.ZodTypeAny>(part: P) {
  return PartTaskDraft.extend({ parts: z.array(part).min(TASK_PARTS_MIN).max(TASK_PARTS_MAX) });
}

/**
 * The tasks in parts a run asks for (#297), or null when it has none: each part's kind one of
 * `PART_KINDS` the profile's items allow, in the enum's own order (so an unnarrowed enum stays
 * byte-equal) — an open part (`long`) only where a long answer is. This is the PARSE side: every
 * field stays, with its default, like `itemSchemaFor`.
 */
function partTaskSchemaFor(profile: SetProfile) {
  if (!profile.partTasks) return null;
  const [first, ...rest] = PART_KINDS.filter((k) => profile.items.includes(k));
  if (first === undefined) return null;
  return withParts(PartDraft.extend({ kind: PartDraft.shape.kind.extract([first, ...rest]) }));
}

/** The profile of a run with this environment's switch, and its narrowed unions. */
function narrowed(
  kind: StartTopicRequest['kind'] | null,
  topics: [string, ...string[]] | null,
  off: ReadonlySet<ItemKind>,
) {
  const profile = profileFor(kind, off);
  return {
    profile,
    item: itemSchemaFor(profile, topics),
    structured: structuredSchemaFor(profile),
    partTask: partTaskSchemaFor(profile),
  };
}

/** A disabled list: whatever the model wrote there is dropped, and it reads as empty. */
const NOTHING = z.never();

/**
 * What the model is SHOWN for a run of this kind (issue #281, D2): only the forms its profile
 * allows, through every nested union the profile reaches. A null kind gets the fallback.
 */
export function setSchemaForModel(
  kind: StartTopicRequest['kind'] | null,
  topics: [string, ...string[]] | null,
  off: ReadonlySet<ItemKind> = ALL_ON,
) {
  const { profile, item, structured, partTask } = narrowed(kind, topics, off);
  // Without an open part (a test has no long answer) the model is not shown key points either.
  const shownPartTask =
    partTask && !profile.items.includes('long')
      ? withParts(partTask.shape.parts.element.omit({ points: true }))
      : partTask;
  return GeneratedSet.extend({
    items: z.array(item ? item.omit(unusedItemFields(profile.items)) : DraftItem).max(25),
    structured: z
      .array(structured ?? StructuredDraftNoHelp)
      .max(MAX_STRUCTURED_ITEMS)
      .default([]),
    part_tasks: z
      .array(shownPartTask ?? PartTaskDraft)
      .max(MAX_PART_TASKS)
      .default([]),
  }).omit({
    ...(item ? {} : { items: true }),
    ...(profile.bars ? {} : { bars: true }),
    ...(profile.staffs ? {} : { staffs: true }),
    ...(structured ? {} : { structured: true }),
    ...(profile.listen ? {} : { listen: true }),
    ...(profile.dictation ? {} : { dictation: true }),
    ...(profile.teachBack ? {} : { teach_back: true }),
    ...(profile.reading ? {} : { reading: true }),
    ...(partTask ? {} : { part_tasks: true }),
    ...(profile.essay ? {} : { essay: true }),
  });
}

/**
 * What code KEEPS of an answer for a run of this kind: the same profile, every form read one by
 * one (one unusable task costs itself, audit H-14/H-15), and a form outside the profile dropped
 * — the model was not shown it, so one that arrives anyway is not repaired into the run.
 */
export function parseSetFor(
  kind: StartTopicRequest['kind'],
  topics: [string, ...string[]] | null,
  off: ReadonlySet<ItemKind> = ALL_ON,
) {
  const { item, structured, partTask, profile } = narrowed(kind, topics, off);
  return GeneratedSet.extend({
    items: itemsOneByOne(item ?? NOTHING, 25),
    bars: itemsOneByOne(profile.bars ? BarTask : NOTHING, MAX_BAR_ITEMS),
    staffs: itemsOneByOne(profile.staffs ? StaffTask : NOTHING, MAX_STAFF_ITEMS),
    structured: itemsOneByOne(structured ?? NOTHING, MAX_STRUCTURED_ITEMS),
    // A listening task that does not fit its schema is no listening task, and the run then has
    // nothing — which the caller says plainly (`not_usable`, issue #210). Its questions are read
    // one by one like every other list.
    listen: profile.listen
      ? ListenDraft.extend({
          questions: itemsOneByOne(ListenQuestion, MAX_LISTEN_QUESTIONS),
        })
          .nullable()
          .default(null)
          .catch(null)
      : z.null().catch(null),
    dictation: profile.dictation
      ? DictationDraftParsed.nullable().default(null).catch(null)
      : z.null().catch(null),
    // Read one by one: a question whose points do not fit costs only itself.
    teach_back: itemsOneByOne(profile.teachBack ? TeachBackDraft : NOTHING, MAX_TEACH_BACK),
    // A text that does not fit its schema is no text: the run then has nothing (`not_usable`).
    reading: profile.reading
      ? BuddyReadingDraftParse.nullable().default(null).catch(null)
      : z.null().catch(null),
    // Read one by one: a task whose shape does not fit costs only itself.
    part_tasks: itemsOneByOne(partTask ?? NOTHING, MAX_PART_TASKS),
    essay: itemsOneByOne(profile.essay ? EssayDraft : NOTHING, MAX_ESSAYS),
  });
}

// Exported for the schema inventory (`evals/schema`, issue #281): the fallback, which is what every
// run without sheets was sent before D2.
export const GENERATED_SCHEMA = toJsonSchema(setSchemaForModel(null, null));

/**
 * The `responseJsonSchema` an explain call sends for this kind and these sheet topics — the one
 * seam the call site and the schema inventory (`evals/schema`, issue #281) both go through, so the
 * inventory measures exactly what is sent.
 */
export function explainSchemaFor(
  kind: StartTopicRequest['kind'],
  topics: [string, ...string[]] | null,
  off: ReadonlySet<ItemKind> = ALL_ON,
): JsonSchema {
  return toJsonSchema(setSchemaForModel(kind, topics, off));
}
