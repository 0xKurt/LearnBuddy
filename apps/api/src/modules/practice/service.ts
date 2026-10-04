// Practice sessions: the useful result Buddy prepares. docs/architecture.md §Practice.
//
// A session is a fixed set of questions (chosen up front, so resuming shows
// the same ones). Each answer is checked by rules where exactness is
// decidable, otherwise by the tutor model with structured output; closing a
// question feeds FSRS once. Finishing a session records evidence on Buddy's
// step (done only if something was actually answered) and wakes Buddy to
// plan what comes next.

import {
  type AnswerRequest,
  type CurriculumRegion,
  type Figure,
  type ItemKind,
  type SessionMode,
  type AnswerResponse,
  type PracticeTurnView,
  type SessionView,
  type TestMinutes,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { StorageGateway } from '../../storage/gateway.js';
import { isUniqueViolation, type Db } from '../../lib/db.js';
import { AppError, isAppError } from '../../lib/errors.js';
import { localParts } from '../../lib/time.js';
import { learnerTimezone } from '../../lib/zone.js';
import { t } from '../../i18n/index.js';
import { callModel } from '../../llm/call.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { ageOn } from '../identity/model.js';
import { cautiousAt, curriculumLine, pointOf } from '../curriculum/state.js';
import { bumpContext } from '../buddy/plan.js';
import { pickAnswers, taskOf, untriedPicks } from './bars.js';
import { listenRefs, listenTaskOf } from './listen.js';
import { passageViews } from './reading.js';
import { checkDictation, dictationReply, nearlyRight, type DictationCheck } from './dictation.js';
import {
  differentNumber,
  formNoteFor,
  NEAR_MISS,
  noSingleSolution,
  plainMath,
  ruleCheck,
  type RuleVerdict,
  typoShapeFor,
} from './evaluate.js';
import {
  checkStaffLine,
  staffAgain,
  staffLineReply,
  staffTaskOf,
  writtenStaffLine,
  type StaffCheck,
} from './staff.js';
import { takeParts } from './partsAnswer.js';
import { finishIfComplete, finishLocked } from './finish.js';
import {
  changeSession,
  loadSession,
  lockActiveSession,
  SESSION_COLS,
  stillPreparing,
  type SessionRow,
} from './sessionRow.js';
import { settleTestClock, timerOf, timeUpError } from './testClock.js';
import {
  answerTextOf,
  structuredNamesPart,
  partsVia,
  secretsOf,
  structuredDecidedBy,
  structuredReply,
  structuredVerdict,
} from './structured.js';
import { reviewItem, type ItemOutcome } from './fsrs.js';
import { summarize } from './summary.js';
import { questionCountFor, selectPracticeItems, type PracticeRun } from './selection.js';
import { tapChoicesFor } from './tapChoices.js';
import {
  articleMissing,
  equationReply,
  locatedOrNotHelp,
  NEAR_MISS_REPLY,
  pathReply,
  TYPO_REPLY,
} from './nearMiss.js';
import { readAloudAllowed } from './readAloud.js';
import {
  imageOf,
  signImageUrls,
  subjectKindOf,
  surfaceFor,
  taskViewFor,
  type ItemImageRow,
} from './viewParts.js';
import { CARD_PASS, offersCardPass } from './cards.js';
import { DRILL_PASS } from './drill.js';
import { drillViewOf } from './drillView.js';
import { MAX_ACCEPTED, storedChoiceFigures, storedFigure } from './items.js';
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
  VALUE_CONFIRMED,
  givesAwayHomework,
  homeworkSolved,
  mentionsSolution,
  tutorContext,
  type TutorDecision as TutorDecisionT,
} from './tutor.js';
import type { LlmMessage } from '../../llm/gateway.js';

// Exported for the schema inventory (`evals/schema`, issue #281); nothing else reads it.
export const TUTOR_SCHEMA = toJsonSchema(TutorDecision);
/**
 * Dasselbe Schema, erweitert um die Pflichtelemente einer Schreibaufgabe (issue #211). Es steht
 * neben dem gewöhnlichen, statt es zu ersetzen: eine Frage ohne Rubrik soll das Feld nicht
 * sehen und nicht mit Ausgabe-Tokens bezahlen. Der AUFRUF ist derselbe eine, in beiden Fällen.
 */
// Exported for the schema inventory (`evals/schema`, issue #281); nothing else reads it.
export const RUBRIC_SCHEMA = toJsonSchema(RubricDecision);
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
  kind: ItemKind;
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
  /** multiple_choice: one picture per option, parallel to `choices` (issue #231). As stored:
   * read through `storedChoiceFigures` before it goes anywhere (issue #326). */
  choice_figures: unknown;
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
   * A structured item's task WITH its key (issues #228–#230, migration 0079), or null for every
   * other question. Read through `structuredTaskOf`, never trusted as it stands; it leaves the
   * server only as `task_view`, without the key.
   */
  task: unknown;
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
  /**
   * The text this question is about (Leseverständnis, issue #233), or null. Read through
   * `passageOf` (`practice/reading.ts`), never trusted as it stands. Optional: only the session
   * view and the answer path load it.
   */
  read_passage?: unknown;
  /** A reading question's evidence: the words of its text the answer stands in (#233). */
  source_excerpt?: string | null;
};

export type SessionItemRow = {
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
  pass?: 'cards' | 'drill' | null;
  /** The range of a Kopfrechnen round (issue #243); set exactly when `pass` is 'drill'. */
  drill?: unknown;
  materialId?: string | null;
  title?: string | null;
  clientRequestId?: string | null;
  /**
   * Until when the rest of the questions is still coming (issue #220). Only the split practice
   * start sets it; every other run is complete when it is created.
   */
  itemsPendingUntil?: Date | null;
  /** A test she asked to sit with time (issue #241); its clock starts when she opens it. */
  timeLimitMinutes?: TestMinutes | null;
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
                                    material_id, title, client_request_id, pass, items_pending_until,
                                    drill, time_limit_minutes)
     values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
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
      opts.drill ?? null,
      opts.timeLimitMinutes ?? null,
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
export function learnsFsrs(mode: SessionMode): boolean {
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
export function offersHintButton(mode: SessionMode): boolean {
  return mode === 'practice' || mode === 'help';
}

/**
 * "Lösung zeigen" only after a real try or a hint, never from the first second (user feedback
 * #8); a spoken sentence can always be skipped. Never in homework, never while a test runs.
 */
export function revealReady(
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
 * Her run was active just now; with its last question closed it finishes here, in the same
 * transaction, so a lost /finish never leaves it looking unfinished (audit H-12).
 */
export async function touchRun(
  db: Db,
  learnerId: string,
  sessionId: string,
  now: Date,
): Promise<void> {
  await db.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
    sessionId,
    now,
  ]);
  await finishIfComplete(db, learnerId, sessionId, now);
}

/** An answer as the screen gets it: the session, the verdict, Buddy's newest reply to it. */
export async function answerWithReply(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  itemId: string,
  verdict: AnswerResponse['verdict'],
): Promise<AnswerResponse> {
  const view = await sessionView(deps.db, learnerId, sessionId, deps.storage, deps.now());
  const reply = [...view.turns]
    .reverse()
    .find((tr) => tr.item_id === itemId && tr.role === 'tutor');
  if (!reply) throw new AppError('internal', 'reply missing');
  return { session: view, verdict, reply };
}

/**
 * A request of hers in a run: the same `client_turn_id` again gets what the first one got;
 * otherwise the run as it stands, for the request to go on with.
 */
export async function replayOrLoad(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  clientTurnId: string,
): Promise<{ replayed: AnswerResponse } | { session: SessionRow }> {
  const replayed = await replayTurn(deps, learnerId, sessionId, clientTurnId);
  return replayed ? { replayed } : { session: await loadSession(deps.db, learnerId, sessionId) };
}

/** `replay` for a request of hers: the same turn sent again gets the first one's answer. */
export function replayTurn(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  clientTurnId: string,
): Promise<AnswerResponse | null> {
  return replay(deps.db, learnerId, sessionId, clientTurnId, deps.storage, deps.now());
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
  // A Diktat's word stands in the solution card right under this line (issue #242): said here
  // too, it would be the same word twice (#286). The line says what to do with it instead.
  if (i.kind === 'spelling_dictation') return t(locale, 'practice.dictation.shown');
  return t(locale, 'practice.solution_is', { answer: shownSolution(i) });
}

// ─────────────── view ───────────────

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
    SessionItemRow &
      ItemRow &
      ItemImageRow & { archived_at: Date | null; subject_kind: string | null }
  >(
    `select si.item_id, si.position, si.status, si.attempts, si.hints_used, si.prepared_hints_used,
            si.first_try_correct, si.flagged_at, si.deferred_at, si.answered_by, si.disputed_at,
            i.id, i.kind, i.prompt, i.answer, i.accepted_answers, i.unit, i.choices, i.correct_choice,
            i.topic, i.material_id, i.origin, i.lang, i.prompt_lang, i.figure, i.hints, i.worked_solution,
            i.bar_task, i.task, i.listen_task, i.staff_task, i.spelling, i.archived_at,
            i.choice_figures, i.read_passage, i.source_excerpt,
            mi.storage_path as image_path, mi.width as image_width, mi.height as image_height,
            mi.label as image_label, sub.kind as subject_kind
       from session_items si join items i on i.id = si.item_id
       left join material_images mi on mi.id = i.image_id
       left join subjects sub on sub.id = i.subject_id
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
  // The text of each reading question (issue #233); where its answer stands, once that is shown.
  const reading = passageViews(items, solutionShown);
  return {
    id: s.id,
    mode: s.mode,
    reveal_allowed: revealAllowed,
    status: s.status,
    // The rest of the questions is still being written (issue #220). The app shows no total
    // that would still change, and does not read "no open question" as "this run is over".
    preparing: active && stillPreparing(s, now),
    timer: timerOf(s, now),
    title: title?.title ?? '',
    items: items.map((i) => ({
      item: {
        id: i.id,
        kind: i.kind,
        prompt: i.prompt,
        choices: i.choices,
        // The options' pictures: data the app draws, never the key (that is the index) — read
        // back through the checks they were written under, or not sent at all (issue #326).
        choice_figures: storedChoiceFigures(i),
        unit: i.unit,
        topic: i.topic,
        origin: i.origin,
        lang: i.lang,
        prompt_lang: i.prompt_lang,
        // Which keys the answer field offers is the app's choice, made from this (issue #239).
        subject_kind: subjectKindOf(i.subject_kind),
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
        // The parts of a structured question (issues #228–#230), without the key, for as long as
        // the question is open — like the fraction bar above, and for the same reason: once it
        // is closed the parts would be a control with nothing left to do, and her answer and the
        // solution both stand in the thread.
        task_view: i.status === 'open' && active ? taskViewFor(i) : null,
        // The spoken stimulus, as the alias of its recording and nothing more (issue #210).
        // It stays while the question is closed: hearing the text again next to the words of
        // it is exactly what a listening task is reviewed with.
        listen: hearing.has(i.id) ? { ref: hearing.get(i.id)! } : null,
        // The text she reads it from, above the question while she answers (issue #233).
        passage: reading.get(i.id) ?? null,
        // The "Vorlesen" button (issue #238): code decides, from what the question is, whether
        // hearing it would hand over the solution. A card is read by its own "Anhören".
        read_aloud: !cardPass && readAloudAllowed(i),
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
      // A Diktat's recording IS its key (issue #242): the solution above already says it, so it is
      // not repeated as a "what you heard" text.
      listen_transcript:
        solutionShown(i) && i.kind !== 'spelling_dictation'
          ? (listenTaskOf(i.listen_task)?.text ?? null)
          : null,
    })),
    turns: turns.map(({ created_at, ...tr }) => ({ ...tr, created_at: created_at.toISOString() })),
    current_item_id: active ? (current?.id ?? null) : null,
    summary: s.status === 'finished' ? summarize(items) : null,
    card_pass: cardPass,
    // Whether this finished run has words to go through as cards. One rule, in cards.ts, so
    // the offer on the result screen and what the pass then holds can never disagree.
    card_pass_offered: offersCardPass(s, items),
    // A Kopfrechnen round (issue #243): the range, the pad, the task just answered, the line.
    drill: s.pass === DRILL_PASS ? await drillViewOf(db, s) : null,
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

async function replay(
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

export async function answerItem(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: AnswerRequest,
  /** "Tipp" with no prepared hint left: a request for help, never an answer to grade. */
  opts: { hintRequest?: boolean } = {},
): Promise<AnswerResponse> {
  const hintRequest = opts.hintRequest === true;
  const first = await replayOrLoad(deps, learner.id, sessionId, input.client_turn_id);
  if ('replayed' in first) return first.replayed;
  const { session } = first;
  const now = deps.now();
  // A timed test (issue #241): an answer that arrives after the time is up is not graded — no
  // rule, no model, no turn — and the test ends with what she had answered in time.
  if ((await settleTestClock(deps.db, learner.id, sessionId, now)) === 'time_up') {
    throw timeUpError();
  }
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  // One path per session (issue #147): a flashcard pass is turned over, never answered,
  // hinted at or revealed. The pass was decided when it started, so the server refuses the
  // other way in rather than letting two kinds of evidence meet on one question.
  if (session.pass === CARD_PASS) {
    throw new AppError('conflict', 'These are cards: you say yourself whether you knew it', {
      reason: 'use_cards',
    });
  }
  // A Kopfrechnen round (issue #243) is answered through its own door, which checks by code
  // and never reaches the tutor; this path would call the model on a second miss.
  if (session.pass === DRILL_PASS) {
    throw new AppError('conflict', 'A quick round is answered on its pad', {
      reason: 'use_drill',
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
  // A Diktat has no written hint (issue #242): a hint about a word she is to spell would spell it,
  // and writing one would be a model call. The help is hearing it again, slower — on the card.
  if (hintRequest && item.kind === 'spelling_dictation') {
    throw new AppError('conflict', 'The help here is hearing it again', { reason: 'no_hints' });
  }

  // ── a STRUCTURED answer (issues #228–#232): parts, judged by code (partsAnswer.ts) ──
  const { structured, partsCheck } = await takeParts(deps, item, {
    parts: input.parts,
    hintRequest,
    learnerId: learner.id,
  });

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
  /** Ihre Zeile in Worten, damit der Gesprächsfaden lesbar bleibt (wie `answerTextOf`). */
  const staffWritten =
    staffCheck !== null ? writtenStaffLine(learner.locale, input.text ?? '') : null;
  const text =
    structured && input.parts && partsCheck
      ? // Her arrangement in one line, so the thread, the tutor history and a disputed judgement
        // all see what she actually did.
        answerTextOf(structured, input.parts)
      : (staffWritten ??
        input.text ??
        (input.choice != null && item.choices ? (item.choices[input.choice] ?? null) : null));
  if (!text) throw new AppError('invalid_input', 'Empty answer');
  // The reviewed task this question was computed from, if any (issue #162).
  const barTask = taskOf(item.bar_task);
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
  // A Diktat (issue #242) is checked by code alone, exactly, against its key — and a miss is
  // answered with the PLACE (`practice/dictation.ts`), never by the tutor. It is no listening
  // task in the sense of #210: there the spelling of what she heard does NOT count, here it is the
  // whole point. So `listening` below stays false for it.
  const dictationCheck: DictationCheck | null =
    !hintRequest && item.kind === 'spelling_dictation'
      ? checkDictation(item.answer, input.text ?? '')
      : null;
  const listening = listenTask !== null && item.kind !== 'spelling_dictation';
  // A request for help is not an answer: nothing for the rules to check.
  // Two checks that code does ENTIRELY on its own and that therefore come before the key
  // comparison: every part of a structured answer (issues #228–#230), right or not yet right,
  // and a written note line (issue #226), which ends in `parts_left` when some of it holds.
  // Neither ever asks a model.
  const byOtherRules: RuleVerdict = hintRequest
    ? 'unknown'
    : partsCheck !== null
      ? partsCheck.correct
        ? 'correct'
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
            { ...item, form_free: barTask !== null, listening },
            { text: input.text ?? null, choice: input.choice ?? null },
          );
  // A Diktat is decided by its own exact check (issue #242), never by the key comparison above.
  const byRules: RuleVerdict =
    dictationCheck !== null ? (dictationCheck.correct ? 'correct' : 'incorrect') : byOtherRules;
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
      // A cloze gap the model judged (issue #232) makes it the model's verdict, honestly.
      evaluatedBy: partsCheck ? structuredDecidedBy(partsCheck) : 'rule',
      reply: t(
        learner.locale,
        session.mode === 'help' ? 'practice.help_solved' : 'practice.correct',
      ),
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
  } else if (partsCheck && structuredVerdict(partsCheck) === null) {
    // A cloze gap nobody could judge (no model, issue #232) and nothing else wrong: no
    // verdict is claimed and no try is counted (CLAUDE.md rule 5).
    judged = {
      verdict: null,
      evaluatedBy: null,
      reply: t(learner.locale, 'practice.cannot_check'),
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
      evaluatedBy: partsCheck ? structuredDecidedBy(partsCheck) : 'rule',
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
  } else if (partsCheck && rule === 'incorrect') {
    // A structured answer that is not right yet (issues #228–#230): code knows WHERE it stops
    // being right, so it says so — every time, not only on the first try, and never through a
    // model (0 model calls per answer). The third miss above shows the solution; a test above
    // says nothing until the end.
    // A cloze whose gaps are only off by spelling is a near miss, not wrong (issue #232);
    // its reply names her words, gap by gap.
    judged = {
      verdict: structuredVerdict(partsCheck) ?? 'incorrect',
      evaluatedBy: structuredDecidedBy(partsCheck),
      reply: structuredReply(learner.locale, partsCheck, item.attempts),
      // A match names its wrong link from the second miss on: that is a hint (#229).
      gaveHint: structuredNamesPart(partsCheck, item.attempts),
      revealed: false,
    };
  } else if (dictationCheck !== null && !dictationCheck.correct && rule === 'incorrect') {
    // A Diktat she did not get right yet (issue #242): code names the place — "Doppel-m fehlt",
    // "groß schreiben" — at every try, never through a model (0 model calls per answer). Her word
    // stays hers in the sentence; the key comes with the third miss above or "Lösung zeigen".
    judged = {
      verdict: nearlyRight(dictationCheck.spot) ? 'partially_correct' : 'incorrect',
      evaluatedBy: 'rule',
      reply: dictationReply(learner.locale, dictationCheck.spot),
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
      const tz = await learnerTimezone(deps.db, learner.id);
      const tutorContents: LlmMessage[] = [
        {
          role: 'user',
          parts: [
            {
              text: tutorContext({
                // A listening item says so (#210; never a Diktat, #242); a structured item's
                // question is more than its instruction: a cloze's text with its gaps (#232).
                item: {
                  ...item,
                  listening,
                  ...(structured ? { prompt: secretsOf(structured, item.prompt).visible } : {}),
                },
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
                // The value is right and only the form differs: what code read off the two
                // syntax trees, so the tutor decides about the question, not the algebra (#235).
                formNote: rule === 'other_form' ? formNoteFor(item, text) : null,
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
        const r = await callModel(deps, learner.id, localParts(now, tz).date, {
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
        const held = enforceTutorInvariants(
          d,
          rule,
          articleMissing(rule, item),
          // At a place where the states disagree and no rule applies to her, a confident
          // "wrong" is a claim nobody can back: it becomes "partly right" (issue #214).
          curriculumPoint !== null &&
            cautiousAt(curriculumPoint, learner.curriculum_region, learner.grade),
        );
        // Code confirmed the value and the model still said "wrong" (issue #227, finding 1).
        // The verdict is held at "partly right" above; the words it wrote for "wrong" would
        // contradict that, so the reply is the app's own: the value holds, the form is open.
        return VALUE_CONFIRMED.has(rule) &&
          d.verdict === 'incorrect' &&
          held.verdict !== 'incorrect'
          ? { ...held, reply: t(learner.locale, 'practice.same_value'), gave_hint: false }
          : held;
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
    // A cloze reply quotes HER words and is code's, even where the model judged a gap
    // (issue #232); only a reply the tutor wrote can give a key away — any gap's key.
    const leaks = (reply: string) =>
      structured
        ? secretsOf(structured, item.prompt).secrets.some((s) =>
            mentionsSolution(reply, s, secretsOf(structured, item.prompt).visible),
          )
        : mentionsSolution(reply, shownSolution(item), item.prompt);
    if (
      judged.evaluatedBy === 'model' &&
      !partsCheck &&
      judged.verdict !== 'correct' &&
      item.hints_used < 2 &&
      (judged.revealed || leaks(judged.reply))
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
          // Arranging parts is tapping (issue #163), unless the app says otherwise — and a
          // cloze without a word bank can only be typed (issue #232).
          input.via ?? (partsCheck && structured ? partsVia(structured) : 'typed'),
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
      await touchRun(tx, learner.id, sessionId, now);
    });
  } catch (err) {
    // A concurrent duplicate of the same answer won: return its result.
    if (isUniqueViolation(err)) {
      const r = await replayTurn(deps, learner.id, sessionId, input.client_turn_id);
      if (r) return r;
    }
    throw err;
  }
  return answerWithReply(deps, learner.id, sessionId, item.id, judged.verdict);
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
  await changeSession(
    deps,
    learnerId,
    sessionId,
    async (tx, s, now) => {
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
    },
    { active: false },
  );
  return sessionView(deps.db, learnerId, sessionId, deps.storage, deps.now());
}
