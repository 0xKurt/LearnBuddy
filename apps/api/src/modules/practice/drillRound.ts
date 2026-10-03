// A Kopfrechnen round in the database (issue #243): starting one, answering one task, and the
// part of the session view only a round has. The arithmetic is `drill.ts`; this file is what
// makes it a session like any other — the same tables, the same lock order, the same
// idempotency, the same spaced repetition — and makes sure no model is ever asked.
//
//   · A task is an ordinary `numeric` question of origin `buddy` whose `drill_fact` names the
//     arithmetic (migration 0082). One row per fact and learner, made the first time a round
//     asks it and reused ever after, so FSRS keeps ONE state per fact across rounds.
//   · One try per task. Right: `correct`, first try → `Good`. Not right: `missed` → `Again`,
//     and the key is on screen under the next task. No reply text, no tutor, no hint ladder:
//     the speed is the exercise, and the fact comes back through the schedule.
//   · A finished round wakes nobody (`finishLocked` leaves the `session_finished` event out for
//     a round): Buddy's follow-up would be a model call after every twenty seconds of practice.

import type {
  DrillAnswerRequest,
  DrillSpec,
  SessionView,
  StartDrillRequest,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { isUniqueViolation } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import {
  answerOf,
  checkDrill,
  DRILL_PASS,
  factOf,
  factsOf,
  groupOf,
  keyOf,
  pickRound,
  promptOf,
  titleOf,
  type FactState,
} from './drill.js';
import { reviewItem } from './fsrs.js';
import { createSession, nextSeq, type PracticeLearner } from './service.js';
import { passTurn } from './passTurn.js';

/** Topic of a task: its times row ("Einmaleins mit 7"), else the round's own name. */
function topicOf(spec: DrillSpec, key: string, locale: string): string {
  const f = factOf(key);
  const g = f ? groupOf(f, spec) : { kind: 'range' as const };
  if (g.kind === 'range') return titleOf(spec, locale).slice(0, 80);
  return titleOf({ range: g.kind, rows: [g.n], carry: null }, locale).slice(0, 80);
}

/**
 * Start (or return) a round. Idempotent per `client_request_id` — her tap on Buddy's offer
 * sends the offer's id, so the same offer always opens the same round.
 */
export async function startDrill(
  deps: Deps,
  learner: PracticeLearner,
  input: StartDrillRequest,
): Promise<string> {
  const now = deps.now();
  const existing = await deps.db.maybeOne<{ id: string }>(
    `select id from practice_sessions where learner_id = $1 and client_request_id = $2`,
    [learner.id, input.client_request_id],
  );
  if (existing) return existing.id;

  const spec = input.spec;
  const facts = factsOf(spec);
  if (facts.length === 0) {
    // Unreachable through the contract, kept honest anyway: nothing to ask is not a round.
    throw new AppError('invalid_input', 'No tasks in this range', { reason: 'not_usable' });
  }
  const keys = facts.map(keyOf);
  const known = await deps.db.query<{
    drill_fact: string;
    archived: boolean;
    due: Date | null;
    last_outcome: string | null;
    lapses: number | null;
  }>(
    `select i.drill_fact, i.archived_at is not null as archived, st.due, st.last_outcome, st.lapses
       from items i left join item_states st on st.item_id = i.id
      where i.learner_id = $1 and i.drill_fact = any($2::text[])`,
    [learner.id, keys],
  );
  const states = new Map<string, FactState>();
  const gone = new Set<string>();
  for (const k of known) {
    // A fact she had taken out (a question deleted through Buddy) stays out.
    if (k.archived) gone.add(k.drill_fact);
    else if (k.due) {
      states.set(k.drill_fact, {
        due: k.due,
        last_outcome: k.last_outcome,
        lapses: k.lapses ?? 0,
      });
    }
  }
  // The round before ended with this task: the new one does not open with it.
  const lastSeen = await deps.db.maybeOne<{ drill_fact: string }>(
    `select i.drill_fact from practice_turns pt
       join practice_sessions ps on ps.id = pt.session_id
       join items i on i.id = pt.item_id
      where pt.learner_id = $1 and ps.pass = 'drill'
      order by pt.created_at desc, pt.seq desc limit 1`,
    [learner.id],
  );
  const round = pickRound(
    facts.filter((f) => !gone.has(keyOf(f))),
    states,
    now,
    input.client_request_id,
    { avoidFirst: lastSeen?.drill_fact ?? null },
  );
  if (round.length === 0) {
    throw new AppError('invalid_input', 'No tasks in this range', { reason: 'not_usable' });
  }
  try {
    return await deps.db.tx(async (tx) => {
      const itemIds: string[] = [];
      for (const f of round) {
        const key = keyOf(f);
        // Text and key COMPUTED from the fact; the check later recomputes the value from the
        // fact again and never reads `answer` (#224 Regel 0).
        await tx.query(
          `insert into items (learner_id, kind, prompt, answer, topic, origin, difficulty, drill_fact, created_at)
           values ($1, 'numeric', $2, $3, $4, 'buddy', 2, $5, $6)
           on conflict (learner_id, drill_fact) where drill_fact is not null do nothing`,
          [
            learner.id,
            promptOf(f, learner.locale),
            answerOf(f),
            topicOf(spec, key, learner.locale),
            key,
            now,
          ],
        );
        const row = await tx.one<{ id: string }>(
          `select id from items where learner_id = $1 and drill_fact = $2`,
          [learner.id, key],
        );
        itemIds.push(row.id);
      }
      const id = await createSession(
        tx,
        learner.id,
        itemIds,
        {
          stepId: null,
          goalId: null,
          mode: 'practice',
          pass: DRILL_PASS,
          drill: spec,
          clientRequestId: input.client_request_id,
          title: titleOf(spec, learner.locale).slice(0, 120),
        },
        now,
      );
      // Buddy's picture of her ("was läuft gerade?") now holds this round.
      await bumpContext(tx, learner.id);
      return id;
    });
  } catch (err) {
    // Two taps at once: the one that lost reads the round the other one started.
    if (isUniqueViolation(err)) {
      const again = await deps.db.maybeOne<{ id: string }>(
        `select id from practice_sessions where learner_id = $1 and client_request_id = $2`,
        [learner.id, input.client_request_id],
      );
      if (again) return again.id;
    }
    throw err;
  }
}

/**
 * One answer of a round: checked by code against the value computed from the task's fact,
 * the task closed (one try), one review into FSRS. Zero model calls. Idempotent per
 * `client_turn_id`; another learner's round is not found.
 */
export async function answerDrill(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: DrillAnswerRequest,
): Promise<SessionView> {
  return passTurn(
    deps,
    learner,
    sessionId,
    input.client_turn_id,
    { pass: DRILL_PASS, message: 'This practice is not a quick round', reason: 'not_a_drill' },
    async (tx, now) => {
      const si = await tx.maybeOne<{ status: string; drill_fact: string | null }>(
        `select si.status, i.drill_fact from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3
        for update of si`,
        [sessionId, input.item_id, learner.id],
      );
      if (!si) throw new AppError('not_found', 'Task not in this round');
      if (si.status !== 'open') {
        throw new AppError('conflict', 'This task is already done', { reason: 'already_closed' });
      }
      const fact = si.drill_fact ? factOf(si.drill_fact) : null;
      if (!fact) {
        throw new AppError('conflict', 'This task cannot be read', { reason: 'task_unreadable' });
      }
      const correct = checkDrill(fact, input.text);
      const seq = await nextSeq(tx, sessionId);
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict,
                                   evaluated_by, client_turn_id, created_at)
       values ($1, $2, $3, $4, 'learner', $5, $6, 'rule', $7, $8)`,
        [
          sessionId,
          learner.id,
          input.item_id,
          seq,
          input.text,
          correct ? 'correct' : 'incorrect',
          input.client_turn_id,
          now,
        ],
      );
      // One try: right is `correct` at the first try; not right is `missed` — the key is
      // shown under the next task, and the fact comes back through the schedule.
      await tx.query(
        `update session_items
          set status = $3, attempts = 1, first_try_correct = $4, closed_at = $5,
              answered_by = 'typed'
        where session_id = $1 and item_id = $2`,
        [sessionId, input.item_id, correct ? 'correct' : 'missed', correct, now],
      );
      await reviewItem(
        tx,
        learner.id,
        sessionId,
        input.item_id,
        correct ? 'first_try' : 'revealed',
        now,
      );
    },
  );
}
