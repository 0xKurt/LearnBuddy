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
  SessionMode,
  AnswerResponse,
  PracticeSummary,
  PracticeTurnView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { isUniqueViolation, type Db } from '../../lib/db.js';
import { AppError, isAppError } from '../../lib/errors.js';
import { localParts } from '../../lib/time.js';
import { t } from '../../i18n/index.js';
import { callModel } from '../../llm/call.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { ageOn } from '../identity/model.js';
import { bumpContext } from '../buddy/plan.js';
import { enqueueJob } from '../scheduler/jobs.js';
import { ruleCheck, type RuleVerdict } from './evaluate.js';
import { reviewItem, type ItemOutcome } from './fsrs.js';
import { questionCountFor, selectPracticeItems } from './selection.js';
import {
  TUTOR_PROMPT_VERSION,
  TUTOR_SYSTEM,
  TutorDecision,
  enforceTutorInvariants,
  givesAwayHomework,
  homeworkSolved,
  tutorContext,
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

type ItemRow = {
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
};

type SessionRow = {
  id: string;
  learner_id: string;
  step_id: string | null;
  goal_id: string | null;
  mode: SessionMode;
  status: 'active' | 'finished' | 'abandoned';
  title: string | null;
  intro: string | null;
};

type SessionItemRow = {
  item_id: string;
  position: number;
  status: 'open' | 'correct' | 'revealed' | 'skipped';
  attempts: number;
  hints_used: number;
  first_try_correct: boolean | null;
};

// ─────────────── start ───────────────

export type SessionOptions = {
  stepId: string | null;
  goalId: string | null;
  mode: SessionMode;
  materialId?: string | null;
  title?: string | null;
  intro?: string | null;
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
                                    material_id, title, intro, client_request_id)
     values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9) returning id`,
    [
      learnerId,
      opts.stepId,
      opts.goalId,
      opts.mode,
      now,
      opts.materialId ?? null,
      opts.title ?? null,
      opts.intro ?? null,
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
  return deps.db.tx(async (tx) => {
    const id = await createSession(
      tx,
      learnerId,
      itemIds,
      { stepId: null, goalId: scope.goalId, mode },
      now,
    );
    await bumpContext(tx, learnerId);
    return id;
  });
}

/** Practice and explanations feed spaced repetition; tests and homework do not. */
function learnsFsrs(mode: SessionMode): boolean {
  return mode === 'practice' || mode === 'explain';
}

// ─────────────── view ───────────────

async function loadSession(db: Db, learnerId: string, sessionId: string): Promise<SessionRow> {
  const s = await db.maybeOne<SessionRow>(
    `select id, learner_id, step_id, goal_id, mode, status, title, intro from practice_sessions
      where id = $1 and learner_id = $2`,
    [sessionId, learnerId],
  );
  if (!s) throw new AppError('not_found', 'Session not found');
  return s;
}

export async function sessionView(
  db: Db,
  learnerId: string,
  sessionId: string,
): Promise<SessionView> {
  const s = await loadSession(db, learnerId, sessionId);
  const items = await db.query<SessionItemRow & ItemRow>(
    `select si.item_id, si.position, si.status, si.attempts, si.hints_used, si.first_try_correct,
            i.id, i.kind, i.prompt, i.answer, i.accepted_answers, i.unit, i.choices, i.correct_choice,
            i.topic, i.material_id, i.origin, i.lang, i.prompt_lang, i.figure
       from session_items si join items i on i.id = si.item_id
      where si.session_id = $1 order by si.position`,
    [sessionId],
  );
  const turns = await db.query<{
    id: string;
    item_id: string;
    role: 'learner' | 'tutor';
    text: string;
    verdict: PracticeTurnView['verdict'];
    pronunciation: PracticeTurnView['pronunciation'];
    created_at: Date;
  }>(
    `select id, item_id, role, text, verdict, pronunciation, created_at from practice_turns
      where session_id = $1 order by seq`,
    [sessionId],
  );
  const title = await db.maybeOne<{ title: string }>(
    `select coalesce(ps.title, g.title, st.title) as title from practice_sessions ps
       left join buddy_goals g on g.id = ps.goal_id left join buddy_steps st on st.id = ps.step_id
      where ps.id = $1`,
    [sessionId],
  );
  const current = items.find((i) => i.status === 'open');
  const revealAllowed = s.mode !== 'help';
  return {
    id: s.id,
    mode: s.mode,
    intro: s.intro,
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
      },
      status: i.status,
      attempts: i.attempts,
      hints_used: i.hints_used,
      // Never leak the solution of an open question, nor ever in help mode (homework).
      answer:
        i.status === 'open' || !revealAllowed
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
      created_at: tr.created_at.toISOString(),
    })),
    current_item_id: s.status === 'active' ? (current?.id ?? null) : null,
    summary: s.status === 'finished' ? summarize(items) : null,
  };
}

function summarize(items: Array<SessionItemRow & { topic: string | null }>): PracticeSummary {
  const closed = items.filter((i) => i.status !== 'open');
  const byTopic = new Map<string, { secure: number; shaky: number }>();
  for (const i of closed) {
    if (!i.topic) continue;
    const t = byTopic.get(i.topic) ?? { secure: 0, shaky: 0 };
    if (i.status === 'correct' && i.first_try_correct) t.secure++;
    else t.shaky++;
    byTopic.set(i.topic, t);
  }
  return {
    answered: closed.length,
    first_try: closed.filter((i) => i.first_try_correct).length,
    secure_topics: [...byTopic.entries()].filter(([, v]) => v.shaky === 0).map(([k]) => k),
    shaky_topics: [...byTopic.entries()].filter(([, v]) => v.shaky > 0).map(([k]) => k),
  };
}

// ─────────────── answer ───────────────

async function nextSeq(db: Db, sessionId: string): Promise<number> {
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
): Promise<AnswerResponse | null> {
  const learnerTurn = await db.maybeOne<{ seq: number; verdict: AnswerResponse['verdict'] }>(
    `select seq, verdict from practice_turns where session_id = $1 and client_turn_id = $2`,
    [sessionId, clientTurnId],
  );
  if (!learnerTurn) return null;
  const view = await sessionView(db, learnerId, sessionId);
  const reply = await db.maybeOne<{ id: string }>(
    `select id from practice_turns where session_id = $1 and seq = $2 and role = 'tutor'`,
    [sessionId, learnerTurn.seq + 1],
  );
  const turn = view.turns.find((tr) => tr.id === reply?.id);
  if (!turn) throw new AppError('conflict', 'Answer is still being processed');
  return { session: view, verdict: learnerTurn.verdict, reply: turn };
}

export async function answerItem(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: AnswerRequest,
): Promise<AnswerResponse> {
  const now = deps.now();
  const replayed = await replay(deps.db, learner.id, sessionId, input.client_turn_id);
  if (replayed) return replayed;

  const session = await loadSession(deps.db, learner.id, sessionId);
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  const item = await deps.db.maybeOne<ItemRow & SessionItemRow & { extracted_text: string | null }>(
    `select i.*, si.status, si.attempts, si.hints_used, si.first_try_correct, si.position, si.item_id,
            m.extracted_text
       from session_items si join items i on i.id = si.item_id left join materials m on m.id = i.material_id
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
  const rule: RuleVerdict = ruleCheck(
    item,
    { text: input.text ?? null, choice: input.choice ?? null },
    learner.locale,
  );

  type Judged = {
    verdict: 'correct' | 'partially_correct' | 'incorrect' | 'not_an_attempt' | null;
    evaluatedBy: 'rule' | 'model' | null;
    reply: string;
    gaveHint: boolean;
    revealed: boolean;
  };
  let judged: Judged;
  if (rule === 'correct') {
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
  } else {
    try {
      const preferences = await deps.db.query<{ statement: string }>(
        `select statement from buddy_memories
          where learner_id = $1 and status = 'active' and kind = 'preference'
            and (valid_until is null or valid_until > $2)
          order by created_at desc limit 5`,
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
                attempts: item.attempts,
                ruleVerdict: rule,
                mode: session.mode,
                explanation: session.intro,
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
        return enforceTutorInvariants(parsed.data, rule);
      };
      let d = await askTutor(tutorContents);
      if (session.mode === 'help' && givesAwayHomework(d, item.answer, `${item.prompt}\n${text}`)) {
        // Homework: the solution must not be given. One repair with the reason, then a safe hint.
        d = await askTutor([
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
        ]);
        if (givesAwayHomework(d, item.answer, `${item.prompt}\n${text}`)) {
          d = {
            ...d,
            reply: t(learner.locale, 'practice.help_step'),
            gave_hint: true,
            revealed_answer: false,
          };
        }
      }
      if (
        session.mode === 'help' &&
        item.kind !== 'long' &&
        d.verdict === 'correct' &&
        !homeworkSolved(text, item.answer)
      ) {
        // A right step, not the final answer yet: the task stays open.
        d = { ...d, verdict: 'partially_correct' };
      }
      judged = {
        verdict: d.verdict,
        evaluatedBy: 'model',
        reply: d.reply,
        gaveHint: d.gave_hint,
        revealed: d.revealed_answer,
      };
    } catch (err) {
      if (isAppError(err) && err.code !== 'budget_exhausted') throw err;
      // No model: say what the rules know, never pretend to have judged.
      judged =
        rule === 'close'
          ? {
              verdict: 'partially_correct',
              evaluatedBy: 'rule',
              reply: t(learner.locale, 'practice.accents'),
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

  try {
    await deps.db.tx(async (tx) => {
      const si = await tx.one<SessionItemRow>(
        `select item_id, position, status, attempts, hints_used, first_try_correct
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
      const attempted = judged.verdict !== null && judged.verdict !== 'not_an_attempt';
      const attempts = si.attempts + (attempted ? 1 : 0);
      const hints = si.hints_used + (judged.gaveHint ? 1 : 0);
      let status: SessionItemRow['status'] = 'open';
      let firstTry: boolean | null = si.first_try_correct;
      if (judged.verdict === 'correct') {
        status = 'correct';
        firstTry = si.attempts === 0 && si.hints_used === 0;
      } else if (judged.revealed) {
        status = 'revealed';
        firstTry = false;
      }
      await tx.query(
        `update session_items set attempts = $3, hints_used = $4, status = $5, first_try_correct = $6,
                                  closed_at = case when $5 = 'open' then null else $7::timestamptz end
          where session_id = $1 and item_id = $2`,
        [sessionId, item.id, attempts, hints, status, firstTry, now],
      );
      if (status !== 'open' && learnsFsrs(session.mode)) {
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
    });
  } catch (err) {
    // A concurrent duplicate of the same answer won: return its result.
    if (isUniqueViolation(err)) {
      const r = await replay(deps.db, learner.id, sessionId, input.client_turn_id);
      if (r) return r;
    }
    throw err;
  }
  const view = await sessionView(deps.db, learner.id, sessionId);
  const reply = [...view.turns]
    .reverse()
    .find((tr) => tr.item_id === item.id && tr.role === 'tutor');
  if (!reply) throw new AppError('internal', 'reply missing');
  return { session: view, verdict: judged.verdict, reply };
}

/** "Show me the solution": close the question as not known (FSRS: again). */
export async function revealItem(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  itemId: string,
): Promise<SessionView> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const s = await loadSession(tx, learnerId, sessionId);
    if (s.status !== 'active') throw new AppError('conflict', 'Session has ended');
    const si = await tx.maybeOne<SessionItemRow>(
      `select item_id, status from session_items where session_id = $1 and item_id = $2 for update`,
      [sessionId, itemId],
    );
    if (!si) throw new AppError('not_found', 'Question not in this session');
    if (si.status !== 'open') return;
    if (s.mode === 'help') {
      throw new AppError('conflict', 'Homework help never shows the solution', {
        reason: 'reveal_not_allowed',
      });
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
  });
  return sessionView(deps.db, learnerId, sessionId);
}

/** End the session; Buddy's step gets evidence, and Buddy is woken to plan next. */
export async function finishSession(
  deps: Deps,
  learnerId: string,
  sessionId: string,
): Promise<SessionView> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const s = await tx.maybeOne<SessionRow>(
      `select id, learner_id, step_id, goal_id, mode, status, title, intro from practice_sessions
        where id = $1 and learner_id = $2 for update`,
      [sessionId, learnerId],
    );
    if (!s) throw new AppError('not_found', 'Session not found');
    if (s.status !== 'active') return; // idempotent
    const counts = await tx.one<{ answered: number; first_try: number; total: number }>(
      `select count(*) filter (where status <> 'open')::int as answered,
              count(*) filter (where first_try_correct)::int as first_try,
              count(*)::int as total
         from session_items where session_id = $1`,
      [sessionId],
    );
    await tx.query(
      `update practice_sessions set status = 'finished', finished_at = $2, last_activity_at = $2 where id = $1`,
      [sessionId, now],
    );
    if (s.step_id) {
      if (counts.answered > 0) {
        await tx.query(
          `update buddy_steps set state = 'done', done_source = 'evidence', finished_at = $2, version = version + 1,
                                  evidence = $3
            where id = $1 and state in ('planned','prepared','in_progress')`,
          [s.step_id, now, { session_id: sessionId, ...counts }],
        );
      } else {
        // Nothing answered: the step is still open, not "done".
        await tx.query(
          `update buddy_steps set state = 'prepared', version = version + 1 where id = $1 and state = 'in_progress'`,
          [s.step_id],
        );
      }
    }
    if (counts.answered > 0) {
      await enqueueJob(tx, {
        learnerId,
        kind: 'buddy_check',
        runAt: now,
        dedupeKey: `session_finished:${sessionId}`,
        payload: { reason: 'session_finished', session_id: sessionId },
      });
    }
    await bumpContext(tx, learnerId);
  });
  return sessionView(deps.db, learnerId, sessionId);
}
