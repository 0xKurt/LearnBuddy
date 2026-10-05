import { z } from 'zod';

import { AnswerSurface } from './bars.js';
import { IsoDateTime, SubjectKind, Uuid } from './common.js';
import { DrillView } from './drill.js';
import { ESSAY_TEXT_MAX, EssayFeedback } from './essay.js';
import { Figure } from './figure.js';
import { ListenRef } from './listen.js';
import { PassageView } from './reading.js';
import { StructuredAnswer, StructuredTaskView } from './structured.js';

// ─────────────── material (photographed worksheets) ───────────────

export const MaterialStatus = z.enum([
  'awaiting_upload',
  'queued',
  'processing',
  'ready',
  'failed',
]);
export type MaterialStatus = z.infer<typeof MaterialStatus>;

export const MaterialFailure = z.enum([
  'photos_missing',
  'unreadable',
  'not_learning_material',
  'model_error',
  'budget_exhausted',
  /** The provider's safety filter refused to read it; reading again would not help. */
  'blocked',
  /**
   * The sheet was read perfectly well — and every task on it is an exercise form Buddy
   * cannot practise (`NotPracticableForm`): a construction with compasses, an essay, a
   * real experiment. Reading it again changes nothing, so this is a final state; the
   * photos stay, because the sheet is valid and she may want to look at it (issue #198).
   */
  'form_not_practicable',
  /**
   * A corrected class test on which the teacher marked nothing wrong (issue #259): the source
   * of practice there is exactly the marked tasks, so there is nothing to practise. Final like
   * the one above, and its photos go at once — they show a grade.
   */
  'nothing_marked',
]);
export type MaterialFailure = z.infer<typeof MaterialFailure>;

/**
 * Failures a second reading of the same photos cannot change: `retryMaterial` refuses it and no
 * card offers "Nochmal lesen" (issues #198, #259). One list, read by the API and the app alike.
 */
export const FINAL_FAILURES: ReadonlySet<MaterialFailure> = new Set<MaterialFailure>([
  'not_learning_material',
  'blocked',
  'form_not_practicable',
  'nothing_marked',
]);

/**
 * Failures whose photos are deleted at once instead of after the retention period: a photo of
 * something else, one the safety filter refused, and a corrected test (it shows a grade).
 */
export const PHOTOS_GONE_AT_ONCE: ReadonlySet<MaterialFailure> = new Set<MaterialFailure>([
  'not_learning_material',
  'blocked',
  'nothing_marked',
]);

/**
 * Failures where the sheet WAS read, it only gives nothing to practise: every task is a form
 * Buddy has no exercise for (#198), or a corrected test has nothing marked (#259). No card may
 * say "konnte ich nicht lesen" for them (rule 5, issue #411); the library calls them "ohne Übungen".
 */
export const READ_WITHOUT_EXERCISES: ReadonlySet<MaterialFailure> = new Set<MaterialFailure>([
  'form_not_practicable',
  'nothing_marked',
]);

/**
 * What kind of page the reading recognised (issue #259) — the model says it, code decides what
 * follows from it:
 * - `sheet`: a worksheet, a textbook page, a vocabulary list — read as always.
 * - `corrected_test`: a class test the teacher has marked. Only the marked tasks become
 *   practice, as NEW tasks of the same kind; the grade and points have no field anywhere, the
 *   transcript holds only the marked tasks, and the photos are deleted right after the reading.
 * - `notebook_entry`: her notebook entry of a lesson (Hefteintrag) — a handful of short
 *   questions, the stuff an unannounced test about the last lesson asks about.
 */
export const MaterialSource = z.enum(['sheet', 'corrected_test', 'notebook_entry']);
export type MaterialSource = z.infer<typeof MaterialSource>;

/**
 * Exercise forms Buddy has no exercise for, by what the task's PRODUCT is
 * (docs/lehrplan-und-uebungsformen.md §12.3 "Gruppe 3"). The list lives here, in code,
 * not in the extraction prompt: it decides a state the app shows and a failure the API
 * refuses to retry, so it is enforced, not suggested (CLAUDE.md rule 1).
 *
 * Each of them is its own input surface AND its own marker — around fifteen features, not
 * one. Until they exist, a task of this form gets NO questions written about it: a sheet
 * that silently became knowledge questions about its own text is the quiet substitution
 * of issue #198.
 */
export const NotPracticableForm = z.enum([
  /**
   * The product is a drawing: a construction with compasses and ruler, a function graph,
   * a circuit diagram, force arrows, a Lewis/structural formula, a titration curve, a
   * labelled schema, a family tree or cladogram, a climate or profile section, a map
   * sketch, a flow chart, UML/ER/automaton diagram.
   *
   * **Musical notation left this list** (issue #226): a note line is now a surface she writes
   * on (`StaffWriteSurface`), and what she writes is checked note by note by code
   * (`modules/practice/staff.ts`). It is the second drawing to leave it, after the fraction
   * bar — which is the measure of what each of these costs: one representation, one input
   * surface, one checker.
   *
   * **Drawing on a grid left it in part** (issue #249): plotting points, setting points on a line
   * or a parabola, mirroring a figure on squared paper and drawing a bar chart are the structured
   * kind `grid_draw`, checked exactly by code. Only in a run Buddy prepares: a photographed sheet's
   * drawing task still lands here, because the paper would have to be read off the photo.
   */
  'drawing',
  /**
   * Free speaking in a dialogue: a speaking exam with role cards, a tandem conversation,
   * a debate, "thinking aloud". Buddy's `speak` is reading a GIVEN text aloud, word by
   * word — a partner who asks back is a different machine.
   */
  'spoken_dialogue',
  /** A real experiment, a specimen, a dissection, a survey in the field: the physical world. */
  'experiment',
  /**
   * A text far beyond the answer field (2000 characters): material-based writing, an
   * interpretation, an essay. An input problem, not a marking problem. The question form
   * `essay` (issue #258) now checks such a text; a sheet's task of this form still gets no
   * question until the app's long-text field ships (#258 step 2).
   */
  'long_text',
  /** A piece of work over days or weeks as the PRODUCT: Facharbeit, GFS, project, presentation. */
  'multi_day_project',
  /** A practical subject done away from the device: art, an instrument, composition, sport. */
  'practical',
  /**
   * Hearing it, where the SOUND is the task: a chord to identify by ear, a rhythm or melody
   * to write down from hearing it. Buddy can play a note line (issue #226), so the sound
   * exists — but there the drawn line is the question and the sound is a help with it. Turning
   * that round means the answer is a note line written from nothing but hearing, and then a
   * learner who hears correctly and writes one octave too low would be marked wrong. That is
   * its own feature with its own decisions, and until it exists a task of this form gets no
   * questions (issue #224 kept it out on purpose).
   */
  'ear_training',
]);
export type NotPracticableForm = z.infer<typeof NotPracticableForm>;

/**
 * One task on the sheet that got no questions, and why (issue #198). The sheet keeps
 * whatever else was practicable, so a sheet with five sums and one essay gives five
 * questions and one honest sentence about the sixth — never six questions, never none.
 */
export const NotPracticable = z.object({
  /** The task as PRINTED on the sheet, so she recognises which one is meant. */
  task: z.string().trim().min(1).max(120),
  form: NotPracticableForm,
});
export type NotPracticable = z.infer<typeof NotPracticable>;

/**
 * A page Buddy could not read completely (cut off, blurred, …). Lena is told
 * and may photograph exactly that page again (docs/architecture.md §Material).
 */
export const PageProblem = z.object({
  /** Position of the photo, starting at 1. */
  page: z.number().int().min(1),
  read: z.enum(['part', 'none']),
  problem: z
    .enum(['cut_off', 'blurry', 'dark', 'glare', 'covered', 'not_material', 'other'])
    .nullable(),
});
export type PageProblem = z.infer<typeof PageProblem>;

/** How many readings one unclear spot may offer: two is the usual case, four the most. */
export const MOST_UNCLEAR_READINGS = 4;

/** One reading a spot could be, with the alias the learner's answer names (CLAUDE.md rule 2). */
export const UnclearReading = z.object({
  /** 'r1' … 'r4', issued by the server from the position. */
  ref: z.string().regex(/^r[1-9][0-9]*$/),
  /** The reading as the model offered it ("12"), shown on the button she taps. */
  text: z.string().min(1).max(60),
});
export type UnclearReading = z.infer<typeof UnclearReading>;

/**
 * One spot on a sheet the reading could not settle, and the smallest clarification it needs
 * (issue #164 point 1, migration 0070). Before this, an unreadable digit cost the whole page:
 * the page counted as partly read, the learner was asked to photograph it again, and the
 * question for that task was never written — she never learned WHERE it stuck, so she could
 * not help.
 *
 * The ask is in words, with the page she sent beside it: a box would have to come from the
 * same model that just said it could not read this spot, and a wrong box shows her the wrong
 * part of her own sheet. She taps one of `readings` — never free text the model would have to
 * interpret — and the question for `task` is written from the reading SHE confirmed. Until
 * then that question does not exist, and the rest of the sheet is ready and practicable.
 */
export const UnclearSpot = z.object({
  /** 'u1', 'u2' … unique per sheet; her answer names this, never an id (rule 2). */
  ref: z.string().regex(/^u[1-9][0-9]*$/),
  /** The task as PRINTED, so she recognises which one is meant. */
  task: z.string().min(1).max(120),
  /** What about it could not be read, in a few words ("die erste Zahl"). */
  about: z.string().min(1).max(80),
  readings: z.array(UnclearReading).min(2).max(MOST_UNCLEAR_READINGS),
  /** open: waiting for her · answered: she picked one and the question is being written. */
  status: z.enum(['open', 'answered']),
  /** The reading she confirmed, once she has (never a guess of the model's). */
  answer: z.string().nullable(),
});
export type UnclearSpot = z.infer<typeof UnclearSpot>;

export const CreateMaterialRequest = z.object({
  client_request_id: Uuid,
  /**
   * One entry per file, in page order: photos, or a PDF (worksheets shared as PDF). The API
   * counts a PDF's pages on submit: 20 pages at most in all (reason too_many_pages).
   */
  photo_mimes: z
    .array(z.enum(['image/jpeg', 'image/png', 'application/pdf']))
    .min(1)
    .max(20),
  goal_id: Uuid.nullable().optional(),
  /** The capture step (Buddy asked for this photo); it is done once the photos are read. */
  step_id: Uuid.nullable().optional(),
  /** homework: the learner needs help with these tasks — hints only, never the solution. */
  purpose: z.enum(['study', 'homework']).default('study'),
  /**
   * The pages missing from this earlier material, photographed again: its notice
   * ends, and the new photos keep its goal and purpose.
   */
  completes: Uuid.nullable().optional(),
  /**
   * She asked for these pages to be sent (issue #56). Pages go up as soon as they are ready,
   * so a reservation exists while she is still attaching — until this is true it is not a
   * sheet on its way: the home says nothing about it and Buddy counts no material.
   * Default false; submit sets it too, so an older app never leaves it unset.
   */
  sending: z.boolean().default(false),
});
export type CreateMaterialRequest = z.infer<typeof CreateMaterialRequest>;

export const MaterialView = z.object({
  id: Uuid,
  title: z.string().nullable(),
  status: MaterialStatus,
  failure_reason: MaterialFailure.nullable(),
  /** The photos are gone (retention or deletion): reading it again is not possible. */
  photos_deleted: z.boolean(),
  item_count: z.number().int(),
  /**
   * How many of those questions are SENTENCES TO READ ALOUD (issue #223 point 2). They are
   * part of `item_count` but never part of an ordinary practice — `practice/selection.ts`
   * keeps a spoken item out of a written run on purpose — so without this number the sheet
   * could count them and offer no way to practise them. Non-zero, the sheet offers a
   * speaking run (`StartPracticeRequest.mode = 'speak'`); zero, it says nothing about them.
   * It counts exactly what such a run would hold, so the offer can never lead to "nothing to
   * practise": homework (which is helped with, not drilled) and deleted questions are out.
   */
  speak_count: z.number().int().default(0),
  subject_name: z.string().nullable(),
  goal_id: Uuid.nullable(),
  purpose: z.enum(['study', 'homework']),
  /** What kind of page the reading recognised (issue #259); `sheet` until it is read. */
  source: MaterialSource.default('sheet'),
  /** homework: the help session, once the tasks are read. */
  session_id: Uuid.nullable(),
  /**
   * The state of that session: active — tasks still open ("Weiter mit der Hausaufgabe");
   * finished — every task solved; abandoned — closed after a long pause or with the sheet.
   */
  session_status: z.enum(['active', 'finished', 'abandoned']).nullable().default(null),
  /** Pages not read completely, while Lena has not answered the notice. */
  page_problems: z.array(PageProblem),
  /**
   * The sheet holds more questions than were read into items (issue #150). The pages were
   * legible — there were simply more of them than the readings could take. Said out loud
   * rather than left to be discovered: a sheet that looks whole and is not is what made
   * "ask me all the vocabulary" hand back half a word list.
   */
  items_incomplete: z.boolean().default(false),
  /**
   * Tasks on this sheet Buddy wrote no questions for, because their form is one he cannot
   * practise (issue #198). Empty for almost every sheet; non-empty it is said out loud,
   * on the card and on the sheet's own screen — a task nobody mentions would look done.
   */
  not_practicable: z.array(NotPracticable).max(20).default([]),
  /** Pages: a photo is one, a PDF counts its pages (known once submitted). */
  photo_count: z.number().int(),
  /** Pages added to a sheet: once read, their questions are part of that sheet. */
  merged_into: Uuid.nullable(),
  created_at: IsoDateTime,
});
export type MaterialView = z.infer<typeof MaterialView>;

export const CreateMaterialResponse = z.object({
  material: MaterialView,
  uploads: z.array(
    z.object({ position: z.number().int(), path: z.string(), url: z.string(), token: z.string() }),
  ),
});
export type CreateMaterialResponse = z.infer<typeof CreateMaterialResponse>;

/**
 * An exercise of a subject that came from no sheet (issue #189): a vocabulary list she
 * typed, a topic she named, the practice Buddy prepared for a test. A sheet's own practice
 * is reached from the sheet ("Üben"); these have no sheet, so without this they stand
 * nowhere she can open them again. It carries no result and no score — what happened is on
 * the exercise's own screen.
 */
export const SubjectExercise = z.object({
  id: Uuid,
  title: z.string().nullable(),
  /** active — still open, tapping goes on with it; finished — its review. */
  status: z.enum(['active', 'finished']),
  started_at: IsoDateTime,
});
export type SubjectExercise = z.infer<typeof SubjectExercise>;

/**
 * One subject in "Dein Material" (issue #189): everything there is for it — her sheets,
 * the exercises that came from no sheet, and the topics her questions carried. A place to
 * look things up; nothing here says what is due or how much is left (rule 6).
 */
export const LibrarySubject = z.object({
  id: Uuid,
  name: z.string(),
  kind: SubjectKind,
  materials: z.array(MaterialView),
  /** Newest first, at most ten: a way back in, not a history. */
  exercises: z.array(SubjectExercise).max(10).default([]),
  /** What came up in this subject, most recent first, at most twelve. */
  topics: z.array(z.string()).max(12).default([]),
});
export type LibrarySubject = z.infer<typeof LibrarySubject>;

export const LibraryView = z.object({
  subjects: z.array(LibrarySubject),
  unsorted: z.array(MaterialView),
});
export type LibraryView = z.infer<typeof LibraryView>;

// ─────────────── practice ───────────────

export const ItemKind = z.enum([
  'short',
  'long',
  'numeric',
  'multiple_choice',
  'formula',
  /** A vocabulary pair: prompt in prompt_lang, answer (the translation) in lang. */
  'vocab',
  /** Say the prompt aloud in lang; the model listens to the recording. */
  'speak',
  // Structured items (issues #228–#232, contracts/structured.ts): answered with `parts`,
  // judged by code against `items.task`. `ItemView.task_view` shows what to arrange.
  /** Put 3–8 elements into the right order (#228). */
  'order',
  /** Pair elements, or sort them into groups (#229). */
  'match',
  /** Fill the gaps of a table (#230). */
  'table_fill',
  /** Fill 2–8 gaps in one text, typed or from a word bank (#232). */
  'cloze',
  /**
   * Diktat (issue #242, contracts/dictation.ts): Buddy reads a word or sentence aloud, she types
   * it. The word is never in the view while the question is open; `ItemView.listen` names the
   * recording, `POST /practice/sessions/:id/listen` plays it. Not called "dictation" alone: in
   * the app that word already means voice input (`lib/speech/dictation.ts`), which is exactly
   * what this question must NOT offer.
   */
  'spelling_dictation',
  /** Tick every right answer among several options (#240). */
  'select_all',
  /** Tap words, comma gaps or syllable breaks in a sentence or text (#234). */
  'mark',
  /** Fehlerdetektiv: tap the wrong line of a worked solution and write it right (#260). */
  'find_error',
  /** Written arithmetic in columns, digit by digit, with its carries (#260). */
  'column_calc',
  /** Draw on a grid: plot points, set points on a graph, mirror a figure, pull bars (#249). */
  'grid_draw',
  /**
   * A long text — Aufsatz, Erörterung, Interpretation (issue #258, contracts/essay.ts): up to
   * `ESSAY_TEXT_MAX` characters, feedback per key point of its text type and three places to
   * improve, never a grade: its turns carry `not_an_attempt` (nothing graded) and the feedback in
   * `PracticeTurnView.essay`. Never in a practice test.
   */
  'essay',
]);
export type ItemKind = z.infer<typeof ItemKind>;

/** Where a question comes from: a photo, Buddy (a topic the learner named), a typed list, homework. */
export const ItemOrigin = z.enum(['material', 'buddy', 'typed', 'homework']);
export type ItemOrigin = z.infer<typeof ItemOrigin>;

/**
 * A real crop from the photographed sheet that goes with the question (issue #50):
 * a labelled diagram, a reference chart — never a generated picture. The URL is a
 * short-lived signed Storage URL made when the view is built; width/height give the
 * app a fixed ratio so the card never jumps while it loads.
 */
export const ItemImage = z.object({
  url: z.string(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  /** What the crop shows, for a screen reader ("Zifferblatt mit Zeigern"). */
  label: z.string(),
});
export type ItemImage = z.infer<typeof ItemImage>;

/**
 * A question as shown while it is open: never includes the answer.
 * Texts may contain math between dollar signs in the LaTeX subset of `contracts/notation.ts`
 * (`MATH_COMMANDS`; a blank "___" or \square inside math); a question using anything else is
 * dropped by the server (issue #239).
 * A dollar for money is written \$; a "$" before a digit never closes math.
 */
export const ItemView = z.object({
  id: Uuid,
  kind: ItemKind,
  prompt: z.string(),
  choices: z.array(z.string()).nullable(),
  unit: z.string().nullable(),
  topic: z.string().nullable(),
  origin: ItemOrigin,
  /** vocab: the answer's language; speak: the language to say it in (ISO 639-1). */
  lang: z.string().nullable(),
  /** vocab: the language of the prompt. */
  prompt_lang: z.string().nullable(),
  /**
   * The kind of the subject the question belongs to (`subjects.kind`), or null for a question
   * with no subject. The app chooses the insert keys of the answer field from it — a formula in
   * chemistry gets the index, charge and reaction-arrow keys (issue #239, apps/mobile/lib/math/keys.ts).
   */
  subject_kind: SubjectKind.nullable().default(null),
  figure: Figure.nullable(),
  /**
   * multiple_choice only: one drawn figure per option, in the order of `choices` ("Welcher
   * Graph passt zu f(x) = …?", issue #231). Either every option has one or the field is null —
   * a grid with one text card among pictures would not be one form. `choices` keeps its texts
   * (what the option is, for the tutor, a spoken answer and the solution); the app shows the
   * pictures instead of them. A parallel list, not a new shape for `choices`, so a build that
   * does not know the field still reads every question; one it cannot read is null (`.catch`).
   */
  choice_figures: z.array(Figure).nullable().default(null).catch(null),
  /**
   * The sheet's own figure for this question, where the question is shown full size
   * (sessions); null in the material list and when the sheet has none (issue #50).
   */
  image: ItemImage.nullable().default(null),
  /**
   * Words to TAP instead of typing, for vocabulary she is recognising (issue #147).
   * They are a way in, not a different question: tapping one sends it as the answer and
   * it is graded like anything she types, so the key stays the key and typing keeps
   * working. Null wherever tapping would defeat the exercise — writing the foreign word
   * — and wherever there is not enough of her own vocabulary to build honest choices.
   */
  tap_choices: z.array(z.string()).nullable().default(null),
  /**
   * The learning surface she WORKS with instead of only reading about it (issue #162):
   * a fraction bar she taps. Only for a question whose text, picture and key code computed
   * from one reviewed task (`BarTask`, `apps/api/src/modules/practice/bars.ts`) — the model
   * picks the task and its numbers, nothing else. Null everywhere else, and the surface
   * never carries the solution. Typing stays the way it always was: a tap writes the
   * fraction into the same answer field.
   */
  surface: AnswerSurface.nullable().default(null),
  /**
   * She answers by tapping a place IN the figure (issue #248): a number on the number line, a point
   * of the coordinate system, a column of the bar chart, the hands of a clock face. The places are
   * the figure's own grid (`tapAxes`, @learnbuddy/shared-math `tap.ts`), which the server checked
   * the key lies on; a tap writes that place as text, judged exactly by code. True only while the
   * question is open — closed, the figure is only read again.
   */
  tap: z.boolean().default(false),
  /**
   * A structured item's task as she works with it (issues #228–#230): for `order` the
   * elements, shuffled, with server-given ids that say nothing about the right place. Never
   * the key — that stays in `items.task` on the server. Set for every structured kind while
   * the question is open, null for every other question. A view type this build does not
   * know reads as null (`.catch`): the question then shows without its surface instead of the
   * whole session failing to load.
   *
   * A figure is what she READS, a surface what she TOUCHES to write one value, a task view
   * what she ARRANGES — and its answer has several parts (`AnswerRequest.parts`).
   */
  task_view: StructuredTaskView.nullable().default(null).catch(null),
  /**
   * The question is answered from HEARING a spoken text (issue #210, `contracts/listen.ts`):
   * the app plays it with `POST /practice/sessions/:id/listen` and may play it again as often
   * as she taps. Only which recording is said here, never its words — the text is where every
   * answer comes from, so it stays on the server until the question is closed
   * (`SessionItemView.listen_transcript`). Questions about one text share the `ref`.
   */
  listen: ListenRef.nullable().default(null),
  /**
   * The text this question is about (Leseverständnis, issue #233, `contracts/reading.ts`): its
   * lines as printed, shown above the question while she answers — unlike a listening text it is
   * what she answers FROM, not the answer. Questions about one text share the `ref`. A text this
   * build cannot read shows the question without it (`.catch`) rather than failing the session.
   */
  passage: PassageView.nullable().default(null).catch(null),
  /**
   * Whether the question may be read aloud by its "Vorlesen" button, also outside voice mode
   * (issue #238). Code decides it (`apps/api/src/modules/practice/readAloud.ts`): not for a task
   * that practises spelling, not for vocabulary whose prompt already holds the answer — hearing
   * it would hand the solution over. False where the server does not say: a question is never
   * read aloud by default.
   */
  read_aloud: z.boolean().default(false),
});
export type ItemView = z.infer<typeof ItemView>;

// ─────────────── the questions of one material ───────────────

/**
 * How the latest closed attempt at a question went (any session):
 * first_try · with_help (right after hints or retries) · not_known (revealed,
 * skipped or missed) · never_asked.
 */
export const ItemResult = z.enum(['first_try', 'with_help', 'not_known', 'never_asked']);
export type ItemResult = z.infer<typeof ItemResult>;

/** A question of a material as listed for the learner: never includes the solution. */
export const MaterialItemView = ItemView.extend({ result: ItemResult });
export type MaterialItemView = z.infer<typeof MaterialItemView>;

/** GET /materials/:id/items — the material and its questions (archived ones left out). */
export const MaterialItemsView = z.object({
  material: MaterialView,
  items: z.array(MaterialItemView),
});
export type MaterialItemsView = z.infer<typeof MaterialItemsView>;

/** PATCH /materials/:id — the learner renames a material. */
export const RenameMaterialRequest = z.object({
  title: z.string().trim().min(1).max(120),
});
export type RenameMaterialRequest = z.infer<typeof RenameMaterialRequest>;

/**
 * Her answer to one unclear spot (issue #164 point 1). Both aliases were issued by the server
 * and are resolved by it: nothing here is an id, a date or free text to be interpreted.
 * `reading: null` is "weiß ich nicht" — the ask closes and no question is written for it.
 */
export const ClarifyUnclearRequest = z.object({
  /** The spot's alias on this sheet ('u1'). */
  spot: z.string().regex(/^u[1-9][0-9]*$/),
  /** The reading she picked ('r2'), or null to let the ask go. */
  reading: z
    .string()
    .regex(/^r[1-9][0-9]*$/)
    .nullable(),
});
export type ClarifyUnclearRequest = z.infer<typeof ClarifyUnclearRequest>;

export const SessionItemView = z.object({
  item: ItemView,
  /** missed: answered wrong in a test (one try, closed). */
  status: z.enum(['open', 'correct', 'revealed', 'skipped', 'missed']),
  attempts: z.number().int(),
  hints_used: z.number().int(),
  /** Prepared hints still to give; never the hints themselves. */
  hints_left: z.number().int().min(0).default(0),
  /** "Tipp" works for this question now: a prepared hint at once, else the tutor writes one. */
  hint_available: z.boolean().default(false),
  /**
   * "Lösung zeigen" works now: only after a real try or a hint (never from the first second),
   * never in homework help and never while a test runs (a test has "Überspringen").
   */
  reveal_available: z.boolean().default(false),
  /** Homework help: set aside with "Später" (still open; it comes back after the others). */
  deferred: z.boolean().default(false),
  /**
   * Only once the item is closed — and after a finished test also for a question she never
   * got to (status still open: "nicht bearbeitet").
   *
   * A flashcard pass (`SessionView.card_pass`) is the one place where an OPEN item carries
   * it: there the answer is the back of the card, which the pass exists to show her
   * (issue #147).
   */
  answer: z.string().nullable(),
  /**
   * The words of a listening question's spoken text — only once the question is closed, under
   * exactly the condition `answer` carries the solution (issue #210: she hears it, answers,
   * and reads it afterwards). Null while it is open, null in homework help, null for every
   * question that is not a listening one.
   */
  listen_transcript: z.string().nullable().default(null),
});
export type SessionItemView = z.infer<typeof SessionItemView>;

/** What the model heard in a recording, word by word (speak questions). */
export const PronunciationFeedback = z.object({
  /** The words as they sounded, written down. */
  heard: z.string(),
  overall: z.enum(['good', 'almost', 'retry']),
  words: z.array(
    z.object({
      text: z.string(),
      ok: z.boolean(),
      /** How to say it better, in the learner's language; null when fine. */
      tip: z.string().nullable(),
    }),
  ),
});
export type PronunciationFeedback = z.infer<typeof PronunciationFeedback>;

/** How the learner wants it explained again (the chips "Einfacher bitte", "Mit Beispiel", "Warum ist das so?"). */
export const ReexplainWay = z.enum(['simpler', 'example', 'why']);
export type ReexplainWay = z.infer<typeof ReexplainWay>;

export const PracticeTurnView = z.object({
  id: Uuid,
  /** The question it is about; null only in stored turns of the removed explain mode (issue #70). */
  item_id: Uuid.nullable(),
  role: z.enum(['learner', 'tutor']),
  text: z.string(),
  verdict: z.enum(['correct', 'partially_correct', 'incorrect', 'not_an_attempt']).nullable(),
  pronunciation: PronunciationFeedback.nullable(),
  /**
   * The feedback on a version of her long text (issue #258): each key point of its text type and
   * up to three places to improve, quoted from her text. Only on the tutor turn after an essay;
   * absent or null everywhere else. A shape this build cannot read is null (`.catch`), never a
   * failed view. Its turns carry the verdict `not_an_attempt`: nothing was graded.
   */
  essay: EssayFeedback.nullable().optional().catch(null),
  /** Part of an "Anders erklären" exchange (her request and the new explanation), else null. */
  reexplain: ReexplainWay.nullable(),
  /**
   * „Merk ich mir für nachher" (issue #391). Only on the tutor turn after a question that had
   * nothing to do with the task (`POST …/ask`, the tutor's intent `off_topic`): `offered` — the
   * reply carries the chip; `kept` — she tapped it (`POST …/later`), and Buddy brings the
   * question up in the chat once the practice is over. Absent or null everywhere else.
   */
  later: z.enum(['offered', 'kept']).nullable().optional(),
  created_at: IsoDateTime,
});
export type PracticeTurnView = z.infer<typeof PracticeTurnView>;

export const PracticeSummary = z.object({
  /** Closed questions (solved, revealed, skipped, missed); never shown as a score. */
  answered: z.number().int(),
  first_try: z.number().int(),
  /** Topics where every closed question was right at once. Never also in shaky_topics. */
  secure_topics: z.array(z.string()),
  /** Topics with at least one question that needed help, was shown or missed. */
  shaky_topics: z.array(z.string()),
});
export type PracticeSummary = z.infer<typeof PracticeSummary>;

export const SessionMode = z.enum(['practice', 'test', 'help']);
export type SessionMode = z.infer<typeof SessionMode>;

/**
 * How long a practice test with a time limit runs, in minutes (issue #241). A fixed list, never
 * a free number: the model picks one of these when she asks for time, and the server refuses
 * anything else (CLAUDE.md rule 2 — the model never writes durations or instants of its own).
 */
export const TEST_MINUTES = [10, 20, 30, 45, 60, 90] as const;
export const TestMinutes = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(30),
  z.literal(45),
  z.literal(60),
  z.literal(90),
]);
export type TestMinutes = z.infer<typeof TestMinutes>;

/**
 * The clock of a practice test she asked to sit with a time limit (issue #241). The server keeps
 * the deadline; the app only counts down from what it is told here.
 */
export const TestTimer = z.object({
  minutes: TestMinutes,
  /**
   * Milliseconds left at the moment the server answered (0 once it is up). The app counts down
   * from the time it received the view — never from its own wall clock against a deadline, so a
   * phone whose clock is wrong still shows the right time left.
   */
  remaining_ms: z.number().int().min(0),
  /**
   * The test ended because the time was up (not handed in earlier, not answered to the end).
   * Then the result says how far she got; the questions still open are "nicht beantwortet",
   * never wrong.
   */
  ran_out: z.boolean(),
});
export type TestTimer = z.infer<typeof TestTimer>;

export const SessionView = z.object({
  id: Uuid,
  /** help: homework, hints only and the solution is never shown. */
  mode: SessionMode,
  /**
   * false in help mode (no "show solution", closed questions show no answer) and
   * while a test runs (answers only once it is finished).
   */
  reveal_allowed: z.boolean(),
  status: z.enum(['active', 'finished', 'abandoned']),
  title: z.string(),
  /**
   * A flashcard pass instead of a run of questions to answer (issue #147): the card turns
   * over and SHE says whether she knew it. Nothing here is checked — no answer to type, no
   * verdict, no tutor, no hints, no "Lösung zeigen" — so every item carries its answer (the
   * back of the card) while it is still open, and the one way on is `CardRequest`. The
   * `mode` stays what it was: a card pass IS practice, just a different pass over it.
   */
  card_pass: z.boolean().default(false),
  /**
   * A flashcard pass over the words of THIS finished run can be started from it
   * (`POST /practice/sessions/:id/cards`): it holds vocabulary that did not sit. The server
   * decides it, with the same rule that picks the cards — the app never re-derives it.
   */
  card_pass_offered: z.boolean().default(false),
  /**
   * A Kopfrechnen round (issue #243, `contracts/drill.ts`): tasks code wrote, a digit pad, one
   * try each, checked at once. Null for every other session. A build that does not know a
   * newer shape reads null rather than failing the whole session.
   */
  drill: DrillView.nullable().default(null).catch(null),
  /**
   * More questions for this run are still being written (issue #220): a practice run starts
   * with its first few questions and grows while she works, so for a few seconds `items` is
   * shorter than the run will be.
   *
   * Two things follow, and both are the server's word, not the app's guess:
   * - the run cannot end while this is true — "no open question" does not mean "over", and
   *   `POST /practice/sessions/:id/finish` pauses instead of finishing;
   * - no question COUNT may be shown. "Frage 1 von 3" that becomes "Frage 1 von 9" is the
   *   display that costs trust, so the app shows the position without a total until this is
   *   false (the issue's trap 2).
   *
   * It goes false on its own even if the rest never arrives: the server holds a deadline, so a
   * run can never be left unfinishable.
   */
  preparing: z.boolean().default(false),
  /** A test with a time limit she asked for (issue #241); null for every other run. */
  timer: TestTimer.nullable().default(null),
  items: z.array(SessionItemView),
  turns: z.array(PracticeTurnView),
  current_item_id: Uuid.nullable(),
  summary: PracticeSummary.nullable(),
});
export type SessionView = z.infer<typeof SessionView>;

/**
 * What the learner asked a run started from her own material to BE — not what the session will
 * be stored as. `practice` and `test` are also the session's `mode`; `speak` is a practice run
 * (`SessionMode` 'practice', it feeds the same spaced repetition) whose questions are the
 * sentences on that sheet to read aloud — issue #223 point 2, and the same split
 * `StartTopicRequest.kind` already makes for what Buddy prepares.
 *
 * Why `speak` has to be asked for instead of coming along in an ordinary practice: a spoken
 * item inside a written run would put the microphone in front of her in the middle of typing,
 * and `practice/selection.ts` has excluded it for that reason since it was written. That
 * exclusion stays; this is the door it was missing.
 *
 * A speaking run is a run through ONE sheet, so `material_id` is required for it: the label
 * that offers it names the sheet, and everything it holds must come from that sheet.
 */
export const StartPracticeRequest = z
  .object({
    subject_id: Uuid.nullable().optional(),
    material_id: Uuid.nullable().optional(),
    goal_id: Uuid.nullable().optional(),
    mode: z.enum(['practice', 'test', 'speak']).default('practice'),
  })
  .refine((v) => v.mode !== 'speak' || (v.material_id ?? null) !== null, {
    message: 'speak needs material_id',
  });
export type StartPracticeRequest = z.infer<typeof StartPracticeRequest>;

export const AnswerRequest = z
  .object({
    client_turn_id: Uuid,
    item_id: Uuid,
    /**
     * Up to `ESSAY_TEXT_MAX` characters for a long text (`essay`, issue #258); every other
     * question takes at most `ANSWER_TEXT_MAX` — the server knows the kind and answers 422.
     */
    text: z.string().trim().min(1).max(ESSAY_TEXT_MAX).nullable().optional(),
    choice: z.number().int().min(0).max(5).nullable().optional(),
    /**
     * How she gave it (issue #163). A word she TAPPED from four of her own is recognition;
     * the same word typed is production, and a class test asks for the second. Since #147
     * a tap travels as ordinary text so that grading stays one path — so the answer itself
     * no longer shows the difference, and the app has to say. Absent means typed.
     */
    via: z.enum(['typed', 'tapped', 'spoken']).optional(),
    /**
     * The answer to a structured item (issues #228–#230): the parts she arranged, by the ids
     * of `ItemView.task_view`. Its `type` must be the item's kind. A structured item takes
     * only this; every other item takes text or a choice (`modules/practice/structured.ts`).
     */
    parts: StructuredAnswer.nullable().optional(),
  })
  .refine(
    (v) => (v.text ?? null) !== null || (v.choice ?? null) !== null || (v.parts ?? null) !== null,
    { message: 'text, choice or parts is required' },
  );
export type AnswerRequest = z.infer<typeof AnswerRequest>;

/** "Tipp": the next prepared hint for an open question — at once, no model. */
export const HintRequest = z.object({ client_turn_id: Uuid, item_id: Uuid });
export type HintRequest = z.infer<typeof HintRequest>;

/** How long a question to the tutor may be: a sentence or three, typed or spoken. */
export const ASK_TEXT_MAX = 600;

/**
 * POST /practice/sessions/:id/ask — a free question to the tutor about the question in front of
 * her (issue #391, report „Hilfe und Fragen beim Üben" §1). The route itself says „this is a
 * question", so it is never graded and never costs a try, on every form — a tap form and a
 * structured one included. Answered like „Tipp" (AnswerResponse, verdict `not_an_attempt`) and
 * idempotent per `client_turn_id`. In a practice test the reply is always the test's fixed line
 * (or the fixed help answer to distress: the one tutor call there is that check); a Kopfrechnen
 * round has no question route (409 `use_drill`).
 */
export const AskRequest = z.object({
  client_turn_id: Uuid,
  item_id: Uuid,
  text: z.string().trim().min(1).max(ASK_TEXT_MAX),
});
export type AskRequest = z.infer<typeof AskRequest>;

/**
 * POST /practice/sessions/:id/later — „Merk ich mir für nachher" (issue #391): the tap on the
 * chip of a tutor turn that offered it (`PracticeTurnView.later` = `offered`). Her question is
 * kept as a note on the session; nothing else goes into the chat. Tapping again changes nothing.
 */
export const KeepForLaterRequest = z.object({ turn_id: Uuid });
export type KeepForLaterRequest = z.infer<typeof KeepForLaterRequest>;

/**
 * POST /practice/sessions/:id/cards — go through the words of a finished run as flashcards
 * (issue #147, Stufe 2). The server picks them: the vocabulary of that run which did not
 * sit. Idempotent per `client_request_id`, so a lost answer never starts a second pass.
 */
export const StartCardPassRequest = z.object({ client_request_id: Uuid });
export type StartCardPassRequest = z.infer<typeof StartCardPassRequest>;

/**
 * What she says about a card once it has turned over. It is a SELF-ASSESSMENT, not a checked
 * answer, and the two are deliberately not worth the same: `not_yet` is believed in full
 * (nobody claims to have failed when they did not, and believing it only means more
 * practice), while `knew_it` schedules more carefully than a measured right answer would —
 * see `apps/api/src/modules/practice/fsrs.ts`.
 */
export const CardRecall = z.enum(['knew_it', 'not_yet']);
export type CardRecall = z.infer<typeof CardRecall>;

/**
 * POST /practice/sessions/:id/card — one card of a flashcard pass, recorded. Idempotent per
 * `client_turn_id` like an answer: tapping twice, or a retry after a lost reply, records one.
 */
export const CardRequest = z.object({
  client_turn_id: Uuid,
  item_id: Uuid,
  recall: CardRecall,
});
export type CardRequest = z.infer<typeof CardRequest>;

/**
 * "Anders erklären": a new explanation, written by the model, after a closed question's
 * solution. Answered like an answer (AnswerResponse, verdict not_an_attempt): her request and
 * the explanation become turns. Never in a running test; in homework help only for a task she
 * solved herself.
 */
export const ReexplainRequest = z.object({
  client_turn_id: Uuid,
  item_id: Uuid,
  way: ReexplainWay,
});
export type ReexplainRequest = z.infer<typeof ReexplainRequest>;

export const AnswerVerdict = z.enum([
  'correct',
  'partially_correct',
  'incorrect',
  'not_an_attempt',
]);
export type AnswerVerdict = z.infer<typeof AnswerVerdict>;

/**
 * What the learner asked for beyond the topic (issue #113). The model sets them, the server
 * decides what they mean — for her own questions in the selection, for new ones in the
 * generator.
 *
 * Difficulty is relative, never a level she has to name: "easier" and "harder" mean easier
 * or harder than the middle of what she already has for this (`items.difficulty`).
 */
export const DifficultyWish = z.enum(['easier', 'harder']);
export type DifficultyWish = z.infer<typeof DifficultyWish>;

/**
 * Which way round a vocabulary pair is asked: `recognise` shows the foreign word and asks
 * what it means; `produce` shows it in her own language and asks for the foreign word — the
 * direction a class test asks for. Both directions are always stored; this says which one
 * she practises now.
 */
export const VocabDirection = z.enum(['recognise', 'produce']);
export type VocabDirection = z.infer<typeof VocabDirection>;

/** Start from something the learner named instead of a photo. */
export const StartTopicRequest = z.object({
  client_request_id: Uuid,
  /**
   * practice: questions on a topic · vocab: a typed vocabulary list ·
   * speak: sentences/words to say aloud · listen: a spoken text with questions about it
   * (Hörverstehen, issue #210 — refused before any model call when there is no voice to
   * read it) · help: a homework task the learner typed ·
   * test: a practice test on a topic (one try per question, no hints, results at the
   * end) · spelling_dictation: a Diktat — words or sentences read aloud that she types
   * (issue #242; refused before any model call when there is no voice, like listen) ·
   * teach_back: „Erklär mal" (issue #236) — open questions she answers by explaining, by voice or
   * in writing, checked against 3–6 key points. read: Leseverständnis without a photo (#368) —
   * Buddy writes a reading text at her level and questions about it, held to the rules of a
   * photographed text (`practice/readText.ts`). Buddy explaining something stays the chat's
   * answer, never a mode (owner decision 28.09., issue #70); here SHE explains.
   */
  kind: z.enum([
    'practice',
    'vocab',
    'speak',
    'listen',
    'help',
    'test',
    'spelling_dictation',
    'teach_back',
    'read',
  ]),
  text: z.string().trim().min(2).max(3000),
  /**
   * spelling_dictation: the photographed sheet the words come from (a Lernwörter list,
   * issue #242). The words are then taken from that sheet's text and every one must stand in it
   * (`practice/dictation.ts`). teach_back: the sheet the questions are asked about (issue #236);
   * an exact term of a key point must stand in it. Any other kind ignores it. Another learner's
   * sheet is a 404.
   */
  material_id: Uuid.nullable().optional(),
  subject: z.string().trim().max(60).nullable().optional(),
  /**
   * practice / test for a planned test (Buddy's offer names it): the questions stay within the
   * topics of the sheets photographed for it, and the session belongs to it.
   */
  goal_id: Uuid.nullable().optional(),
  /**
   * More of the same after a practice ("Die wackligen nochmal", "Mehr davon, etwas
   * schwerer"): the session it follows. The new questions stay in that session's world —
   * its test and sheets when it had one, else the questions she just did as the pattern —
   * instead of whatever the topic name suggests (issue #58).
   */
  from_session_id: Uuid.nullable().optional(),
  /** Easier or harder than her grade would give her by itself (issue #113). */
  difficulty: DifficultyWish.nullable().optional(),
  /**
   * vocab: which direction of each pair this session asks (issue #113). Both are stored
   * either way, so the other one can be practised later; null asks both, as before.
   */
  direction: VocabDirection.nullable().optional(),
  /**
   * test only: a time limit she asked for in the chat (issue #241), carried by Buddy's offer.
   * One of `TEST_MINUTES` — anything else is refused here; on any other kind the server refuses
   * it before a model is asked (`practice/generate.ts`).
   */
  minutes: TestMinutes.nullable().optional(),
});
export type StartTopicRequest = z.infer<typeof StartTopicRequest>;

/** A recording for a speak question (≤ 30 s; m4a/aac, webm or wav, base64). */
export const SpeakRequest = z.object({
  client_turn_id: Uuid,
  item_id: Uuid,
  mime: z.enum(['audio/mp4', 'audio/aac', 'audio/m4a', 'audio/webm', 'audio/wav', 'audio/mpeg']),
  audio_base64: z.string().min(100).max(1_400_000),
});
export type SpeakRequest = z.infer<typeof SpeakRequest>;

/**
 * One word of the sentence, said on its own (issue #83): she taps a word she got wrong and
 * practises just that. Nothing is stored and nothing counts — it is practice, not an attempt;
 * the question keeps its state until she says the whole sentence again.
 */
export const SpeakWordRequest = z.object({
  item_id: Uuid,
  /** The word as it stands in the sentence. */
  word: z.string().trim().min(1).max(40),
  mime: z.enum(['audio/mp4', 'audio/aac', 'audio/m4a', 'audio/webm', 'audio/wav', 'audio/mpeg']),
  audio_base64: z.string().min(100).max(1_400_000),
});
export type SpeakWordRequest = z.infer<typeof SpeakWordRequest>;

export const SpeakWordResponse = z.object({
  /** false when nothing understandable was heard — then `ok` says nothing. */
  audible: z.boolean(),
  ok: z.boolean(),
  /** What was heard, written down; '' when nothing was. */
  heard: z.string(),
  /** One short tip in her app language, when it was not right yet. */
  tip: z.string().nullable(),
});
export type SpeakWordResponse = z.infer<typeof SpeakWordResponse>;

/**
 * POST /practice/sessions/:id/speak with `Accept: text/event-stream`
 * (docs/architecture.md §Speed): `progress` events while the model is still
 * listening, then one `done` event carrying the AnswerResponse (or `error` with
 * { code }). Progress is what the model has written so far — the judgement counts
 * only once it is validated and stored, which is what `done` carries.
 */
export const SpeakStreamEvent = z.object({
  /** What she said, as far as it is written down; '' before it starts. */
  heard: z.string(),
  /** Words judged so far, in the order of the target text. Only finished ones. */
  words: z.array(z.object({ text: z.string(), ok: z.boolean() })),
});
export type SpeakStreamEvent = z.infer<typeof SpeakStreamEvent>;

/**
 * Speech to text: a spoken chat message or answer. A dictation has no time limit
 * (issue #19): the app cuts a long recording into pieces at pauses and sends them
 * one after another, each as its own request. No recording is stored.
 */
export const TranscribeRequest = z.object({
  mime: z.enum(['audio/mp4', 'audio/aac', 'audio/m4a', 'audio/webm', 'audio/wav', 'audio/mpeg']),
  /** One piece. The bound is transport, not a time limit: the app cuts well below it. */
  audio_base64: z.string().min(100).max(2_000_000),
  /** message: talking to Buddy · answer: answering a question (numbers and math written as such). */
  purpose: z.enum(['message', 'answer']),
  /** The language she is expected to speak (e.g. 'fr' for a French answer); null = the app language. */
  lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable()
    .optional(),
  /** answer: the question being answered, so short answers ("drei Viertel") are heard in context. */
  context: z.string().max(600).nullable().optional(),
  /**
   * The tail of what the same dictation's earlier pieces already said, so a piece
   * that starts mid-sentence is heard as its continuation. Context only: the model
   * never repeats it. Absent on the first (or only) piece.
   */
  prev_tail: z.string().max(400).nullable().optional(),
});
export type TranscribeRequest = z.infer<typeof TranscribeRequest>;

export const TranscribeResponse = z.object({
  /** What was said, written down; empty when nothing understandable was heard. */
  text: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponse>;

/**
 * POST /voice/transcribe with `Accept: text/event-stream` (issue #9): `progress`
 * events while the model is still writing down what it heard, then one `done` event
 * with the TranscribeResponse (or `error` with { code }). Progress is only for showing
 * the words as they arrive; what is sent off is what `done` carries.
 */
export const TranscribeStreamEvent = z.object({
  /** What was said, as far as it is written down; '' before the first words. */
  text: z.string(),
});
export type TranscribeStreamEvent = z.infer<typeof TranscribeStreamEvent>;

// ─────────────── Buddy's voice (text to speech, ADR 0008) ───────────────

/**
 * The small curated set of Buddy's voices (ADR 0008): she picks one in the setup or the
 * settings (tap to hear it), or asks Buddy ("andere Stimme"). The server maps each to a
 * provider voice; the app shows only friendly names, never the provider's.
 */
export const VOICE_NAMES = ['warm', 'friendly', 'bright', 'clear', 'soft', 'deep'] as const;
/**
 * How the voice sits, for the picker's two groups (issue #67): six names are a guessing
 * game in one row. Higher = Chirp 3 HD Sulafat, Zephyr, Aoede; lower = Achird, Iapetus,
 * Charon (`apps/api/src/speech/google.ts`). Said as pitch, not as a person: a synthetic
 * voice has no gender to claim.
 */
export const VOICE_PITCH: Record<(typeof VOICE_NAMES)[number], 'higher' | 'lower'> = {
  warm: 'higher',
  bright: 'higher',
  soft: 'higher',
  friendly: 'lower',
  clear: 'lower',
  deep: 'lower',
};
export const VoiceName = z.enum(VOICE_NAMES);
export type VoiceName = z.infer<typeof VoiceName>;

/** Speaking speed in steps: -2 much slower … 0 normal … +2 much faster. */
export const VOICE_SPEED_MIN = -2;
export const VOICE_SPEED_MAX = 2;
export const VoiceSpeed = z.number().int().min(VOICE_SPEED_MIN).max(VOICE_SPEED_MAX);

/**
 * One sentence (or a short word) to be read aloud in Buddy's natural voice. The app sends
 * only the text as it is spoken (math already in words, lib/speech/spoken.ts) — nothing else
 * about her. Voice and speed come from her settings on the server (a preview may name a voice).
 */
export const SpeechRequest = z.object({
  text: z.string().trim().min(1).max(600),
  /** BCP 47 locale the text is read in ("de-DE", "fr-FR"). */
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),
  /** "Langsam": the slower speed for listening closely (vocabulary). */
  slow: z.boolean().optional(),
  /**
   * Read in this voice instead of hers — only the voice picker's "tap to hear" preview. Her
   * settings stay as they are; choosing a voice is PATCH /buddy/settings.
   */
  voice: VoiceName.optional(),
});
export type SpeechRequest = z.infer<typeof SpeechRequest>;

export const SpeechResponse = z.object({
  mime: z.enum(['audio/mpeg', 'audio/wav']),
  audio_base64: z.string().min(1),
  voice: VoiceName,
  speed: VoiceSpeed,
});
export type SpeechResponse = z.infer<typeof SpeechResponse>;

export const AnswerResponse = z.object({
  session: SessionView,
  /** How the learner's answer was judged; null = could not be judged (no model), nothing was graded. */
  verdict: AnswerVerdict.nullable(),
  /** The tutor turn created for this answer. */
  reply: PracticeTurnView,
  /**
   * A written division not right yet (issue #420): the step of its staircase that the reply names,
   * 1 the first — the app opens it and puts her in its first cell. Only where the reply names a
   * place (never in a test, never with the solution shown); absent or null everywhere else.
   */
  column_step: z.number().int().min(1).nullable().optional(),
});
export type AnswerResponse = z.infer<typeof AnswerResponse>;

/** The tutor turn whose chip she tapped, now `later: 'kept'`. */
export const KeepForLaterResponse = z.object({ turn: PracticeTurnView });
export type KeepForLaterResponse = z.infer<typeof KeepForLaterResponse>;
