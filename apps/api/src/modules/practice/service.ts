// Practice sessions: the useful result Buddy prepares. docs/architecture.md §Practice.
//
// A session is a fixed set of questions (chosen up front, so resuming shows
// the same ones). Each answer is checked by rules where exactness is
// decidable, otherwise by the tutor model with structured output; closing a
// question feeds FSRS once. Finishing a session records evidence on Buddy's
// step (done only if something was actually answered) and wakes Buddy to
// plan what comes next.

import type {
  AnswerRequest,
  CurriculumRegion,
  Figure,
  ItemView,
  SessionMode,
  AnswerResponse,
  HintRequest,
  PracticeTurnView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { StorageGateway } from '../../storage/gateway.js';
import { isUniqueViolation, type Db } from '../../lib/db.js';
import { AppError, isAppError } from '../../lib/errors.js';
import { localParts } from '../../lib/time.js';
import { t, type MessageKey } from '../../i18n/index.js';
import { callModel } from '../../llm/call.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { ageOn } from '../identity/model.js';
import { cautiousAt, curriculumLine, pointOf } from '../curriculum/state.js';
import { emitEvent } from '../buddy/events.js';
import { bumpContext } from '../buddy/plan.js';
import { pickAnswers, surfaceOf, taskOf, untriedPicks } from './bars.js';
import { listenRefs, listenTaskOf } from './listen.js';
import {
  differentNumber,
  equationDetail,
  NEAR_MISS,
  noSingleSolution,
  plainMath,
  ruleCheck,
  type RuleVerdict,
  type TypoShape,
  typoShapeFor,
} from './evaluate.js';
import {
  boardOf,
  checkParts,
  hasSeveralParts,
  partsTaskOf,
  readParts,
  writtenParts,
  type PartsCheck,
  type PartsPlace,
} from './parts.js';
import {
  checkStaffLine,
  staffAgain,
  staffLineReply,
  staffSurfaceOf,
  staffTaskOf,
  writtenStaffLine,
  type StaffCheck,
} from './staff.js';
import { checkPath } from './steps.js';
import { reviewItem, type ItemOutcome } from './fsrs.js';
import { summarize } from './summary.js';
import { questionCountFor, selectPracticeItems, type PracticeRun } from './selection.js';
import { tapChoicesFor } from './tapChoices.js';
import { CARD_PASS, offersCardPass } from './cards.js';
import { MAX_ACCEPTED, storedFigure } from './items.js';
import {
  askedElements,
  checkRubric,
  rubricOf,
  rubricReply,
  rubricVerdict,
  type RubricClaim,
} from './rubric.js';
import {
  RubricDecision,
  TUTOR_PROMPT_VERSION,
  TUTOR_SYSTEM,
  TutorDecision,
  enforceTutorInvariants,
  givesAwayHomework,
  homeworkSolved,
  mentionsSolution,
  tutorContext,
  type TutorDecision as TutorDecisionT,
} from './tutor.js';
import type { LlmMessage } from '../../llm/gateway.js';

const TUTOR_SCHEMA = toJsonSchema(TutorDecision);
/**
 * Dasselbe Schema, erweitert um die Pflichtelemente einer Schreibaufgabe (issue #211). Es steht
 * neben dem gewöhnlichen, statt es zu ersetzen: eine Frage ohne Rubrik soll das Feld nicht
 * sehen und nicht mit Ausgabe-Tokens bezahlen. Der AUFRUF ist derselbe eine, in beiden Fällen.
 */
const RUBRIC_SCHEMA = toJsonSchema(RubricDecision);
const MATERIAL_CHARS = 4000;

export type PracticeLearner = {
  id: string;
  display_name: string;
  locale: string;
  level: string;
  grade: number | null;
  birth_date: string;
  /**
   * The Bundesland of her school (migration 0068, issue #199) — what decides which curriculum
   * rules apply when a question is written and when an answer is judged (issue #214,
   * `modules/curriculum/`). Null and `other` mean no state rule is applied.
   */
  curriculum_region: CurriculumRegion | null;
};

export type ItemRow = {
  id: string;
  kind:
    | 'short'
    | 'long'
    | 'numeric'
    | 'multiple_choice'
    | 'formula'
    | 'vocab'
    | 'speak'
    | 'order'
    | 'match'
    | 'table_fill';
  prompt: string;
  answer: string;
  accepted_answers: string[];
  unit: string | null;
  choices: string[] | null;
  correct_choice: number | null;
  topic: string | null;
  material_id: string | null;
  origin: 'material' | 'buddy' | 'typed' | 'homework';
  lang: string | null;
  prompt_lang: string | null;
  figure: Figure | null;
  hints: string[];
  worked_solution: string | null;
  tolerance: number | null;
  spelling: 'strict' | 'gentle' | null;
  /**
   * One of the twelve state-dependent curriculum places (migration 0074, issue #214), or null
   * for a question at none of them. A plain string, not the enum: the column carries no CHECK,
   * and `pointOf` reads a key the table no longer knows as "no place".
   */
  curriculum_point: string | null;
  /**
   * The reviewed fraction-bar task this question's text, picture and key were COMPUTED
   * from (issue #162), or null for every question the model wrote itself. Read as a task
   * through `taskOf`, never trusted as it stands.
   */
  bar_task: unknown;
  /**
   * The reviewed task of an answer with SEVERAL PARTS (issues #228–#230) — the elements in their
   * right order, the pairs, the groups, the table with its gaps — or null for every other kind
   * (migration 0072 makes that an either/or). Read as a task through `partsTaskOf`.
   */
  parts_task: unknown;
  /**
   * The required elements of this writing task (issue #211), or null for every other question.
   * Read as a rubric through `rubricOf`, never trusted as it stands.
   */
  rubric: unknown;
  /**
   * The spoken text this question is answered from (issue #210), or null for every question
   * that is read. Read as a text through `listenTaskOf`, never trusted as it stands; it never
   * reaches the app while the question is open — it is where the answer comes from.
   */
  listen_task: unknown;
  /**
   * The reviewed note-line task this question's text, drawing, options and key were COMPUTED
   * from (issue #226), or null for everything else. Never set together with `bar_task` — a
   * question has at most one computed source (migration 0078). Read through `staffTaskOf`.
   */
  staff_task: unknown;
};

export type SessionRow = {
  id: string;
  learner_id: string;
  step_id: string | null;
  goal_id: string | null;
  mode: SessionMode;
  status: 'active' | 'finished' | 'abandoned';
  title: string | null;
  /**
   * Which kind of pass this run is (migration 0069): null means its questions are answered
   * and checked; 'cards' means the card turns over and she says herself whether she knew it
   * (issue #147, `cards.ts`). Deliberately not a fourth `mode` — a card pass IS practice, and
   * `mode` is read far outside this module, down to `NowCard.mode` in the app's contracts.
   */
  pass: 'cards' | null;
  /**
   * Set while the rest of this run's questions is still being written (migration 0073,
   * issue #220); null for every run that was written in one go. Never compared in SQL — see
   * `stillPreparing`.
   */
  items_pending_until: Date | null;
};

/**
 * The session columns as code reads them. Sessions of the removed explain mode (issue #70)
 * are served as plain practice — their stored `mode` and `intro` stay in the database
 * untouched (migrations are immutable), but nothing shows or writes them any more.
 */
export const SESSION_COLS = `id, learner_id, step_id, goal_id,
       case when mode = 'explain' then 'practice' else mode end as mode, status, title, pass,
       items_pending_until`;

/**
 * Is this run still waiting for the rest of its questions (issue #220)? The one place that
 * decides it, because two different answers would mean a run that cannot be finished in one
 * code path and is finished behind its own back in the other.
 *
 * The deadline is compared against the app clock, never against SQL `now()` (CLAUDE.md rule 7):
 * past it the run is complete with the questions it has, so a refill that never arrived costs
 * her the extra questions and never her result.
 */
export function stillPreparing(s: Pick<SessionRow, 'items_pending_until'>, now: Date): boolean {
  return s.items_pending_until !== null && s.items_pending_until.getTime() > now.getTime();
}

type SessionItemRow = {
  item_id: string;
  position: number;
  status: 'open' | 'correct' | 'revealed' | 'skipped' | 'missed';
  attempts: number;
  hints_used: number;
  /** Prepared hints shown so far (migration 0043): the next "Tipp" is items.hints[this]. */
  prepared_hints_used: number;
  first_try_correct: boolean | null;
  /** "Frage passt nicht": taken out by the learner (closed as skipped, archived). */
  flagged_at?: Date | null;
  /** Homework help "Später": still open, behind the other open tasks (migration 0024). */
  deferred_at?: Date | null;
  /**
   * How the closing answer was given (issue #163): typed, tapped, spoken — or `self_rated`,
   * a flashcard she judged herself with nothing checking it (issue #147, `cards.ts`).
   */
  answered_by?: 'typed' | 'tapped' | 'spoken' | 'self_rated' | null;
  /** "Die Bewertung stimmt nicht" (issue #164): the judgement was taken back. */
  disputed_at?: Date | null;
};

// ─────────────── start ───────────────

export type SessionOptions = {
  stepId: string | null;
  goalId: string | null;
  mode: SessionMode;
  /** 'cards' for a flashcard pass (issue #147); absent for an ordinary run of questions. */
  pass?: 'cards' | null;
  materialId?: string | null;
  title?: string | null;
  clientRequestId?: string | null;
  /**
   * Until when the rest of the questions is still coming (issue #220). Only the split practice
   * start sets it; every other run is complete when it is created.
   */
  itemsPendingUntil?: Date | null;
};

export async function createSession(
  db: Db,
  learnerId: string,
  itemIds: string[],
  opts: SessionOptions,
  now: Date,
): Promise<string> {
  const s = await db.one<{ id: string }>(
    `insert into practice_sessions (learner_id, step_id, goal_id, mode, started_at, last_activity_at,
                                    material_id, title, client_request_id, pass, items_pending_until)
     values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10) returning id`,
    [
      learnerId,
      opts.stepId,
      opts.goalId,
      opts.mode,
      now,
      opts.materialId ?? null,
      opts.title ?? null,
      opts.clientRequestId ?? null,
      opts.pass ?? null,
      opts.itemsPendingUntil ?? null,
    ],
  );
  for (const [position, itemId] of itemIds.entries()) {
    await db.query(
      `insert into session_items (session_id, item_id, position) values ($1, $2, $3)`,
      [s.id, itemId, position],
    );
  }
  return s.id;
}

/**
 * The questions that were still being written when the run started (issue #220), appended
 * behind the ones already there, and the wait closed in the same transaction.
 *
 * Positions continue from the highest one in the run, so the order she sees is the order the
 * generator wrote in — the first batch first, the rest behind it. Nothing here decides which
 * questions these are: the caller has already dropped everything that repeats what the run
 * holds (`samePrompt`, the same rule a continued reading of a sheet uses, issue #150).
 *
 * The wait is closed whether or not anything arrived. A refill that came back empty leaves the
 * run exactly as it was, and `preparing` goes false at once instead of making her wait out the
 * deadline for questions that will never come.
 */
export async function addPreparedItems(
  db: Db,
  learnerId: string,
  sessionId: string,
  itemIds: readonly string[],
  now: Date,
): Promise<number> {
  const s = await db.maybeOne<SessionRow>(
    `select ${SESSION_COLS} from practice_sessions
      where id = $1 and learner_id = $2 for update`,
    [sessionId, learnerId],
  );
  // The run was deleted, or it is over already (the deadline passed and she finished it): the
  // questions stay in her library, but they do not join a run that has its result.
  if (!s || s.status !== 'active' || s.items_pending_until === null) return 0;
  const next = await db.one<{ n: number }>(
    `select coalesce(max(position) + 1, 0)::int as n from session_items where session_id = $1`,
    [sessionId],
  );
  for (const [i, itemId] of itemIds.entries()) {
    await db.query(
      `insert into session_items (session_id, item_id, position) values ($1, $2, $3)`,
      [sessionId, itemId, next.n + i],
    );
  }
  await db.query(
    `update practice_sessions set items_pending_until = null, last_activity_at = $2 where id = $1`,
    [sessionId, now],
  );
  return itemIds.length;
}

/**
 * The run is not waiting for questions any more, although none arrived (issue #220): the refill
 * was refused, came back unusable or the model was gone. The run keeps the questions it has and
 * stops saying "more is coming" — the honest version of a promise that cannot be kept (rule 5).
 */
export async function givenUpOnPreparing(
  db: Db,
  learnerId: string,
  sessionId: string,
): Promise<void> {
  await db.query(
    `update practice_sessions set items_pending_until = null
      where id = $1 and learner_id = $2 and items_pending_until is not null`,
    [sessionId, learnerId],
  );
}

/** Start (or resume) the practice Buddy prepared. Idempotent per step. */
export async function startFromStep(
  deps: Deps,
  learnerId: string,
  stepId: string,
): Promise<string> {
  const now = deps.now();
  return deps.db.tx(async (tx) => {
    const step = await tx.maybeOne<{
      id: string;
      kind: string;
      state: string;
      goal_id: string | null;
      payload: { item_ids?: string[]; subject_id?: string | null; focus_topics?: string[] };
    }>(`select * from buddy_steps where id = $1 and learner_id = $2 for update`, [
      stepId,
      learnerId,
    ]);
    if (!step || step.kind !== 'practice')
      throw new AppError('not_found', 'Practice step not found');
    const running = await tx.maybeOne<{ id: string }>(
      `select id from practice_sessions where step_id = $1 and status = 'active'`,
      [stepId],
    );
    if (running) return running.id;
    if (!['planned', 'prepared', 'in_progress'].includes(step.state)) {
      throw new AppError('conflict', 'This practice is no longer open', { state: step.state });
    }
    // The prepared set may be stale (questions deleted since): keep what exists.
    let itemIds = step.payload.item_ids ?? [];
    if (itemIds.length > 0) {
      const alive = await tx.query<{ id: string }>(
        `select id from items where id = any($1::uuid[]) and learner_id = $2 and archived_at is null`,
        [itemIds, learnerId],
      );
      const aliveSet = new Set(alive.map((a) => a.id));
      itemIds = itemIds.filter((id) => aliveSet.has(id));
    }
    if (itemIds.length === 0) {
      itemIds = await selectPracticeItems(
        tx,
        learnerId,
        { goalId: step.goal_id, subjectId: step.payload.subject_id ?? null },
        step.payload.focus_topics ?? [],
        questionCountFor(10),
        now,
      );
    }
    if (itemIds.length === 0)
      throw new AppError('not_found', 'No questions available yet', { reason: 'no_questions' });
    const id = await createSession(
      tx,
      learnerId,
      itemIds,
      { stepId, goalId: step.goal_id, mode: 'practice' },
      now,
    );
    await tx.query(
      `update buddy_steps set state = 'in_progress', version = version + 1 where id = $1`,
      [stepId],
    );
    await bumpContext(tx, learnerId);
    return id;
  });
}

/**
 * Practice started by the learner from their material (library).
 *
 * `run` is what she asked for, not what the session is stored as (`StartPracticeRequest.mode`).
 * 'speak' is the way into the sentences on her own sheet, read aloud (issue #223 point 2): the
 * session is an ordinary practice — same spaced repetition, same screen, the existing recording
 * and pronunciation judgement (`practice/speak.ts`) untouched — and the only thing that differs
 * is which questions are in it. It takes the whole sheet, not a sample of it: the offer names
 * the sheet, and a number invented here would be the silent cut of issue #49 again (#145).
 */
export async function startManual(
  deps: Deps,
  learnerId: string,
  scope: { subjectId: string | null; materialId: string | null; goalId: string | null },
  run: PracticeRun,
): Promise<string> {
  const now = deps.now();
  // A speaking run is a run through ONE sheet (the contract refuses it without one); the
  // session it writes is practice, like a flashcard pass is practice (migration 0069).
  const mode: SessionMode = run === 'speak' ? 'practice' : run;
  // Everything in the scope must be the learner's own.
  const owned = await deps.db.one<{ goal: boolean; subject: boolean; material: boolean }>(
    `select ($2::uuid is null or exists (select 1 from buddy_goals where id = $2 and learner_id = $1)) as goal,
            ($3::uuid is null or exists (select 1 from subjects where id = $3 and learner_id = $1)) as subject,
            ($4::uuid is null or exists (select 1 from materials where id = $4 and learner_id = $1)) as material`,
    [learnerId, scope.goalId, scope.subjectId, scope.materialId],
  );
  if (!owned.goal || !owned.subject || !owned.material)
    throw new AppError('not_found', 'Not found');
  if (scope.materialId) {
    // A homework sheet is helped with, not drilled: it leads to its help session (audit H-7),
    // whichever run was asked for — every way back to that sheet ends there, never at
    // "no questions" (its tasks are `origin = 'homework'`, which no run below selects).
    const help = await helpSessionFor(deps, learnerId, scope.materialId);
    if (help) return help;
  }
  const itemIds = await selectPracticeItems(
    deps.db,
    learnerId,
    scope,
    [],
    run === 'speak' ? 'all' : questionCountFor(12),
    now,
    {},
    run,
  );
  if (itemIds.length === 0)
    throw new AppError('not_found', 'No questions available yet', { reason: 'no_questions' });
  // Practising one sheet: the sheet's name is the session's name — the screen said nothing
  // above the first question before (found by evals/content, issue #77).
  const sheet = scope.materialId
    ? await deps.db.maybeOne<{ title: string | null }>(
        `select title from materials where id = $1 and learner_id = $2`,
        [scope.materialId, learnerId],
      )
    : null;
  return deps.db.tx(async (tx) => {
    const id = await createSession(
      tx,
      learnerId,
      itemIds,
      {
        stepId: null,
        goalId: scope.goalId,
        mode,
        ...(scope.materialId ? { materialId: scope.materialId } : {}),
        ...(sheet?.title ? { title: sheet.title } : {}),
      },
      now,
    );
    await bumpContext(tx, learnerId);
    return id;
  });
}

/**
 * The help session of a homework sheet (null when the material is no homework): the open or
 * solved one as it is; after a long pause (abandoned) a fresh one with the tasks she has not
 * solved yet. Every way back to a sheet ends here, never at "no questions" (audit H-7).
 */
async function helpSessionFor(
  deps: Deps,
  learnerId: string,
  materialId: string,
): Promise<string | null> {
  const now = deps.now();
  return deps.db.tx(async (tx) => {
    const m = await tx.maybeOne<{
      purpose: 'study' | 'homework';
      title: string | null;
      goal_id: string | null;
    }>(
      `select purpose, title, goal_id from materials
        where id = $1 and learner_id = $2 and archived_at is null for update`,
      [materialId, learnerId],
    );
    if (!m) throw new AppError('not_found', 'Material not found');
    if (m.purpose !== 'homework') return null;
    const last = await tx.maybeOne<{ id: string; status: SessionRow['status'] }>(
      `select id, status from practice_sessions
        where material_id = $1 and learner_id = $2 and mode = 'help'
        order by started_at desc, seq desc limit 1`,
      [materialId, learnerId],
    );
    if (last && last.status !== 'abandoned') return last.id;
    const unsolved = await tx.query<{ id: string }>(
      `select i.id from items i
        where i.material_id = $1 and i.learner_id = $2 and i.archived_at is null
          and i.origin = 'homework'
          and not exists (select 1 from session_items si where si.item_id = i.id and si.status = 'correct')
        order by i.seq`,
      [materialId, learnerId],
    );
    if (unsolved.length === 0) {
      if (last) return last.id;
      throw new AppError('not_found', 'No tasks on this sheet', { reason: 'no_questions' });
    }
    const id = await createSession(
      tx,
      learnerId,
      unsolved.map((u) => u.id),
      {
        mode: 'help',
        stepId: null,
        goalId: m.goal_id,
        materialId,
        title: m.title,
        clientRequestId: null,
      },
      now,
    );
    await bumpContext(tx, learnerId);
    return id;
  });
}

/** Practice feeds spaced repetition; tests and homework do not. */
function learnsFsrs(mode: SessionMode): boolean {
  return mode === 'practice';
}

/** The hint ladder runs in practice (tests give none; homework has its own rules). */
function givesHints(mode: SessionMode): boolean {
  return mode === 'practice';
}

/**
 * "Tipp" on request: also in homework help (the help sheet promises tips; user feedback #7),
 * where a hint never carries the solution (checked like every homework reply).
 */
function offersHintButton(mode: SessionMode): boolean {
  return mode === 'practice' || mode === 'help';
}

/**
 * "Lösung zeigen" only after a real try or a hint, never from the first second (user feedback
 * #8); a spoken sentence can always be skipped. Never in homework, never while a test runs.
 */
function revealReady(
  mode: SessionMode,
  si: { kind: ItemRow['kind']; attempts: number; hints_used: number },
): boolean {
  if (mode === 'help' || mode === 'test') return false;
  // A free text keeps the way out (she must be able to move on), but nothing is revealed by
  // it: the view sends no answer and the screen names it "Überspringen" (issue #197).
  return si.kind === 'speak' || si.attempts > 0 || si.hints_used > 0;
}

/**
 * The open question to show next: the first open one in order; in homework help a task set
 * aside ("Später") comes after the others, the one set aside longest ago first.
 */
function currentOpen<
  T extends { status: SessionItemRow['status']; position: number; deferred_at?: Date | null },
>(items: readonly T[]): T | undefined {
  const open = items.filter((i) => i.status === 'open');
  return [...open].sort((a, b) => {
    const da = a.deferred_at ? a.deferred_at.getTime() : null;
    const db = b.deferred_at ? b.deferred_at.getTime() : null;
    if (da === null || db === null) {
      if (da !== db) return da === null ? -1 : 1;
    } else if (da !== db) {
      return da - db;
    }
    return a.position - b.position;
  })[0];
}

/**
 * After this many wrong tries the solution is explained (docs/buddy/03-fahrplan.md §2):
 * the old app withheld it forever, which frustrated; research on bottom-out hints and
 * worked examples supports a bounded ladder.
 */
export const REVEAL_AFTER_MISSES = 3;

/**
 * Asked for help again, the solution is explained only once she has seen this many hints and
 * every prepared one (live finding 1: the first "Tipp" after a miss showed the solution).
 */
export const HINTS_BEFORE_SOLUTION = 2;

/** Whether a (further) request for help shows the solution: the end of the hint ladder. */
function ladderDone(i: { hints: string[]; hints_used: number; prepared_hints_used: number }) {
  return (
    i.prepared_hints_used >= i.hints.length &&
    i.hints_used >= Math.max(i.hints.length, HINTS_BEFORE_SOLUTION)
  );
}

/** The solution as the learner sees it. */
export function shownSolution(
  i: Pick<ItemRow, 'kind' | 'answer' | 'choices' | 'correct_choice' | 'unit'>,
): string {
  if (i.kind === 'multiple_choice' && i.choices && i.correct_choice !== null) {
    return i.choices[i.correct_choice] ?? i.answer;
  }
  return `${i.answer}${i.unit ? ` ${i.unit}` : ''}`;
}

/** Every form of the solution a homework reply must not state (audit H-9, M-28). */
export function solutionsOf(
  i: Pick<ItemRow, 'kind' | 'answer' | 'choices' | 'correct_choice' | 'unit' | 'accepted_answers'>,
): string[] {
  return [...new Set([shownSolution(i), i.answer, ...i.accepted_answers])];
}

/**
 * The worked solution when prepared, otherwise the plain solution.
 *
 * For a free text neither is "the solution" (issue #197): a prepared way is introduced as ONE
 * way, and where none was prepared the app says plainly that there is no single right answer
 * here — instead of reading out the 600-character key as if it were one.
 */
function workedReply(
  locale: string,
  i: Pick<ItemRow, 'kind' | 'answer' | 'choices' | 'correct_choice' | 'unit' | 'worked_solution'>,
): string {
  const free = noSingleSolution(i);
  if (i.worked_solution) {
    return `${t(locale, free ? 'practice.one_way_intro' : 'practice.worked_intro')} ${i.worked_solution}`;
  }
  if (free) return t(locale, 'practice.no_single_solution');
  return t(locale, 'practice.solution_is', { answer: shownSolution(i) });
}

// ─────────────── view ───────────────

export async function loadSession(
  db: Db,
  learnerId: string,
  sessionId: string,
): Promise<SessionRow> {
  const s = await db.maybeOne<SessionRow>(
    `select ${SESSION_COLS} from practice_sessions
      where id = $1 and learner_id = $2`,
    [sessionId, learnerId],
  );
  if (!s) throw new AppError('not_found', 'Session not found');
  return s;
}

/** How long a signed concept-image URL lives; every session fetch signs afresh (issue #50). */
const IMAGE_URL_TTL_SECONDS = 1800;

type ItemImageRow = {
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_label: string | null;
};

/**
 * Signed URLs for the concept images of a view, one sign per distinct crop. A Storage
 * outage never breaks loading the session: the image is simply left out (null).
 */
async function signImageUrls(
  storage: StorageGateway,
  rows: ItemImageRow[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const path of new Set(rows.map((r) => r.image_path).filter((p): p is string => !!p))) {
    try {
      urls.set(path, await storage.createDownloadUrl(path, IMAGE_URL_TTL_SECONDS));
    } catch {
      // Left out; the next fetch tries again.
    }
  }
  return urls;
}

/**
 * The learning surface of a question computed from a reviewed task, or null (issue #162).
 * A column that no longer parses as a task yields no surface: the question is still
 * answerable by typing, and nothing is guessed at.
 */
function surfaceFor(bar: unknown, staff: unknown): ItemView['surface'] {
  const barTask = taskOf(bar);
  if (barTask) return surfaceOf(barTask);
  // The empty staff she writes a note line on (issue #226). The two can never both be there
  // (migration 0078 `items_one_computed_source`), so the order here settles nothing.
  const staffTask = staffTaskOf(staff);
  return staffTask ? staffSurfaceOf(staffTask) : null;
}

/**
 * The board of a question whose answer has several parts, or null (issues #228–#230). Derived
 * from the stored task and therefore without the solution; the display order is stable per
 * question. A column that no longer parses as a task yields no board: the question can still be
 * revealed or taken out ("Frage passt nicht"), and nothing is guessed at.
 */
function boardFor(stored: unknown, itemId: string): ItemView['board'] {
  const task = partsTaskOf(stored);
  return task ? boardOf(task, itemId) : null;
}

/** The crop that goes with the question, or null (contract: ItemImage). */
function imageOf(row: ItemImageRow, urls: Map<string, string>): ItemView['image'] {
  const url = row.image_path ? urls.get(row.image_path) : undefined;
  if (!url || !row.image_width || !row.image_height) return null;
  return { url, width: row.image_width, height: row.image_height, label: row.image_label ?? '' };
}

export async function sessionView(
  db: Db,
  learnerId: string,
  sessionId: string,
  storage: StorageGateway,
  /** The app clock: it decides whether this run is still waiting for questions (issue #220). */
  now: Date,
): Promise<SessionView> {
  const s = await loadSession(db, learnerId, sessionId);
  const items = await db.query<
    SessionItemRow & ItemRow & ItemImageRow & { archived_at: Date | null }
  >(
    `select si.item_id, si.position, si.status, si.attempts, si.hints_used, si.prepared_hints_used,
            si.first_try_correct, si.flagged_at, si.deferred_at, si.answered_by, si.disputed_at,
            i.id, i.kind, i.prompt, i.answer, i.accepted_answers, i.unit, i.choices, i.correct_choice,
            i.topic, i.material_id, i.origin, i.lang, i.prompt_lang, i.figure, i.hints, i.worked_solution,
            i.bar_task, i.parts_task, i.listen_task, i.staff_task, i.archived_at,
            mi.storage_path as image_path, mi.width as image_width, mi.height as image_height,
            mi.label as image_label
       from session_items si join items i on i.id = si.item_id
       left join material_images mi on mi.id = i.image_id
      where si.session_id = $1 order by si.position`,
    [sessionId],
  );
  const imageUrls = await signImageUrls(storage, items);
  const turns = await db.query<{
    id: string;
    item_id: string | null;
    role: 'learner' | 'tutor';
    text: string;
    verdict: PracticeTurnView['verdict'];
    pronunciation: PracticeTurnView['pronunciation'];
    reexplain: PracticeTurnView['reexplain'];
    created_at: Date;
  }>(
    `select id, item_id, role, text, verdict, pronunciation, reexplain, created_at from practice_turns
      where session_id = $1 order by seq`,
    [sessionId],
  );
  const title = await db.maybeOne<{ title: string }>(
    `select coalesce(ps.title, g.title, st.title) as title from practice_sessions ps
       left join buddy_goals g on g.id = ps.goal_id left join buddy_steps st on st.id = ps.step_id
      where ps.id = $1`,
    [sessionId],
  );
  const current = currentOpen(items);
  const active = s.status === 'active';
  // A flashcard pass (issue #147): nothing in it is checked, so it offers no hint and no
  // "Lösung zeigen", nothing to tap, and every card carries its own back — see cards.ts.
  const cardPass = s.pass === CARD_PASS;
  // Her own words from this very set, so tapping never offers one she has not met
  // (issue #147). Computed here, not stored: the key stays the typed answer. Her app
  // language decides whether tapping is offered at all — recognising, not producing.
  const own = await db.one<{ locale: string }>(`select locale from learners where id = $1`, [
    learnerId,
  ]);
  const vocabInSet = items
    .filter((i) => i.kind === 'vocab')
    .map((i) => ({ id: i.id, answer: i.answer, lang: i.lang }));
  // Which recording each listening question is about ('h1', 'h2' …): questions about one text
  // share the alias, which is all the app can be told about a text it must not see (issue #210).
  const hearing = listenRefs(items);
  // Homework never shows the solution; a test shows the answers once it is finished.
  const revealAllowed = s.mode !== 'help' && !(s.mode === 'test' && active);
  // A finished test shows every solution, also of the questions she never got to (audit M-36).
  const testOver = s.mode === 'test' && s.status === 'finished';
  /**
   * Whether this question's solution may be sent — and with it, for a listening question, the
   * words of the text it was heard from (issue #210). One condition for both, so a text can
   * never arrive a moment before the answer it belongs to.
   */
  const solutionShown = (i: { status: string; kind: string }): boolean =>
    cardPass || !((i.status === 'open' && !testOver) || !revealAllowed || noSingleSolution(i));
  return {
    id: s.id,
    mode: s.mode,
    reveal_allowed: revealAllowed,
    status: s.status,
    // The rest of the questions is still being written (issue #220). The app shows no total
    // that would still change, and does not read "no open question" as "this run is over".
    preparing: active && stillPreparing(s, now),
    title: title?.title ?? '',
    items: items.map((i) => ({
      item: {
        id: i.id,
        kind: i.kind,
        prompt: i.prompt,
        choices: i.choices,
        unit: i.unit,
        topic: i.topic,
        origin: i.origin,
        lang: i.lang,
        prompt_lang: i.prompt_lang,
        figure: storedFigure(i.figure),
        image: imageOf(i, imageUrls),
        // A test asks her to produce, so nothing is offered to tap there — and a card has
        // nothing to tap at all: it turns over (issue #147).
        tap_choices:
          s.mode === 'test' || cardPass ? null : tapChoicesFor(i, vocabInSet, own.locale),
        // The fraction bar she works with, derived from the task the question was computed
        // from (issue #162). Only while the question is open: once it is closed the bars
        // would be a control without a purpose, and the solution stands in the thread.
        surface: i.status === 'open' && active ? surfaceFor(i.bar_task, i.staff_task) : null,
        // The board she arranges, for as long as the question is open — like the fraction bar
        // above, and for the same reason: once the question is closed the pieces would be a
        // control with nothing left to do, and her answer and the solution both stand in the
        // thread (issues #228–#230).
        board: i.status === 'open' && active ? boardFor(i.parts_task, i.id) : null,
        // The spoken stimulus, as the alias of its recording and nothing more (issue #210).
        // It stays while the question is closed: hearing the text again next to the words of
        // it is exactly what a listening task is reviewed with.
        listen: hearing.has(i.id) ? { ref: hearing.get(i.id)! } : null,
      },
      status: i.status,
      attempts: i.attempts,
      hints_used: i.hints_used,
      hints_left:
        i.status === 'open' && active && !cardPass && givesHints(s.mode)
          ? Math.max(0, i.hints.length - i.prepared_hints_used)
          : 0,
      hint_available:
        i.status === 'open' &&
        active &&
        !cardPass &&
        offersHintButton(s.mode) &&
        i.kind !== 'speak' &&
        // Listening: the help is hearing it again, and slower — which the card offers anyway
        // (issue #210). A written hint about a text she is supposed to be listening to is a
        // worse version of the replay, and it would be one more model call.
        !hearing.has(i.id),
      reveal_available: i.status === 'open' && active && !cardPass && revealReady(s.mode, i),
      deferred: i.status === 'open' && s.mode === 'help' && Boolean(i.deferred_at),
      // Never leak the solution of an open question, nor ever in help mode (homework) — and
      // never for a free text, which has none to send (issue #197): the key is a sketch the
      // model wrote, and the screen would label it "Lösung".
      // A card carries its back while it is still open: showing it IS the pass, and there is
      // nothing to grade that it could give away (issue #147). Everywhere else unchanged.
      answer: !solutionShown(i)
        ? null
        : i.kind === 'multiple_choice' && i.choices && i.correct_choice !== null
          ? (i.choices[i.correct_choice] ?? i.answer)
          : `${i.answer}${i.unit ? ` ${i.unit}` : ''}`,
      // The words of a listening text, under exactly the condition the solution is sent under
      // (issue #210): she hears it, answers, and reads it afterwards. While the question is
      // open the text is the solution, so it stays here.
      listen_transcript: solutionShown(i) ? (listenTaskOf(i.listen_task)?.text ?? null) : null,
    })),
    turns: turns.map((tr) => ({
      id: tr.id,
      item_id: tr.item_id,
      role: tr.role,
      text: tr.text,
      verdict: tr.verdict,
      pronunciation: tr.pronunciation,
      reexplain: tr.reexplain,
      created_at: tr.created_at.toISOString(),
    })),
    current_item_id: active ? (current?.id ?? null) : null,
    summary: s.status === 'finished' ? summarize(items) : null,
    card_pass: cardPass,
    // Whether this finished run has words to go through as cards. One rule, in cards.ts, so
    // the offer on the result screen and what the pass then holds can never disagree.
    card_pass_offered: offersCardPass(s, items),
  };
}

// ─────────────── answer ───────────────

export async function nextSeq(db: Db, sessionId: string): Promise<number> {
  const r = await db.one<{ n: number }>(
    `select coalesce(max(seq), 0)::int as n from practice_turns where session_id = $1`,
    [sessionId],
  );
  return r.n + 1;
}

function outcomeOf(si: { status: string; first_try_correct: boolean | null }): ItemOutcome {
  if (si.status === 'correct') return si.first_try_correct ? 'first_try' : 'with_help';
  return 'revealed';
}

export async function replay(
  db: Db,
  learnerId: string,
  sessionId: string,
  clientTurnId: string,
  storage: StorageGateway,
  now: Date,
): Promise<AnswerResponse | null> {
  const learnerTurn = await db.maybeOne<{ seq: number; verdict: AnswerResponse['verdict'] }>(
    `select seq, verdict from practice_turns where session_id = $1 and client_turn_id = $2`,
    [sessionId, clientTurnId],
  );
  if (!learnerTurn) return null;
  const view = await sessionView(db, learnerId, sessionId, storage, now);
  const reply = await db.maybeOne<{ id: string }>(
    `select id from practice_turns where session_id = $1 and seq = $2 and role = 'tutor'`,
    [sessionId, learnerTurn.seq + 1],
  );
  const turn = view.turns.find((tr) => tr.id === reply?.id);
  if (!turn) throw new AppError('conflict', 'Answer is still being processed');
  return { session: view, verdict: learnerTurn.verdict, reply: turn };
}

/**
 * A test: one neutral acknowledgement per answer, never a hint or the
 * solution (whatever the model wrote); what was right comes at the end.
 */
function asTestTurn<
  J extends {
    verdict: AnswerResponse['verdict'];
    reply: string;
    gaveHint: boolean;
    revealed: boolean;
  },
>(j: J, locale: string): J {
  if (j.verdict === null) return { ...j, gaveHint: false, revealed: false };
  const key = j.verdict === 'not_an_attempt' ? 'practice.test_no_hints' : 'practice.test_noted';
  return { ...j, reply: t(locale, key), gaveHint: false, revealed: false };
}

/**
 * A vocabulary answer that is only missing its first word goes to the tutor (issue #146).
 *
 * The rules can see THAT a word is missing, never WHICH: "vélo" for "le vélo" forgot the
 * article and is what the owner wants counted right — "du sport" for "faire du sport"
 * dropped the verb and is not. Telling those apart needs the language, not a list of
 * articles per language the app would have to keep for every language a child might learn
 * (CLAUDE.md rule 3). So the model judges, as it does for every other undecidable case,
 * and the fixed reply ("da fehlt noch ein Wort") stops being the answer — it never said
 * which word, which is exactly why "sie wusste nicht was los ist" (owner, 30.09.).
 */
function articleMissing(rule: RuleVerdict, item: { kind: string }): boolean {
  return rule === 'missing_word' && item.kind === 'vocab';
}

/** The fixed, kind reply to a near miss the rules found (a slip shows the spelling instead). */
/**
 * Near misses whose fixed reply names a PLACE and nothing else: which line of her path stopped
 * following (issue #209), which atom does not add up or which factor is still in every coefficient
 * (issue #212). They carry no solution — a line number is not a calculation, and "count the H
 * again: 4 on the left, 2 on the right" is not the balanced equation.
 */
const LOCATED = new Set<RuleVerdict>(['step_broke', 'unbalanced', 'not_lowest']);

/**
 * Whether the fixed near-miss reply may be used here (issue #274).
 *
 * Homework help never shows the solution, so the fixed replies that DO show it — the spelling of a
 * slip above all — stay out of that mode and the tutor judges instead. That was written as "no
 * fixed reply in homework at all", and it threw away the most precise hint there is: the server
 * knew which step broke and answered with a general question from the hint ladder instead, at the
 * cost of a model call it did not need.
 *
 * So the line is drawn where it belongs: a reply that names a PLACE is a hint and holds in every
 * mode; a reply that names the ANSWER still never reaches homework help.
 */
function locatedOrNotHelp(rule: RuleVerdict, session: { mode: string }): boolean {
  return LOCATED.has(rule) || session.mode !== 'help';
}

const NEAR_MISS_REPLY: Partial<Record<RuleVerdict, MessageKey>> = {
  spelling: 'practice.spelling',
  close: 'practice.accents',
  missing_word: 'practice.missing_word',
};

/**
 * Where a written path stops following itself (issue #209). The line numbers are the ones she
 * sees; the last step gets its own sentence, because "bis Zeile 2 stimmt alles" reads oddly
 * when there are only three lines and the one that broke is the final one.
 */
function pathReply(locale: string, text: string): string | null {
  const path = checkPath(text);
  if (path.kind !== 'broke') return null;
  return path.line === path.lines - 1
    ? t(locale, 'practice.step_broke_last')
    : t(locale, 'practice.step_broke', { line: String(path.line) });
}

/**
 * What a counted equation says, with the place in it (issue #212). The element symbol is the
 * same in every language, so it goes in as it stands.
 */
function equationReply(locale: string, item: ItemRow, text: string): string | null {
  const d = equationDetail(item, text);
  if (!d) return null;
  if (d.verdict === 'not_lowest') {
    return t(locale, 'practice.not_lowest', { factor: String(d.factor) });
  }
  const i = d.imbalance;
  return i.kind === 'charge'
    ? t(locale, 'practice.unbalanced_charge', { left: String(i.left), right: String(i.right) })
    : t(locale, 'practice.unbalanced_element', {
        element: i.element,
        left: String(i.left),
        right: String(i.right),
      });
}

/**
 * The FIRST answer to a typo: what slipped, not the word (issue #207). A missing accent was
 * always answered this way ("schau nochmal auf die Akzente") and a typo was not — it was
 * answered with the correct spelling at once, so what followed was copying and the "Richtig"
 * after it claimed more than had happened.
 */
const TYPO_REPLY: Record<TypoShape, MessageKey> = {
  missing: 'practice.typo_missing',
  extra: 'practice.typo_extra',
  swapped: 'practice.typo_swapped',
  wrong: 'practice.typo_wrong',
};

/** Where a gap sits, in the words the table itself provides — else by its coordinates. */
function cellLabel(locale: string, place: Extract<PartsPlace, { at: 'cell' }>): string {
  if (place.column !== null && place.row !== null) {
    return t(locale, 'practice.parts.cell_named', { column: place.column, row: place.row });
  }
  if (place.column !== null) {
    return t(locale, 'practice.parts.cell_column', {
      column: place.column,
      row: String(place.rowNumber),
    });
  }
  return t(locale, 'practice.parts.cell_numbered', {
    column: String(place.columnNumber),
    row: String(place.rowNumber),
  });
}

/**
 * What a partly right answer with several parts says (issues #228–#230). No model, in any branch.
 *
 * The amount that holds is ALWAYS said: six of eight cells right is work that was right, and
 * "noch nicht ganz" would throw it away (the argument of issue #209). The PLACE follows the hint
 * ladder — from the second try on — so the first reply is "this much holds, try again" and the
 * second one is more specific, which is exactly what issue #229 asks for and the same shape the
 * prepared hints have. Only ONE place, never the list of everything that is wrong: `chemistry.ts`
 * settled that ("naming all of them at once is a list to work through rather than a next step").
 *
 * `order` is the exception, and not an inconsistency: there the amount that holds IS a place
 * ("bis Schritt 3 stimmt alles"), the way `steps.ts` names the first broken line at once.
 */
function partsReply(locale: string, check: PartsCheck, attempts: number): string {
  const place = attempts > 0 ? check.place : null;
  const counts = { held: String(check.held), total: String(check.total) };
  switch (check.form) {
    case 'order': {
      // `held` is the correct prefix, so the step to look at is the next one. A permutation can
      // never have a correct prefix of n−1, so this never points at the last step alone.
      const next = check.place?.at === 'step' ? check.place.step : check.held + 1;
      return t(locale, 'practice.parts.order_prefix', {
        step: String(check.held),
        next: String(next),
      });
    }
    case 'match_pairs':
      return place?.at === 'piece'
        ? t(locale, 'practice.parts.pairs_place', { ...counts, piece: place.piece })
        : t(locale, 'practice.parts.pairs_held', counts);
    case 'match_groups':
      return place?.at === 'piece'
        ? t(locale, 'practice.parts.groups_place', { ...counts, piece: place.piece })
        : t(locale, 'practice.parts.groups_held', counts);
    case 'table_fill': {
      if (place?.at !== 'cell') return t(locale, 'practice.parts.cells_held', counts);
      const line = t(locale, 'practice.parts.cells_place', {
        ...counts,
        cell: cellLabel(locale, place),
      });
      // A slip in a cell gets the sentence a slip in the answer field gets (issue #207): a cell
      // is not a smaller question with vaguer feedback.
      const near: MessageKey | null =
        place.rule === 'typo' && place.typo !== null
          ? TYPO_REPLY[place.typo]
          : (NEAR_MISS_REPLY[place.rule] ?? null);
      return near === null ? line : `${line} ${t(locale, near)}`;
    }
  }
}

export async function answerItem(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: AnswerRequest,
  /** "Tipp" with no prepared hint left: a request for help, never an answer to grade. */
  opts: { hintRequest?: boolean } = {},
): Promise<AnswerResponse> {
  const hintRequest = opts.hintRequest === true;
  const now = deps.now();
  const replayed = await replay(
    deps.db,
    learner.id,
    sessionId,
    input.client_turn_id,
    deps.storage,
    deps.now(),
  );
  if (replayed) return replayed;

  const session = await loadSession(deps.db, learner.id, sessionId);
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  // One path per session (issue #147): a flashcard pass is turned over, never answered,
  // hinted at or revealed. The pass was decided when it started, so the server refuses the
  // other way in rather than letting two kinds of evidence meet on one question.
  if (session.pass === CARD_PASS) {
    throw new AppError('conflict', 'These are cards: you say yourself whether you knew it', {
      reason: 'use_cards',
    });
  }
  const item = await deps.db.maybeOne<
    ItemRow & SessionItemRow & { extracted_text: string | null; subject_kind: string | null }
  >(
    `select i.*, si.status, si.attempts, si.hints_used, si.prepared_hints_used, si.first_try_correct,
            si.position, si.item_id,
            m.extracted_text, s.kind as subject_kind
       from session_items si join items i on i.id = si.item_id left join materials m on m.id = i.material_id
       left join subjects s on s.id = i.subject_id
      where si.session_id = $1 and si.item_id = $2`,
    [sessionId, input.item_id],
  );
  if (!item) throw new AppError('not_found', 'Question not in this session');
  if (item.status !== 'open') throw new AppError('conflict', 'This question is already closed');

  if (item.kind === 'speak') {
    throw new AppError('conflict', 'This question is answered by speaking', {
      reason: 'use_speak',
    });
  }

  // ── an answer with SEVERAL PARTS (issues #228–#230) ──
  //
  // One shape per question, and the server refuses the other one. She can only answer with the
  // pieces the question gives her: exactly its slots, each once, with values out of exactly the
  // vocabulary it issued (`readParts`). A board question takes no typed text, and a question with
  // one answer takes no parts — a shape the question never offered is a bad request, not
  // something to interpret.
  const partsTask = hasSeveralParts(item.kind) ? partsTaskOf(item.parts_task) : null;
  if (hasSeveralParts(item.kind) && partsTask === null) {
    // The kind says several parts and the stored task no longer reads as one. Nothing can be
    // compared, so nothing is claimed; "Lösung zeigen" and "Frage passt nicht" still work.
    throw new AppError('conflict', 'This question has no board', { reason: 'cannot_answer' });
  }
  if (input.parts !== undefined && partsTask === null) {
    throw new AppError('invalid_input', 'This question is answered with one value');
  }
  let filled: ReturnType<typeof readParts> = null;
  if (partsTask !== null && input.parts !== undefined) {
    filled = readParts(partsTask, input.parts);
    if (filled === null) throw new AppError('invalid_input', 'Not an answer this question offers');
  }
  // "Tipp" arrives as a text ("Tipp, bitte") and is no answer to grade; anything else typed at a
  // board question is.
  if (partsTask !== null && filled === null && !hintRequest) {
    throw new AppError('invalid_input', 'This question is answered part by part', {
      reason: 'use_parts',
    });
  }

  // ── eine NOTENZEILE, die sie selbst geschrieben hat (issue #226) ──
  //
  // Dieselbe Trennung wie oben, eine Stufe einfacher: die Zeile reist als eine kompakte
  // Maschinenform in `text` (`renderStaffLine`), weil die App nichts Deutsches zusammenbauen
  // soll und der Server nichts raten soll. `checkStaffLine` liest sie zurück und vergleicht
  // Tonnamen, Dauern und Taktfüllung — kein Modell, in keinem Zweig.
  //
  // Null heißt „hier ist nichts zu vergleichen": jede andere Notenaufgabe (die wird angetippt),
  // und eine Antwort, die überhaupt keine Notenzeile ist. Dann läuft alles wie immer — gegen den
  // Schlüssel in Worten, der in `items.answer` steht. Sie für falsch zu erklären wäre ein Urteil
  // über Noten, von denen keine da waren (Regel 5).
  const staffTask = staffTaskOf(item.staff_task);
  const staffCheck: StaffCheck | null =
    hintRequest || staffTask === null ? null : checkStaffLine(staffTask, input.text ?? '');
  /** Ihre Zeile in Worten, damit der Gesprächsfaden lesbar bleibt (wie `writtenParts`). */
  const staffWritten =
    staffCheck !== null ? writtenStaffLine(learner.locale, input.text ?? '') : null;
  const text =
    partsTask !== null && filled !== null
      ? // Her arrangement in one line, so the thread, the tutor history and a disputed judgement
        // all see what she actually did.
        writtenParts(partsTask, filled)
      : (staffWritten ??
        input.text ??
        (input.choice != null && item.choices ? (item.choices[input.choice] ?? null) : null));
  if (!text) throw new AppError('invalid_input', 'Empty answer');
  // The reviewed task this question was computed from, if any (issue #162).
  const barTask = taskOf(item.bar_task);
  // Every part compared, by code, with no model in any branch (`parts.ts`).
  const partsCheck: PartsCheck | null =
    partsTask !== null && filled !== null ? checkParts(partsTask, filled, item.id, item) : null;
  // The curriculum place this question is at, if any (migration 0074, issue #214). Read
  // forgivingly: an unknown key means "no place", never a wrong rule.
  const curriculumPoint = pointOf(item.curriculum_point);
  // The required elements of a writing task, if any (issue #211). A free text with a rubric is
  // judged element by element instead of getting one of four verdicts about the whole text; a
  // free text without one behaves exactly as it has since #197.
  const rubric = hintRequest ? null : rubricOf(item.rubric);
  const asked = rubric ? askedElements(rubric) : [];
  // What the model said about the elements it was asked about. It stays empty when no model was
  // called at all (the rules alone answered, or the model was unavailable) — and then every
  // judged element is `unknown` rather than missing: nobody measured it.
  let claims: readonly RubricClaim[] = [];
  // The spoken text this question was answered from, if any (issue #210). It decides two
  // things below: that only the content is judged (never the spelling of a word she HEARD),
  // and that the tutor is given that text as the material it may judge against.
  const listenTask = listenTaskOf(item.listen_task);
  // A request for help is not an answer: nothing for the rules to check.
  // Two checks that code does ENTIRELY on its own and that therefore come before the key
  // comparison: every part of a multi-part answer (issues #228–#230) and a written note line
  // (issue #226). Both end in `parts_left` when some of it holds — the same verdict one form
  // further — and neither ever asks a model.
  const byRules: RuleVerdict = hintRequest
    ? 'unknown'
    : partsCheck !== null
      ? partsCheck.verdict === 'correct'
        ? 'correct'
        : partsCheck.verdict === 'partly'
          ? 'parts_left'
          : 'incorrect'
      : staffCheck !== null
        ? staffCheck.verdict === 'correct'
          ? 'correct'
          : staffCheck.verdict === 'partly'
            ? 'parts_left'
            : 'incorrect'
        : ruleCheck(
            // A question code computed asks for an amount, so any form of it is right (#162);
            // a question she HEARD is judged on what she understood, not how she wrote it (#210).
            { ...item, form_free: barTask !== null, listening: listenTask !== null },
            { text: input.text ?? null, choice: input.choice ?? null },
          );
  // A plain number with another value is a wrong answer for sure — except in homework,
  // where "12" may be a right step towards 11/12.
  const rule: RuleVerdict =
    byRules === 'unknown' && !hintRequest && session.mode !== 'help' && differentNumber(item, text)
      ? 'incorrect'
      : byRules;
  const nextHint = givesHints(session.mode) ? (item.hints[item.prepared_hints_used] ?? null) : null;
  // Two options and one was wrong: tapping the other one is no knowledge. A wrong choice that
  // leaves a single untried option closes the question with the solution explained — shown,
  // never right (user feedback #9).
  // The same holds for two bars she compares (issue #162): once one of them is ruled out,
  // tapping the other is elimination, not knowledge.
  const twoBars = barTask !== null && pickAnswers(barTask) !== null;
  let onlyOneLeft = false;
  if (
    givesHints(session.mode) &&
    rule === 'incorrect' &&
    ((item.kind === 'multiple_choice' && item.choices !== null) || twoBars)
  ) {
    const wrong = await deps.db.query<{ text: string }>(
      `select distinct text from practice_turns
        where session_id = $1 and item_id = $2 and role = 'learner' and verdict = 'incorrect'`,
      [sessionId, item.id],
    );
    const said = [...wrong.map((w) => w.text), text];
    const untried = untriedPicks(barTask, said);
    if (untried !== null) {
      onlyOneLeft = untried.length <= 1;
    } else if (item.choices) {
      const tried = new Set(said);
      onlyOneLeft = item.choices.filter((c) => !tried.has(c)).length <= 1;
    }
  }

  type Judged = {
    verdict: 'correct' | 'partially_correct' | 'incorrect' | 'not_an_attempt' | null;
    evaluatedBy: 'rule' | 'model' | null;
    reply: string;
    gaveHint: boolean;
    /** The hint shown is the next prepared one (prepared_hints_used moves on). */
    usedPrepared?: boolean;
    revealed: boolean;
  };
  let judged: Judged;
  if (hintRequest && givesHints(session.mode) && ladderDone(item)) {
    // Asked again at the end of the ladder: the solution explained, at once, no model.
    judged = {
      verdict: 'not_an_attempt',
      evaluatedBy: 'rule',
      reply: workedReply(learner.locale, item),
      gaveHint: false,
      revealed: true,
    };
  } else if (rule === 'correct') {
    judged = {
      verdict: 'correct',
      evaluatedBy: 'rule',
      reply: t(
        learner.locale,
        session.mode === 'help' ? 'practice.help_solved' : 'practice.correct',
      ),
      gaveHint: false,
      revealed: false,
    };
  } else if (rule === 'parts_left' && partsCheck !== null) {
    // Partly right, and the question stays OPEN so she corrects only the parts that do not hold.
    // Nothing is locked and nothing is cleared: her arrangement stays as she left her it, and a
    // tap on a part she set takes it back ("undo over confirmation"). This is the house's
    // near-miss shape one form further, and `parts.ts` argues at length why it is neither a score
    // nor a grade — FSRS sees nothing here, and the right answer afterwards is `with_help`.
    //
    // It gets its own branch rather than falling into the near-miss branch below so that it
    // holds in every mode: homework help has no multi-part questions today, and if one ever
    // reached it, the fixed reply here is still right and still costs no model call.
    judged = {
      verdict: 'partially_correct',
      evaluatedBy: 'rule',
      reply: partsReply(learner.locale, partsCheck, item.attempts),
      gaveHint: false,
      revealed: false,
    };
  } else if (rule === 'parts_left' && staffCheck !== null) {
    // Eine Notenzeile, von der ein Stück hält (issue #226) — dasselbe Urteil, eine Form weiter.
    // Die Frage bleibt offen, nichts wird zurückgesetzt, und sie bekommt EINE Stelle: wie viele
    // Zeichen von vorne stimmen, und ab dem zweiten Versuch auch, wo es aufhört („in Takt 2 ist
    // mehr, als in den Takt passt“). Das ist genau die Rückmeldung, die issue #226 verlangt.
    judged = {
      verdict: 'partially_correct',
      evaluatedBy: 'rule',
      reply: staffLineReply(learner.locale, staffCheck, item.attempts),
      gaveHint: false,
      revealed: false,
    };
  } else if (
    NEAR_MISS.has(rule) &&
    !articleMissing(rule, item) &&
    locatedOrNotHelp(rule, session)
  ) {
    // A near miss needs no model: a fixed, kind answer at once. A slip shows the
    // spelling and stays open, so she types it right herself (never in homework,
    // which never shows the solution — there the tutor judges).
    // The spelling only from the second try on, and then it counts as help given — like a
    // hint, because that is what it is (issue #207). `first_try_correct` is false after the
    // first attempt anyway, so a later right answer is already recorded as "with help"; the
    // hint count makes the record say WHY.
    const spellOut = rule === 'typo' && item.attempts > 0;
    judged = {
      verdict: 'partially_correct',
      evaluatedBy: 'rule',
      reply:
        rule === 'typo'
          ? spellOut
            ? t(learner.locale, 'practice.typo', { answer: plainMath(item.answer) })
            : t(learner.locale, TYPO_REPLY[typoShapeFor(item, text)])
          : // Code found the place: the broken step (issue #209) or the count that does not
            // add up (issue #212). Only then the fixed near-miss texts.
            (pathReply(learner.locale, text) ??
            equationReply(learner.locale, item, text) ??
            t(learner.locale, NEAR_MISS_REPLY[rule] ?? 'practice.accents')),
      gaveHint: spellOut,
      revealed: false,
    };
  } else if (session.mode === 'test' && rule === 'incorrect') {
    // A test only needs the judgement, and the rules already have it: no model
    // call (it would only write a hint the test replaces with a neutral word).
    judged = {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply: '',
      gaveHint: false,
      revealed: false,
    };
  } else if (
    givesHints(session.mode) &&
    rule === 'incorrect' &&
    (item.attempts + 1 >= REVEAL_AFTER_MISSES || onlyOneLeft)
  ) {
    // The third wrong try (or no real choice left), wrong for sure: the solution explained, at
    // once and without a model.
    judged = {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply: workedReply(learner.locale, item),
      gaveHint: false,
      revealed: true,
    };
  } else if (
    givesHints(session.mode) &&
    rule === 'incorrect' &&
    staffTask !== null &&
    // Eine Schreibaufgabe nur, wenn wirklich eine Zeile ankam: sonst hat `ruleCheck` sie gegen
    // den Schlüssel in Worten geprüft, und dafür ist der Satz hier der falsche.
    (staffTask.task !== 'write_line' || staffCheck !== null)
  ) {
    // Eine falsche Notenantwort bekommt eine feste, freundliche Zeile von Code — bei jedem
    // Versuch, nicht nur beim ersten, und ohne Modellaufruf.
    //
    // Das ist kein Sparen, sondern Regel 5: der Tutor SIEHT die gezeichnete Notenzeile nicht.
    // Er bekommt Frage, Schlüssel und ihren Text, aber nicht das Bild, aus dem die Antwort
    // abgelesen wird — und ein Modell, das über ein Bild schreibt, das es nicht hat, erzeugt
    // genau die sicher klingende Falschaussage, die hier niemand erkennen könnte. Code weiß
    // dagegen, wo sie hinschauen muss, und sagt genau das (`staffAgain`); bei einer selbst
    // geschriebenen Zeile sogar die Stelle (`staffLineReply`). Die dritte Fehlprobe erklärt
    // die Lösung, wie überall — der Zweig darüber greift vorher.
    judged = {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply:
        staffCheck !== null
          ? staffLineReply(learner.locale, staffCheck, item.attempts)
          : staffAgain(learner.locale, staffTask),
      gaveHint: false,
      revealed: false,
    };
  } else if (givesHints(session.mode) && rule === 'incorrect' && item.attempts === 0) {
    // The FIRST wrong try: kind feedback at once, no model. A slip deserves a quick "try
    // again" and not a lesson, and the hints stay for "Tipp" (live finding 1).
    //
    // From the second one on it goes to the tutor instead (issue #156). The same question
    // wrong twice is a gap, not a slip, and the rules can only repeat themselves — the
    // external audit watched exactly that: "Noch nicht ganz …", "Noch nicht ganz …", then
    // the solution, with the error itself never engaged with. The JUDGEMENT stays the
    // rules' either way: `enforceTutorInvariants` holds a rule-certain wrong answer wrong
    // whatever the model says. Only the reply is the tutor's.
    judged = {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply: t(learner.locale, 'practice.try_again'),
      gaveHint: false,
      revealed: false,
    };
  } else {
    try {
      const preferences = await deps.db.query<{ statement: string }>(
        `select statement from buddy_memories
          where learner_id = $1 and status = 'active' and kind = 'preference'
            and (valid_until is null or valid_until > $2)
          order by created_at desc, seq desc limit 5`,
        [learner.id, now],
      );
      const history = await deps.db.query<{ role: 'learner' | 'tutor'; text: string }>(
        `select role, text from practice_turns where session_id = $1 and item_id = $2 order by seq`,
        [sessionId, item.id],
      );
      const tz = await deps.db.one<{ timezone: string }>(
        `select timezone from buddy_settings where learner_id = $1`,
        [learner.id],
      );
      const tutorContents: LlmMessage[] = [
        {
          role: 'user',
          parts: [
            {
              text: tutorContext({
                item: { ...item, listening: listenTask !== null },
                hintsGiven: item.hints_used,
                preparedHints: givesHints(session.mode) ? item.hints : [],
                preparedShown: item.prepared_hints_used,
                attempts: item.attempts,
                ruleVerdict: rule,
                mode: session.mode,
                learnerLevel:
                  learner.level === 'school'
                    ? `school grade ${learner.grade ?? '?'}`
                    : learner.level,
                learnerAge: ageOn(learner.birth_date, now),
                language: learner.locale,
                // For a listening question the material IS the text she heard (issue #210):
                // without it the tutor would judge an answer about a text it cannot read.
                material: listenTask
                  ? listenTask.text
                  : item.extracted_text
                    ? item.extracted_text.slice(0, MATERIAL_CHARS)
                    : null,
                preferences: preferences.map((p) => p.statement),
                // What her Bundesland expects at this question's curriculum place — or, when
                // no state rule applies, that none does and the judgement stays cautious
                // (issue #214). Null for a question at none of the twelve places.
                curriculum: curriculumLine({
                  point: curriculumPoint,
                  region: learner.curriculum_region,
                  grade: learner.grade,
                }),
                rubric: rubric ? { form: rubric.form, asked } : null,
              }),
            },
          ],
        },
        ...history.map((h) => ({
          role: h.role === 'learner' ? ('user' as const) : ('model' as const),
          parts: [{ text: h.text }],
        })),
        { role: 'user', parts: [{ text }] },
      ];
      // The elements are asked for in THIS request, not in a second one (issue #211): the
      // claims are captured into `claims` above rather than returned, so the one call a
      // question has always cost stays one call. The repair round below (homework only)
      // overwrites what the first round said — right, it is the same answer judged again.
      const askTutor = async (messages: LlmMessage[]) => {
        const r = await callModel(deps, learner.id, localParts(now, tz.timezone).date, {
          purpose: 'tutor',
          tier: 'smart',
          promptVersion: TUTOR_PROMPT_VERSION,
          system: TUTOR_SYSTEM,
          contents: messages,
          schema: asked.length ? RUBRIC_SCHEMA : TUTOR_SCHEMA,
          maxOutputTokens: 1024,
          temperature: 0.3,
          timeoutMs: 20_000,
          thinkingBudget: 0,
        });
        // A writing task with required elements answers in a wider schema — the same decision
        // plus one line per element (issue #211); everything else answers as before.
        let d: TutorDecisionT;
        if (asked.length) {
          const parsed = RubricDecision.safeParse(r.json);
          if (!parsed.success) throw new Error('tutor output invalid');
          claims = parsed.data.elements;
          d = parsed.data;
        } else {
          const parsed = TutorDecision.safeParse(r.json);
          if (!parsed.success) throw new Error('tutor output invalid');
          d = parsed.data;
        }
        return enforceTutorInvariants(
          d,
          rule,
          articleMissing(rule, item),
          // At a place where the states disagree and no rule applies to her, a confident
          // "wrong" is a claim nobody can back: it becomes "partly right" (issue #214).
          curriculumPoint !== null &&
            cautiousAt(curriculumPoint, learner.curriculum_region, learner.grade),
        );
      };
      // Homework: a task is solved only when code finds her final answer (by value, or the key
      // or an accepted answer in her words). A "correct" code cannot confirm is a right step:
      // the task stays open, and the reply must not say "right" under a "Fast" (audit H-10).
      // This runs FIRST, so the leak check judges the final verdict and reply (audit H-9).
      const solvedByHer = (x: TutorDecisionT): TutorDecisionT =>
        session.mode === 'help' &&
        item.kind !== 'long' &&
        x.verdict === 'correct' &&
        !homeworkSolved(item, text)
          ? {
              ...x,
              verdict: 'partially_correct',
              reply: t(learner.locale, 'practice.help_final_answer'),
              gave_hint: false,
              revealed_answer: false,
            }
          : x;
      // Only the task itself may state a value; her own guesses are no licence (audit M-28).
      const leaks = (x: TutorDecisionT) =>
        session.mode === 'help' && givesAwayHomework(x, solutionsOf(item), item.prompt);
      let d = solvedByHer(await askTutor(tutorContents));
      if (leaks(d)) {
        // Homework: the solution must not be given. One repair with the reason, then a safe hint.
        d = solvedByHer(
          await askTutor([
            ...tutorContents,
            { role: 'model', parts: [{ text: d.reply }] },
            {
              role: 'user',
              parts: [
                {
                  text: 'SYSTEM CHECK (not the learner): that reply gives the solution away, which is not allowed for homework. Write it again as one small hint or question without the answer.',
                },
              ],
            },
          ]),
        );
        if (leaks(d)) {
          d = {
            ...d,
            verdict: d.verdict === 'correct' ? 'partially_correct' : d.verdict,
            reply: t(learner.locale, 'practice.help_step'),
            gave_hint: true,
            revealed_answer: false,
          };
        }
      }
      judged = hintRequest
        ? {
            // "Tipp": whatever the model called it, this is help, shown as a hint — never a
            // graded answer, and its own gentle hint is kept (live finding 1).
            verdict: 'not_an_attempt',
            evaluatedBy: 'model',
            reply: d.reply,
            gaveHint: !d.revealed_answer,
            revealed: d.revealed_answer,
          }
        : d.intent === 'wants_to_stop'
          ? {
              // She has had enough (issue #161). The words here are the app's, not the
              // model's: this is the moment where a cheerful "du bist schon so nah dran"
              // is both untrue and pressure, and the external audit caught exactly that.
              // What she gets is a real choice — stop for today, or one small example —
              // and the way out is already on screen ("Übung beenden").
              verdict: 'not_an_attempt',
              evaluatedBy: 'rule',
              reply: t(learner.locale, 'practice.had_enough'),
              gaveHint: false,
              revealed: false,
            }
          : {
              verdict: d.verdict,
              evaluatedBy: 'model',
              reply: d.reply,
              gaveHint: d.gave_hint,
              revealed: d.revealed_answer,
            };
    } catch (err) {
      if (isAppError(err) && err.code !== 'budget_exhausted') throw err;
      // No model: say what the rules know, never pretend to have judged.
      judged = hintRequest
        ? {
            // "Tipp" without a model: a general first step, honestly no judgement.
            verdict: 'not_an_attempt',
            evaluatedBy: 'rule',
            reply: t(learner.locale, 'practice.help_step'),
            gaveHint: false,
            revealed: false,
          }
        : rule === 'close' || rule === 'spelling'
          ? {
              verdict: 'partially_correct',
              evaluatedBy: 'rule',
              reply: t(learner.locale, NEAR_MISS_REPLY[rule] ?? 'practice.accents'),
              gaveHint: false,
              revealed: false,
            }
          : rule === 'incorrect'
            ? {
                verdict: 'incorrect',
                evaluatedBy: 'rule',
                reply: t(learner.locale, 'practice.not_quite'),
                gaveHint: false,
                revealed: false,
              }
            : {
                verdict: null,
                evaluatedBy: null,
                reply: t(learner.locale, 'practice.cannot_check'),
                gaveHint: false,
                revealed: false,
              };
    }
  }

  // ─────────────── Schreibaufgabe: Rückmeldung je Element statt eines Urteils (issue #211) ──
  //
  // Hier wird das Gesamturteil ersetzt, nicht ergänzt. Der Grund steht im Issue: für eine
  // Inhaltsangabe, einen Bericht, eine Erörterung gibt es keine Musterlösung, gegen die ein
  // Gesamturteil zu rechtfertigen wäre — bewertet wird, ob die geforderten Elemente da sind.
  // Also entscheidet die Rubrik:
  //
  //   * das URTEIL kommt aus den Elementen (`rubricVerdict`), nicht aus dem Eindruck des
  //     Modells. Hält etwas und nicht alles, bleibt die Frage offen — und bekommt damit, wie
  //     bisher, keine FSRS-Note (`rateable` weiter unten); ein Bruchteil wird nirgends erfunden.
  //   * der SATZ kommt aus der Rubrik und den Texten der App, nicht aus der Prosa des Modells:
  //     die Elemente mit ihrem Stand, darunter EIN nächster Schritt. Ohne Zahl, ohne Note.
  //   * `revealed` bleibt false. Eine Schreibaufgabe hat nichts aufzudecken — das ist der Befund
  //     von #197, und ein Modell, das es anders sieht, ändert daran nichts.
  //
  // Nur für eine echte Antwort: eine Tipp-Bitte und alles, was keine Antwort war, bleiben
  // unberührt (dort hat sie nichts geschrieben, das gegen die Elemente zu halten wäre).
  if (rubric && judged.verdict !== null && judged.verdict !== 'not_an_attempt') {
    const outcome = checkRubric(rubric, text, claims);
    judged = {
      ...judged,
      verdict: rubricVerdict(outcome),
      reply: rubricReply(learner.locale, outcome, judged.reply),
      revealed: false,
    };
  }

  if (givesHints(session.mode)) {
    // Never the solution before the second hint — whatever the model wrote. The prepared
    // hint (or a neutral line) takes its place, without a second model call.
    if (
      judged.evaluatedBy === 'model' &&
      judged.verdict !== 'correct' &&
      item.hints_used < 2 &&
      (judged.revealed || mentionsSolution(judged.reply, shownSolution(item), item.prompt))
    ) {
      judged = {
        ...judged,
        reply:
          nextHint ?? t(learner.locale, hintRequest ? 'practice.help_step' : 'practice.try_again'),
        gaveHint: nextHint !== null || hintRequest,
        usedPrepared: nextHint !== null,
        revealed: false,
      };
    }
    // Never withheld forever: after the third wrong try, or when she asks again at the end of
    // the hint ladder, the solution is explained and the question comes back soon (FSRS).
    const attempted = judged.verdict !== null && judged.verdict !== 'not_an_attempt';
    const misses = item.attempts + (attempted ? 1 : 0);
    const askedAfterLastHint = judged.verdict === 'not_an_attempt' && ladderDone(item);
    if (
      !judged.revealed &&
      judged.verdict !== 'correct' &&
      judged.verdict !== null &&
      (misses >= REVEAL_AFTER_MISSES || askedAfterLastHint)
    ) {
      judged = {
        ...judged,
        reply: workedReply(learner.locale, item),
        gaveHint: false,
        usedPrepared: false,
        revealed: true,
      };
    }
  }

  if (session.mode === 'test') judged = asTestTurn(judged, learner.locale);

  try {
    await deps.db.tx(async (tx) => {
      // The session row first (one order everywhere): an answer to a session that ended
      // meanwhile is refused behind the same lock, and closing the last question finishes it.
      await lockActiveSession(tx, learner.id, sessionId);
      const si = await tx.one<SessionItemRow>(
        `select item_id, position, status, attempts, hints_used, prepared_hints_used, first_try_correct
           from session_items where session_id = $1 and item_id = $2 for update`,
        [sessionId, item.id],
      );
      if (si.status !== 'open') throw new AppError('conflict', 'This question is already closed');
      const seq = await nextSeq(tx, sessionId);
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, client_turn_id)
         values ($1, $2, $3, $4, 'learner', $5, $6, $7, $8)`,
        [
          sessionId,
          learner.id,
          item.id,
          seq,
          text,
          judged.verdict,
          judged.evaluatedBy,
          input.client_turn_id,
        ],
      );
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, gave_hint, revealed)
         values ($1, $2, $3, $4, 'tutor', $5, $6, $7)`,
        [sessionId, learner.id, item.id, seq + 1, judged.reply, judged.gaveHint, judged.revealed],
      );
      // The key learns: an answer the model judged right that the rules did not know
      // is accepted by the rules next time — at once and without a model.
      //
      // Two limits, because this is the one place where a MODEL judgement becomes a RULE and
      // then outlives everything (issue #227, finding 3):
      //
      //   - never in a test. There the model judges with less context, its reply is thrown
      //     away and replaced, and nobody reads what it decided — the worst possible moment
      //     to make one of its judgements permanent.
      //   - never past MAX_ACCEPTED, the same ceiling the reading prompts name. Without it the
      //     list grows without end, every entry widens what counts as right, and a key that
      //     accepts everything accepts a wrong answer too. Postgres does the counting, so two
      //     answers arriving at once cannot both slip past a check done in code.
      if (
        judged.evaluatedBy === 'model' &&
        judged.verdict === 'correct' &&
        rule === 'unknown' &&
        (item.kind === 'vocab' || item.kind === 'short') &&
        session.mode !== 'help' &&
        session.mode !== 'test' &&
        text.trim().length <= 80
      ) {
        await tx.query(
          `update items set accepted_answers = array_append(accepted_answers, $3)
            where id = $1 and learner_id = $2 and not ($3 = any(accepted_answers))
              and coalesce(array_length(accepted_answers, 1), 0) < $4`,
          [item.id, learner.id, text.trim(), MAX_ACCEPTED],
        );
      }
      const attempted = judged.verdict !== null && judged.verdict !== 'not_an_attempt';
      const attempts = si.attempts + (attempted ? 1 : 0);
      const hints = si.hints_used + (judged.gaveHint ? 1 : 0);
      const prepared = si.prepared_hints_used + (judged.usedPrepared ? 1 : 0);
      let status: SessionItemRow['status'] = 'open';
      let firstTry: boolean | null = si.first_try_correct;
      if (judged.verdict === 'correct') {
        status = 'correct';
        firstTry = si.attempts === 0 && si.hints_used === 0;
      } else if (judged.revealed) {
        status = 'revealed';
        firstTry = false;
      } else if (session.mode === 'test' && attempted) {
        // One try per question in a test.
        status = 'missed';
        firstTry = false;
      }
      // Working on a task she set aside brings it back in line (deferred_at cleared).
      await tx.query(
        `update session_items set attempts = $3, hints_used = $4, status = $5, first_try_correct = $6,
                                  closed_at = case when $5 = 'open' then null else $7::timestamptz end,
                                  deferred_at = null, prepared_hints_used = $8,
                                  -- How the CLOSING answer was given (issue #163); an open
                                  -- question keeps nothing, a tap is not production.
                                  answered_by = case when $5 = 'open' then null else $9::text end
          where session_id = $1 and item_id = $2`,
        [
          sessionId,
          item.id,
          attempts,
          hints,
          status,
          firstTry,
          now,
          prepared,
          input.via ?? 'typed',
        ],
      );
      // A free text she did not get right produces NO review: `Again` is a statement about
      // memory, and nothing here was measured (issue #197). Got right, it counts like any
      // other question. The cost is that such a question does not come back on a schedule —
      // which is the honest price for not inventing the rating.
      const rateable = status === 'correct' || !noSingleSolution(item);
      if (status !== 'open' && learnsFsrs(session.mode) && rateable) {
        // What the spaced repetition held BEFORE this review is recorded by `reviewItem`
        // itself (`session_items.state_before`, issue #164), from the same read that
        // overwrites it — so a judgement she says is wrong can be taken back without
        // costing her the history from earlier sessions.
        await reviewItem(
          tx,
          learner.id,
          sessionId,
          item.id,
          outcomeOf({ status, first_try_correct: firstTry }),
          now,
        );
      }
      await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
        sessionId,
        now,
      ]);
      await finishIfComplete(tx, learner.id, sessionId, now);
    });
  } catch (err) {
    // A concurrent duplicate of the same answer won: return its result.
    if (isUniqueViolation(err)) {
      const r = await replay(
        deps.db,
        learner.id,
        sessionId,
        input.client_turn_id,
        deps.storage,
        deps.now(),
      );
      if (r) return r;
    }
    throw err;
  }
  const view = await sessionView(deps.db, learner.id, sessionId, deps.storage, deps.now());
  const reply = [...view.turns]
    .reverse()
    .find((tr) => tr.item_id === item.id && tr.role === 'tutor');
  if (!reply) throw new AppError('internal', 'reply missing');
  return { session: view, verdict: judged.verdict, reply };
}

class NoPreparedHint extends Error {}

/**
 * "Tipp": the next prepared hint for an open question, at once and without a model;
 * with none prepared (yet), the tutor writes one like for "weiß nicht".
 * Recorded as a learner turn ("Tipp, bitte") and a tutor turn; idempotent per
 * client_turn_id; 409 for a closed question or in a test. In homework help a prepared hint
 * is used only when it does not state the solution; otherwise the tutor writes one, under
 * the same leak check as every homework reply (user feedback #7).
 */
export async function hintItem(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: HintRequest,
): Promise<AnswerResponse> {
  const now = deps.now();
  const replayed = await replay(
    deps.db,
    learner.id,
    sessionId,
    input.client_turn_id,
    deps.storage,
    deps.now(),
  );
  if (replayed) return replayed;
  const session = await loadSession(deps.db, learner.id, sessionId);
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  if (!offersHintButton(session.mode) || session.pass === CARD_PASS) {
    throw new AppError('conflict', 'No hints in this mode', { reason: 'no_hints' });
  }
  try {
    await deps.db.tx(async (tx) => {
      await lockActiveSession(tx, learner.id, sessionId);
      const si = await tx.maybeOne<
        {
          status: SessionItemRow['status'];
          hints_used: number;
          prepared_hints_used: number;
          hints: string[];
        } & Pick<
          ItemRow,
          'kind' | 'prompt' | 'answer' | 'accepted_answers' | 'choices' | 'correct_choice' | 'unit'
        >
      >(
        `select si.status, si.hints_used, si.prepared_hints_used, i.hints, i.kind, i.prompt, i.answer, i.accepted_answers,
                i.choices, i.correct_choice, i.unit
           from session_items si join items i on i.id = si.item_id
          where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3
          for update of si`,
        [sessionId, input.item_id, learner.id],
      );
      if (!si) throw new AppError('not_found', 'Question not in this session');
      if (si.status !== 'open') throw new AppError('conflict', 'This question is already closed');
      const hint = si.hints[si.prepared_hints_used];
      if (hint === undefined) throw new NoPreparedHint();
      if (
        session.mode === 'help' &&
        solutionsOf(si).some((sol) => mentionsSolution(hint, sol, si.prompt))
      ) {
        throw new NoPreparedHint();
      }
      const seq = await nextSeq(tx, sessionId);
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, client_turn_id)
         values ($1, $2, $3, $4, 'learner', $5, 'not_an_attempt', 'rule', $6)`,
        [
          sessionId,
          learner.id,
          input.item_id,
          seq,
          t(learner.locale, 'practice.hint_request'),
          input.client_turn_id,
        ],
      );
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, gave_hint, revealed)
         values ($1, $2, $3, $4, 'tutor', $5, true, false)`,
        [sessionId, learner.id, input.item_id, seq + 1, hint],
      );
      await tx.query(
        `update session_items set hints_used = hints_used + 1,
                                  prepared_hints_used = prepared_hints_used + 1, deferred_at = null
          where session_id = $1 and item_id = $2`,
        [sessionId, input.item_id],
      );
      await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
        sessionId,
        now,
      ]);
    });
  } catch (err) {
    // None prepared (yet, or used up): the tutor writes one, as for "weiß nicht".
    if (err instanceof NoPreparedHint) {
      return answerItem(
        deps,
        learner,
        sessionId,
        {
          client_turn_id: input.client_turn_id,
          item_id: input.item_id,
          text: t(learner.locale, 'practice.hint_request'),
        },
        { hintRequest: true },
      );
    }
    if (isUniqueViolation(err)) {
      const r = await replay(
        deps.db,
        learner.id,
        sessionId,
        input.client_turn_id,
        deps.storage,
        deps.now(),
      );
      if (r) return r;
    }
    throw err;
  }
  const replayedNow = await replay(
    deps.db,
    learner.id,
    sessionId,
    input.client_turn_id,
    deps.storage,
    deps.now(),
  );
  if (!replayedNow) throw new AppError('internal', 'hint missing');
  return replayedNow;
}

/**
 * "Show me the solution": close the question as not known (FSRS: again). Only after a real
 * try or a hint (user feedback #8); in a running test it is "Überspringen" (any time).
 */
export async function revealItem(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  itemId: string,
): Promise<SessionView> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const s = await lockActiveSession(tx, learnerId, sessionId);
    if (s.pass === CARD_PASS) {
      throw new AppError('conflict', 'A card shows its answer by itself', {
        reason: 'use_cards',
      });
    }
    const si = await tx.maybeOne<
      Pick<SessionItemRow, 'item_id' | 'status' | 'attempts' | 'hints_used'> & {
        kind: ItemRow['kind'];
      }
    >(
      `select si.item_id, si.status, si.attempts, si.hints_used, i.kind
         from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 and si.item_id = $2 for update of si`,
      [sessionId, itemId],
    );
    if (!si) throw new AppError('not_found', 'Question not in this session');
    if (si.status !== 'open') return;
    if (s.mode === 'help') {
      throw new AppError('conflict', 'Homework help never shows the solution', {
        reason: 'reveal_not_allowed',
      });
    }
    if (s.mode !== 'test' && !revealReady(s.mode, si)) {
      throw new AppError('conflict', 'Try it first, or ask for a hint', { reason: 'try_first' });
    }
    await tx.query(
      `update session_items set status = 'skipped', first_try_correct = false, closed_at = $3
        where session_id = $1 and item_id = $2`,
      [sessionId, itemId, now],
    );
    // `reviewItem` records what it overwrites, so a solution she says was the wrong one can
    // be taken back exactly (issue #164) — a reveal is the harshest review there is. A free
    // text gets none: skipping an essay says nothing about memory (issue #197).
    if (learnsFsrs(s.mode) && !noSingleSolution(si)) {
      await reviewItem(tx, learnerId, sessionId, itemId, 'revealed', now);
    }
    await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
      sessionId,
      now,
    ]);
    await finishIfComplete(tx, learnerId, sessionId, now);
  });
  return sessionView(deps.db, learnerId, sessionId, deps.storage, deps.now());
}

/**
 * Homework help "Später": the task stays open (nothing solved, nothing shown) and moves
 * behind the other open tasks, so she can get help with the next one (audit H-11).
 * Idempotent; 409 outside homework help or once the session ended.
 */
export async function deferItem(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  itemId: string,
): Promise<SessionView> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const s = await lockActiveSession(tx, learnerId, sessionId);
    if (s.mode !== 'help') {
      throw new AppError('conflict', 'Only homework tasks are set aside', {
        reason: 'defer_not_allowed',
      });
    }
    const si = await tx.maybeOne<Pick<SessionItemRow, 'status'>>(
      `select status from session_items where session_id = $1 and item_id = $2 for update`,
      [sessionId, itemId],
    );
    if (!si) throw new AppError('not_found', 'Question not in this session');
    if (si.status !== 'open') return;
    await tx.query(
      `update session_items set deferred_at = $3 where session_id = $1 and item_id = $2`,
      [sessionId, itemId, now],
    );
    await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
      sessionId,
      now,
    ]);
  });
  return sessionView(deps.db, learnerId, sessionId, deps.storage, deps.now());
}

/**
 * "Frage passt nicht": the learner takes a question out. It is archived (never
 * practised again) and, if still open here, closed as skipped — no FSRS review, and
 * it counts neither as answered nor as shaky. Not for homework (help) and not while
 * a test runs; only for questions from a photo or from Buddy. Idempotent.
 */
export async function flagItem(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  itemId: string,
): Promise<SessionView> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const s = await tx.maybeOne<SessionRow>(
      `select ${SESSION_COLS} from practice_sessions
        where id = $1 and learner_id = $2 for update`,
      [sessionId, learnerId],
    );
    if (!s) throw new AppError('not_found', 'Session not found');
    const si = await tx.maybeOne<
      Pick<SessionItemRow, 'status' | 'flagged_at'> & {
        origin: ItemRow['origin'];
        archived_at: Date | null;
      }
    >(
      `select si.status, si.flagged_at, i.origin, i.archived_at
         from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3
        for update of si, i`,
      [sessionId, itemId, learnerId],
    );
    if (!si) throw new AppError('not_found', 'Question not in this session');
    if (si.flagged_at) return; // already taken out
    if (s.status !== 'active') throw new AppError('conflict', 'Session has ended');
    if (s.mode === 'help') {
      throw new AppError('conflict', 'Homework tasks are not taken out', {
        reason: 'flag_not_allowed',
      });
    }
    if (s.mode === 'test') {
      throw new AppError('conflict', 'Not while a test runs', { reason: 'flag_not_allowed' });
    }
    if (s.pass === CARD_PASS) {
      // Her own words, chosen by the run before this one: there is no unfit question to
      // take out here, and a card pass has no button for it.
      throw new AppError('conflict', 'Cards are not taken out', { reason: 'flag_not_allowed' });
    }
    if (si.origin !== 'material' && si.origin !== 'buddy') {
      throw new AppError('conflict', 'Only questions from a photo or from Buddy', {
        reason: 'flag_not_allowed',
      });
    }
    if (!si.archived_at) {
      await tx.query(`update items set archived_at = $2 where id = $1`, [itemId, now]);
    }
    if (si.status === 'open') {
      await tx.query(
        `update session_items set status = 'skipped', flagged_at = $3, closed_at = $3
          where session_id = $1 and item_id = $2`,
        [sessionId, itemId, now],
      );
    }
    await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
      sessionId,
      now,
    ]);
    await finishIfComplete(tx, learnerId, sessionId, now);
    // Buddy's prepared practice and picture of her questions may include it.
    await bumpContext(tx, learnerId);
  });
  return sessionView(deps.db, learnerId, sessionId, deps.storage, deps.now());
}

/**
 * "Die Bewertung stimmt nicht" (issue #164).
 *
 * The rule check is certain by design, and that certainty can stand in for a key nobody
 * verified — the external audit put `8` on `6 + 4` and watched the right answer `10` be
 * rejected. Issue #157 now catches that where arithmetic makes it decidable; everywhere
 * else the only one who can see it is the child in front of it, and she must be able to say
 * so without arguing with a tutor that is sure of itself.
 *
 * Three things happen, and all three are hers: the question leaves this result, it leaves
 * future practice (its key is suspect, so asking it again would repeat the mistake), and
 * the spaced repetition goes back to exactly what it held before this session reviewed it —
 * the history from earlier, undisputed sessions stays. Nothing is deleted: the judgement,
 * her answer and the key it was compared against stay on the row (`disputed_at`,
 * `practice_turns`, `items`), so what she disagreed with can still be read.
 *
 * What this never does is guess. `state_before` is written by `reviewItem` (fsrs.ts) and
 * says one of three things: a state to go back to, jsonb `null` ("there was nothing, so
 * remove the row"), or nothing at all — SQL NULL, meaning this session never reviewed the
 * question (a test, homework help). Then there is no effect of its own to take back, and
 * `item_states` is left exactly as it is rather than cleared on a hunch (rule 5).
 *
 * Different from "Frage passt nicht", which takes an unfit question out while it is still
 * open. This is about a judgement she has already been given.
 */
export async function disputeVerdict(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  itemId: string,
): Promise<SessionView> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    // The session row first, as every other writer does (`lockActiveSession`): this one also
    // touches `last_activity_at` at the end, and taking that lock last would cross an answer
    // committing at the same moment. A finished session keeps its verdicts disputable — the
    // result screen is where she reads them.
    const session = await tx.maybeOne<{ id: string }>(
      `select id from practice_sessions where id = $1 and learner_id = $2 for update`,
      [sessionId, learnerId],
    );
    if (!session) throw new AppError('not_found', 'Session not found');
    const si = await tx.maybeOne<{
      status: SessionItemRow['status'];
      flagged_at: Date | null;
      disputed_at: Date | null;
      state_before: Record<string, unknown> | null;
      /** False when nothing was ever recorded; true also for jsonb `null` (see above). */
      reviewed: boolean;
      origin: ItemRow['origin'];
      archived_at: Date | null;
    }>(
      `select si.status, si.flagged_at, si.disputed_at, si.state_before,
              si.state_before is not null as reviewed, i.origin, i.archived_at
         from session_items si
         join items i on i.id = si.item_id
        where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3
        for update of si, i`,
      [sessionId, itemId, learnerId],
    );
    if (!si) throw new AppError('not_found', 'Question not in this session');
    // Saying it twice changes nothing — and must not undo a second time.
    if (si.disputed_at) return;
    if (si.status === 'open') {
      throw new AppError('conflict', 'There is no judgement yet to disagree with', {
        reason: 'not_judged',
      });
    }
    // A card was never judged by anyone but her, so there is no judgement to disagree with.
    if (await isCardPass(tx, sessionId)) {
      throw new AppError('conflict', 'Nothing judged this card', {
        reason: 'dispute_not_allowed',
      });
    }
    // Her homework is helped with, never graded, so there is no verdict to dispute.
    if (si.origin === 'homework') {
      throw new AppError('conflict', 'Homework tasks are not judged', {
        reason: 'dispute_not_allowed',
      });
    }
    await tx.query(
      `update session_items set disputed_at = $3, flagged_at = coalesce(flagged_at, $3)
        where session_id = $1 and item_id = $2`,
      [sessionId, itemId, now],
    );
    // The key is suspect: asking it again would repeat the same wrong judgement.
    if (!si.archived_at) {
      await tx.query(`update items set archived_at = $2 where id = $1`, [itemId, now]);
    }
    // And the spaced repetition goes back to what it was before this review.
    if (si.state_before) {
      await tx.query(
        `update item_states set due = $3, stability = $4, difficulty = $5, elapsed_days = $6,
                                scheduled_days = $7, reps = $8, lapses = $9, state = $10,
                                last_review = $11, last_outcome = $12
          where item_id = $1 and learner_id = $2`,
        [
          itemId,
          learnerId,
          si.state_before.due,
          si.state_before.stability,
          si.state_before.difficulty,
          si.state_before.elapsed_days,
          si.state_before.scheduled_days,
          si.state_before.reps,
          si.state_before.lapses,
          si.state_before.state,
          si.state_before.last_review,
          si.state_before.last_outcome,
        ],
      );
    } else if (si.reviewed) {
      // Recorded, and it said there was nothing: back to never practised.
      await tx.query(`delete from item_states where item_id = $1 and learner_id = $2`, [
        itemId,
        learnerId,
      ]);
    }
    // Nothing recorded: this session never reviewed the question, so it left no effect of
    // its own. Whatever `item_states` holds comes from somewhere else and stays.
    await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
      sessionId,
      now,
    ]);
    // Buddy's picture of her questions and his prepared practice may hold it.
    await bumpContext(tx, learnerId);
  });
  return sessionView(deps.db, learnerId, sessionId, deps.storage, deps.now());
}

// ─────────────── lifecycle ───────────────

/**
 * Whether this session is a flashcard pass (issue #147). Read where the session row was
 * loaded without its columns — `disputeVerdict` locks on id alone, and widening that read
 * would change its lock shape for every ordinary dispute.
 */
async function isCardPass(db: Db, sessionId: string): Promise<boolean> {
  const row = await db.one<{ pass: string | null }>(
    `select pass from practice_sessions where id = $1`,
    [sessionId],
  );
  return row.pass === CARD_PASS;
}

/** The session row, locked, and still running — else 404 / 409 (one lock order: session first). */
export async function lockActiveSession(
  db: Db,
  learnerId: string,
  sessionId: string,
): Promise<SessionRow> {
  const s = await db.maybeOne<SessionRow>(
    `select ${SESSION_COLS} from practice_sessions
      where id = $1 and learner_id = $2 for update`,
    [sessionId, learnerId],
  );
  if (!s) throw new AppError('not_found', 'Session not found');
  if (s.status !== 'active') throw new AppError('conflict', 'Session has ended');
  return s;
}

/**
 * Finish the (locked, active) session: Buddy's step gets its evidence — done only if
 * something was answered, else back to prepared — and Buddy is woken to plan next.
 */
async function finishLocked(db: Db, learnerId: string, s: SessionRow, now: Date): Promise<void> {
  const counts = await db.one<{ answered: number; first_try: number; total: number }>(
    `select count(*) filter (where status <> 'open' and flagged_at is null)::int as answered,
            count(*) filter (where first_try_correct)::int as first_try,
            count(*)::int as total
       from session_items where session_id = $1`,
    [s.id],
  );
  await db.query(
    `update practice_sessions set status = 'finished', finished_at = $2, last_activity_at = $2 where id = $1`,
    [s.id, now],
  );
  if (s.step_id) {
    if (counts.answered > 0) {
      await db.query(
        `update buddy_steps set state = 'done', done_source = 'evidence', finished_at = $2, version = version + 1,
                                evidence = $3
          where id = $1 and state in ('planned','prepared','in_progress')`,
        [s.step_id, now, { session_id: s.id, ...counts }],
      );
    } else {
      // Nothing answered: the step is still open, not "done".
      await db.query(
        `update buddy_steps set state = 'prepared', version = version + 1 where id = $1 and state = 'in_progress'`,
        [s.step_id],
      );
    }
  }
  if (counts.answered > 0) {
    await emitEvent(db, learnerId, { type: 'session_finished', sessionId: s.id }, now, counts);
  }
  await bumpContext(db, learnerId);
}

/**
 * Once no question is open any more, the session is finished on the server — in the same
 * transaction as the answer that closed the last one, so a lost /finish call (network, a
 * killed app) never leaves an answered session invisible and Buddy's step without evidence
 * (audit H-12). The caller holds the session lock.
 *
 * Unless the rest of the questions is still being written (issue #220, trap 1): then "nothing
 * open" means she was faster than the generator, not that the run is over. Finishing here would
 * end a practice after three questions and hand Buddy's step its evidence, and the six questions
 * still being written would land in a run that already has a result.
 */
export async function finishIfComplete(
  db: Db,
  learnerId: string,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  const s = await db.maybeOne<SessionRow>(
    `select ${SESSION_COLS} from practice_sessions
      where id = $1 and learner_id = $2 for update`,
    [sessionId, learnerId],
  );
  if (!s || s.status !== 'active') return false;
  if (stillPreparing(s, now)) return false;
  const open = await db.one<{ n: number }>(
    `select count(*)::int as n from session_items where session_id = $1 and status = 'open'`,
    [sessionId],
  );
  if (open.n > 0) return false;
  await finishLocked(db, learnerId, s, now);
  return true;
}

/**
 * "Beenden". A test is handed in (untouched questions are reviewed as "nicht bearbeitet").
 * Homework help with open tasks is paused, never finished: the tasks stay where they are
 * and the sheet leads back to them (decision D-5, audit H-8). Everything else is finished,
 * with Buddy's step getting its evidence. Idempotent.
 *
 * A practice run whose rest is still being written is paused too (issue #220, trap 1). This
 * endpoint is what the screen calls BY ITSELF the moment it sees no open question — so while
 * the generator is still writing, that call means "she was faster", not "she is done", and
 * answering it with a result would throw the run away. A pause costs nothing: the run is
 * exactly where it was, and the questions still being written join it.
 */
export async function finishSession(
  deps: Deps,
  learnerId: string,
  sessionId: string,
): Promise<SessionView> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const s = await tx.maybeOne<SessionRow>(
      `select ${SESSION_COLS} from practice_sessions
        where id = $1 and learner_id = $2 for update`,
      [sessionId, learnerId],
    );
    if (!s) throw new AppError('not_found', 'Session not found');
    if (s.status !== 'active') return; // idempotent
    if (stillPreparing(s, now)) {
      await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
        sessionId,
        now,
      ]);
      return;
    }
    if (s.mode === 'help') {
      const open = await tx.one<{ n: number }>(
        `select count(*)::int as n from session_items where session_id = $1 and status = 'open'`,
        [sessionId],
      );
      if (open.n > 0) {
        await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
          sessionId,
          now,
        ]);
        return;
      }
    }
    await finishLocked(tx, learnerId, s, now);
  });
  return sessionView(deps.db, learnerId, sessionId, deps.storage, deps.now());
}
