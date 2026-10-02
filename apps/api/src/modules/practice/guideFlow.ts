// Starting and leaving a guided example (issue #298, `guide.ts` says what it is).
//
//   POST /practice/sessions/:id/guide       "Zeig's mir Schritt für Schritt" — the chip
//   POST /practice/sessions/:id/guide/stop  "Ich mach selbst weiter"
//
// Both answer like an answer (AnswerResponse): her tap and Buddy's reply become turns, and both
// are idempotent per `client_turn_id`. Typing "zeig mir wie" starts the same thing from inside
// `answerItem`, where the tutor classifies it.
//
// What code enforces here (rule 1):
//   - only in practice, never in a test or in homework help (homework never shows the way to her
//     own task's solution, `docs/architecture.md` §Practice);
//   - only where `guide_offered` holds: the question is open, went wrong twice, had no guided
//     example yet, and code can follow its steps;
//   - the plan is checked before anything is written; a plan that does not hold is recorded as
//     unavailable (the offer does not come back) and she is told so plainly;
//   - a model outage writes nothing (503), so she can tap again.

import type {
  AnswerResponse,
  GuideRequest,
  StopGuideRequest,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { t } from '../../i18n/index.js';
import { isUniqueViolation, type Db } from '../../lib/db.js';
import { AppError, isAppError } from '../../lib/errors.js';
import { localParts } from '../../lib/time.js';
import { LlmError } from '../../llm/gateway.js';
import { CARD_PASS } from './cards.js';
import {
  guideKindFor,
  guideOf,
  insertGuide,
  openGuide,
  planGuide,
  type GuidePlan,
  type GuideState,
  type PlanItem,
} from './guide.js';
import {
  GUIDE_OFFER_AFTER,
  loadSession,
  lockActiveSession,
  nextSeq,
  replay,
  type ItemRow,
  type PracticeLearner,
} from './service.js';

type GuideItem = ItemRow & {
  status: string;
  attempts: number;
  extracted_text: string | null;
  subject_kind: string | null;
};

async function itemOf(db: Db, sessionId: string, itemId: string, learnerId: string) {
  return db.maybeOne<GuideItem>(
    `select i.*, si.status, si.attempts, m.extracted_text, s.kind as subject_kind
       from session_items si join items i on i.id = si.item_id
       left join materials m on m.id = i.material_id
       left join subjects s on s.id = i.subject_id
      where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3`,
    [sessionId, itemId, learnerId],
  );
}

/** Her tap and Buddy's reply as two turns, plus what happened to the guide — one transaction. */
async function writeTurns(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  itemId: string,
  input: { clientTurnId: string; asked: string; reply: string; figure: GuidePlan['figure'] },
  inTx: (tx: Db) => Promise<void>,
  /** Being shown is help (hints_used moves on): a question solved after it is never first try. */
  countsAsHelp: boolean,
): Promise<AnswerResponse> {
  const now = deps.now();
  try {
    await deps.db.tx(async (tx) => {
      await lockActiveSession(tx, learner.id, sessionId);
      const si = await tx.one<{ status: string }>(
        `select status from session_items where session_id = $1 and item_id = $2 for update`,
        [sessionId, itemId],
      );
      if (si.status !== 'open') throw new AppError('conflict', 'This question is already closed');
      const seq = await nextSeq(tx, sessionId);
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, client_turn_id, created_at)
         values ($1, $2, $3, $4, 'learner', $5, 'not_an_attempt', 'rule', $6, $7)`,
        [sessionId, learner.id, itemId, seq, input.asked, input.clientTurnId, now],
      );
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, gave_hint, figure, created_at)
         values ($1, $2, $3, $4, 'tutor', $5, $6, $7, $8)`,
        [
          sessionId,
          learner.id,
          itemId,
          seq + 1,
          input.reply,
          countsAsHelp,
          input.figure ? JSON.stringify(input.figure) : null,
          now,
        ],
      );
      if (countsAsHelp) {
        await tx.query(
          `update session_items set hints_used = hints_used + 1, deferred_at = null
            where session_id = $1 and item_id = $2`,
          [sessionId, itemId],
        );
      }
      await inTx(tx);
      await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
        sessionId,
        now,
      ]);
    });
  } catch (err) {
    // The same tap twice at once: the first one won, its result is the answer.
    if (isUniqueViolation(err)) {
      const r = await replay(deps.db, learner.id, sessionId, input.clientTurnId, deps.storage, now);
      if (r) return r;
      throw new AppError('conflict', 'A guided example already runs on this question');
    }
    throw err;
  }
  const done = await replay(deps.db, learner.id, sessionId, input.clientTurnId, deps.storage, now);
  if (!done) throw new AppError('internal', 'guided example missing');
  return done;
}

/** "Zeig's mir Schritt für Schritt": the first step, shown; the next one is hers. */
export async function startGuide(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: GuideRequest,
): Promise<AnswerResponse> {
  const now = deps.now();
  const replayed = await replay(
    deps.db,
    learner.id,
    sessionId,
    input.client_turn_id,
    deps.storage,
    now,
  );
  if (replayed) return replayed;
  const session = await loadSession(deps.db, learner.id, sessionId);
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  if (session.mode !== 'practice' || session.pass === CARD_PASS) {
    throw new AppError('conflict', 'Guided examples are for practice only', {
      reason: 'guide_not_allowed',
    });
  }
  const item = await itemOf(deps.db, sessionId, input.item_id, learner.id);
  if (!item) throw new AppError('not_found', 'Question not in this session');
  if (item.status !== 'open') throw new AppError('conflict', 'This question is already closed');
  const kind = guideKindFor(item);
  if (kind === null) {
    throw new AppError('conflict', 'This question has no steps to follow', {
      reason: 'guide_not_allowed',
    });
  }
  if ((await guideOf(deps.db, sessionId, item.id)) !== null) {
    throw new AppError('conflict', 'This question already had its guided example', {
      reason: 'guide_not_allowed',
    });
  }
  // The chip is offered after the second wrong try; typing "zeig mir wie" works at any time.
  if (item.attempts < GUIDE_OFFER_AFTER) {
    throw new AppError('conflict', 'Try it first', { reason: 'try_first' });
  }

  const tz = await deps.db.one<{ timezone: string }>(
    `select coalesce((select timezone from buddy_settings where learner_id = $1), 'Europe/Berlin') as timezone`,
    [learner.id],
  );
  const planItem: PlanItem = item;
  let plan: GuidePlan | null;
  try {
    const planned = await planGuide(
      deps,
      learner,
      planItem,
      kind,
      localParts(now, tz.timezone).date,
    );
    plan = planned.ok ? planned.plan : null;
  } catch (err) {
    if (isAppError(err)) throw err;
    if (err instanceof LlmError) {
      // Nothing is stored: she can simply tap again.
      throw new AppError('model_unavailable', 'Buddy cannot show it step by step right now');
    }
    throw err;
  }
  let opened: { reply: string; state: GuideState } | null = null;
  if (plan) opened = openGuide(learner.locale, plan);
  return writeTurns(
    deps,
    learner,
    sessionId,
    item.id,
    {
      clientTurnId: input.client_turn_id,
      asked: t(learner.locale, 'practice.guide.ask'),
      reply: opened ? opened.reply : t(learner.locale, 'practice.guide.unavailable'),
      figure: plan?.figure ?? null,
    },
    (tx) =>
      insertGuide(
        tx,
        { sessionId, learnerId: learner.id, itemId: item.id },
        kind,
        plan,
        opened?.state ?? null,
        now,
      ),
    plan !== null,
  );
}

/** "Ich mach selbst weiter": the guide ends, the question is hers again, as open as before. */
export async function stopGuide(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: StopGuideRequest,
): Promise<AnswerResponse> {
  const now = deps.now();
  const replayed = await replay(
    deps.db,
    learner.id,
    sessionId,
    input.client_turn_id,
    deps.storage,
    now,
  );
  if (replayed) return replayed;
  const session = await loadSession(deps.db, learner.id, sessionId);
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  const item = await itemOf(deps.db, sessionId, input.item_id, learner.id);
  if (!item) throw new AppError('not_found', 'Question not in this session');
  return writeTurns(
    deps,
    learner,
    sessionId,
    item.id,
    {
      clientTurnId: input.client_turn_id,
      asked: t(learner.locale, 'practice.guide.stop'),
      reply: t(learner.locale, 'practice.guide.stopped'),
      figure: null,
    },
    async (tx) => {
      const stopped = await tx.query(
        `update guided_examples set status = 'stopped', updated_at = $3
          where session_id = $1 and item_id = $2 and status = 'active' returning id`,
        [sessionId, item.id, now],
      );
      if (stopped.length === 0) {
        throw new AppError('conflict', 'No guided example runs on this question', {
          reason: 'guide_not_running',
        });
      }
    },
    false,
  );
}
