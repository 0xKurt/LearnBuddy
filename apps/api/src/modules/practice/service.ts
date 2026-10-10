// Practice sessions: the useful result Buddy prepares. docs/architecture.md §Practice.
//
// A session is a fixed set of questions (chosen up front, so resuming shows
// the same ones). Each answer is checked in `answer.ts`; closing a question
// feeds FSRS once. Finishing a session records evidence on Buddy's step (done
// only if something was actually answered) and wakes Buddy to plan what comes
// next.

import {
  type CurriculumRegion,
  type Figure,
  type ItemKind,
  type SessionMode,
  type AnswerResponse,
  type SessionView,
  type TestMinutes,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { StorageGateway } from '../../storage/gateway.js';
import { isUniqueViolation, type Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import { finishIfComplete, finishLocked } from './finish.js';
import { sessionView } from './sessionView.js';
import {
  changeSession,
  loadSession,
  SESSION_COLS,
  stillPreparing,
  type SessionRow,
} from './sessionRow.js';
import { questionCountFor, selectPracticeItems, type PracticeRun } from './selection.js';

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
   * The program or query task this question's text, figure and key were computed from — the key
   * by RUNNING it (issue #262) — or null for everything else. At most one computed source per
   * question (migration 0104). Read through `codeTaskOf`.
   */
  code_task: unknown;
  /**
   * The text this question is about (Leseverständnis, issue #233), or null. Read through
   * `passageOf` (`practice/reading.ts`), never trusted as it stands. Optional: only the session
   * view and the answer path load it.
   */
  read_passage?: unknown;
  /** A part of a task in parts (#297), read through `taskPartOf`. Only the view and the answer path load it. */
  task_part?: unknown;
  /** A reading question's evidence: the words of its text the answer stands in (#233). */
  source_excerpt?: string | null;
  /**
   * She answers by tapping a place in the figure (issue #248, migration 0092): her tap is judged
   * exactly against the key's place (`tapVerdict`). Optional: only the session view and the answer
   * path load it.
   */
  tap?: boolean;
  /** „Warum stimmt das?" (#388, migration 0098), read through `whyOf`. Only the view loads it. */
  why?: unknown;
  /** A proven way, step by step (#298, migration 0101), read through `stepsOf`. */
  worked_steps?: unknown;
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
async function answerWithReply(
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
 * An answer's write, then her answer with Buddy's reply. When the write fails because a
 * concurrent duplicate of the same turn won (the unique `client_turn_id`), she gets that one's
 * result instead; anything else is the error it was.
 */
export async function settleTurn(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  itemId: string,
  clientTurnId: string,
  verdict: AnswerResponse['verdict'],
  write: () => Promise<unknown>,
): Promise<AnswerResponse> {
  try {
    await write();
  } catch (err) {
    return duplicateTurnOr(deps, learnerId, sessionId, clientTurnId, err);
  }
  return answerWithReply(deps, learnerId, sessionId, itemId, verdict);
}

async function duplicateTurnOr(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  clientTurnId: string,
  err: unknown,
): Promise<AnswerResponse> {
  if (isUniqueViolation(err)) {
    const r = await replayTurn(deps, learnerId, sessionId, clientTurnId);
    if (r) return r;
  }
  throw err;
}

// ─────────────── answer ───────────────

export async function nextSeq(db: Db, sessionId: string): Promise<number> {
  const r = await db.one<{ n: number }>(
    `select coalesce(max(seq), 0)::int as n from practice_turns where session_id = $1`,
    [sessionId],
  );
  return r.n + 1;
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
