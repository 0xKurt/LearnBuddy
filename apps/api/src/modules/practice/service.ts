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
import { emitEvent } from '../buddy/events.js';
import { bumpContext } from '../buddy/plan.js';
import { differentNumber, NEAR_MISS, plainMath, ruleCheck, type RuleVerdict } from './evaluate.js';
import { reviewItem, type ItemOutcome } from './fsrs.js';
import { summarize } from './summary.js';
import { questionCountFor, selectPracticeItems } from './selection.js';
import { tapChoicesFor } from './tapChoices.js';
import {
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
const MATERIAL_CHARS = 4000;

export type PracticeLearner = {
  id: string;
  display_name: string;
  locale: string;
  level: string;
  grade: number | null;
  birth_date: string;
};

export type ItemRow = {
  id: string;
  kind: 'short' | 'long' | 'numeric' | 'multiple_choice' | 'formula' | 'vocab' | 'speak';
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
};

export type SessionRow = {
  id: string;
  learner_id: string;
  step_id: string | null;
  goal_id: string | null;
  mode: SessionMode;
  status: 'active' | 'finished' | 'abandoned';
  title: string | null;
};

/**
 * The session columns as code reads them. Sessions of the removed explain mode (issue #70)
 * are served as plain practice — their stored `mode` and `intro` stay in the database
 * untouched (migrations are immutable), but nothing shows or writes them any more.
 */
export const SESSION_COLS = `id, learner_id, step_id, goal_id,
       case when mode = 'explain' then 'practice' else mode end as mode, status, title`;

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
  /** How the closing answer was given (issue #163): typed, tapped or spoken. */
  answered_by?: 'typed' | 'tapped' | 'spoken' | null;
};

// ─────────────── start ───────────────

export type SessionOptions = {
  stepId: string | null;
  goalId: string | null;
  mode: SessionMode;
  materialId?: string | null;
  title?: string | null;
  clientRequestId?: string | null;
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
                                    material_id, title, client_request_id)
     values ($1, $2, $3, $4, $5, $5, $6, $7, $8) returning id`,
    [
      learnerId,
      opts.stepId,
      opts.goalId,
      opts.mode,
      now,
      opts.materialId ?? null,
      opts.title ?? null,
      opts.clientRequestId ?? null,
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

/** Practice started by the learner from their material (library). */
export async function startManual(
  deps: Deps,
  learnerId: string,
  scope: { subjectId: string | null; materialId: string | null; goalId: string | null },
  mode: 'practice' | 'test',
): Promise<string> {
  const now = deps.now();
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
    // A homework sheet is helped with, not drilled: it leads to its help session (audit H-7).
    const help = await helpSessionFor(deps, learnerId, scope.materialId);
    if (help) return help;
  }
  const itemIds = await selectPracticeItems(
    deps.db,
    learnerId,
    scope,
    [],
    questionCountFor(12),
    now,
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

/** The worked solution when prepared, otherwise the plain solution. */
function workedReply(
  locale: string,
  i: Pick<ItemRow, 'kind' | 'answer' | 'choices' | 'correct_choice' | 'unit' | 'worked_solution'>,
): string {
  return i.worked_solution
    ? `${t(locale, 'practice.worked_intro')} ${i.worked_solution}`
    : t(locale, 'practice.solution_is', { answer: shownSolution(i) });
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
): Promise<SessionView> {
  const s = await loadSession(db, learnerId, sessionId);
  const items = await db.query<SessionItemRow & ItemRow & ItemImageRow>(
    `select si.item_id, si.position, si.status, si.attempts, si.hints_used, si.prepared_hints_used,
            si.first_try_correct, si.flagged_at, si.deferred_at, si.answered_by,
            i.id, i.kind, i.prompt, i.answer, i.accepted_answers, i.unit, i.choices, i.correct_choice,
            i.topic, i.material_id, i.origin, i.lang, i.prompt_lang, i.figure, i.hints, i.worked_solution,
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
  // Her own words from this very set, so tapping never offers one she has not met
  // (issue #147). Computed here, not stored: the key stays the typed answer. Her app
  // language decides whether tapping is offered at all — recognising, not producing.
  const own = await db.one<{ locale: string }>(`select locale from learners where id = $1`, [
    learnerId,
  ]);
  const vocabInSet = items
    .filter((i) => i.kind === 'vocab')
    .map((i) => ({ id: i.id, answer: i.answer, lang: i.lang }));
  // Homework never shows the solution; a test shows the answers once it is finished.
  const revealAllowed = s.mode !== 'help' && !(s.mode === 'test' && active);
  // A finished test shows every solution, also of the questions she never got to (audit M-36).
  const testOver = s.mode === 'test' && s.status === 'finished';
  return {
    id: s.id,
    mode: s.mode,
    reveal_allowed: revealAllowed,
    status: s.status,
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
        figure: i.figure,
        image: imageOf(i, imageUrls),
        // A test asks her to produce, so nothing is offered to tap there.
        tap_choices: s.mode === 'test' ? null : tapChoicesFor(i, vocabInSet, own.locale),
      },
      status: i.status,
      attempts: i.attempts,
      hints_used: i.hints_used,
      hints_left:
        i.status === 'open' && active && givesHints(s.mode)
          ? Math.max(0, i.hints.length - i.prepared_hints_used)
          : 0,
      hint_available:
        i.status === 'open' && active && offersHintButton(s.mode) && i.kind !== 'speak',
      reveal_available: i.status === 'open' && active && revealReady(s.mode, i),
      deferred: i.status === 'open' && s.mode === 'help' && Boolean(i.deferred_at),
      // Never leak the solution of an open question, nor ever in help mode (homework).
      answer:
        (i.status === 'open' && !testOver) || !revealAllowed
          ? null
          : i.kind === 'multiple_choice' && i.choices && i.correct_choice !== null
            ? (i.choices[i.correct_choice] ?? i.answer)
            : `${i.answer}${i.unit ? ` ${i.unit}` : ''}`,
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
): Promise<AnswerResponse | null> {
  const learnerTurn = await db.maybeOne<{ seq: number; verdict: AnswerResponse['verdict'] }>(
    `select seq, verdict from practice_turns where session_id = $1 and client_turn_id = $2`,
    [sessionId, clientTurnId],
  );
  if (!learnerTurn) return null;
  const view = await sessionView(db, learnerId, sessionId, storage);
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
const NEAR_MISS_REPLY: Partial<Record<RuleVerdict, MessageKey>> = {
  spelling: 'practice.spelling',
  close: 'practice.accents',
  missing_word: 'practice.missing_word',
};

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
  const replayed = await replay(deps.db, learner.id, sessionId, input.client_turn_id, deps.storage);
  if (replayed) return replayed;

  const session = await loadSession(deps.db, learner.id, sessionId);
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
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

  const text =
    input.text ??
    (input.choice != null && item.choices ? (item.choices[input.choice] ?? null) : null);
  if (!text) throw new AppError('invalid_input', 'Empty answer');
  if (item.kind === 'speak') {
    throw new AppError('conflict', 'This question is answered by speaking', {
      reason: 'use_speak',
    });
  }
  // A request for help is not an answer: nothing for the rules to check.
  const byRules: RuleVerdict = hintRequest
    ? 'unknown'
    : ruleCheck(item, {
        text: input.text ?? null,
        choice: input.choice ?? null,
      });
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
  let onlyOneLeft = false;
  if (
    givesHints(session.mode) &&
    item.kind === 'multiple_choice' &&
    item.choices &&
    rule === 'incorrect'
  ) {
    const wrong = await deps.db.query<{ text: string }>(
      `select distinct text from practice_turns
        where session_id = $1 and item_id = $2 and role = 'learner' and verdict = 'incorrect'`,
      [sessionId, item.id],
    );
    const tried = new Set([...wrong.map((w) => w.text), text]);
    onlyOneLeft = item.choices.filter((c) => !tried.has(c)).length <= 1;
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
  } else if (NEAR_MISS.has(rule) && !articleMissing(rule, item) && session.mode !== 'help') {
    // A near miss needs no model: a fixed, kind answer at once. A slip shows the
    // spelling and stays open, so she types it right herself (never in homework,
    // which never shows the solution — there the tutor judges).
    judged = {
      verdict: 'partially_correct',
      evaluatedBy: 'rule',
      reply:
        rule === 'typo'
          ? t(learner.locale, 'practice.typo', { answer: plainMath(item.answer) })
          : t(learner.locale, NEAR_MISS_REPLY[rule] ?? 'practice.accents'),
      gaveHint: false,
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
                item,
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
                material: item.extracted_text ? item.extracted_text.slice(0, MATERIAL_CHARS) : null,
                preferences: preferences.map((p) => p.statement),
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
      const askTutor = async (messages: LlmMessage[]) => {
        const r = await callModel(deps, learner.id, localParts(now, tz.timezone).date, {
          purpose: 'tutor',
          tier: 'smart',
          promptVersion: TUTOR_PROMPT_VERSION,
          system: TUTOR_SYSTEM,
          contents: messages,
          schema: TUTOR_SCHEMA,
          maxOutputTokens: 1024,
          temperature: 0.3,
          timeoutMs: 20_000,
          thinkingBudget: 0,
        });
        const parsed = TutorDecision.safeParse(r.json);
        if (!parsed.success) throw new Error('tutor output invalid');
        return enforceTutorInvariants(parsed.data, rule, articleMissing(rule, item));
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
      if (
        judged.evaluatedBy === 'model' &&
        judged.verdict === 'correct' &&
        rule === 'unknown' &&
        (item.kind === 'vocab' || item.kind === 'short') &&
        session.mode !== 'help' &&
        text.trim().length <= 80
      ) {
        await tx.query(
          `update items set accepted_answers = array_append(accepted_answers, $3)
            where id = $1 and learner_id = $2 and not ($3 = any(accepted_answers))`,
          [item.id, learner.id, text.trim()],
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
      if (status !== 'open' && learnsFsrs(session.mode)) {
        // What the spaced repetition held BEFORE this review (issue #164), so a judgement
        // she says is wrong can be taken back without costing her the history from
        // earlier sessions. Null means the question had none yet.
        const before = await tx.maybeOne(
          `select due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses,
                  state, last_review, last_outcome
             from item_states where item_id = $1 and learner_id = $2`,
          [item.id, learner.id],
        );
        await tx.query(
          `update session_items set state_before = $3::jsonb
            where session_id = $1 and item_id = $2`,
          [sessionId, item.id, before ? JSON.stringify(before) : null],
        );
        await reviewItem(
          tx,
          learner.id,
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
      const r = await replay(deps.db, learner.id, sessionId, input.client_turn_id, deps.storage);
      if (r) return r;
    }
    throw err;
  }
  const view = await sessionView(deps.db, learner.id, sessionId, deps.storage);
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
  const replayed = await replay(deps.db, learner.id, sessionId, input.client_turn_id, deps.storage);
  if (replayed) return replayed;
  const session = await loadSession(deps.db, learner.id, sessionId);
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  if (!offersHintButton(session.mode)) {
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
      const r = await replay(deps.db, learner.id, sessionId, input.client_turn_id, deps.storage);
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
    if (learnsFsrs(s.mode)) await reviewItem(tx, learnerId, itemId, 'revealed', now);
    await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
      sessionId,
      now,
    ]);
    await finishIfComplete(tx, learnerId, sessionId, now);
  });
  return sessionView(deps.db, learnerId, sessionId, deps.storage);
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
  return sessionView(deps.db, learnerId, sessionId, deps.storage);
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
  return sessionView(deps.db, learnerId, sessionId, deps.storage);
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
 * the history from earlier, undisputed sessions stays.
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
    const si = await tx.maybeOne<{
      status: SessionItemRow['status'];
      flagged_at: Date | null;
      disputed_at: Date | null;
      state_before: Record<string, unknown> | null;
      origin: ItemRow['origin'];
      archived_at: Date | null;
    }>(
      `select si.status, si.flagged_at, si.disputed_at, si.state_before, i.origin, i.archived_at
         from session_items si
         join items i on i.id = si.item_id
         join practice_sessions ps on ps.id = si.session_id
        where si.session_id = $1 and si.item_id = $2 and ps.learner_id = $3 and i.learner_id = $3
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
    } else {
      // There was nothing before this session: the question goes back to never practised.
      await tx.query(`delete from item_states where item_id = $1 and learner_id = $2`, [
        itemId,
        learnerId,
      ]);
    }
    await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
      sessionId,
      now,
    ]);
    // Buddy's picture of her questions and his prepared practice may hold it.
    await bumpContext(tx, learnerId);
  });
  return sessionView(deps.db, learnerId, sessionId, deps.storage);
}

// ─────────────── lifecycle ───────────────

/** The session row, locked, and still running — else 404 / 409 (one lock order: session first). */
async function lockActiveSession(
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
  return sessionView(deps.db, learnerId, sessionId, deps.storage);
}
