// A flashcard pass: starting one, and recording one card (issue #147, Stufe 2).
//
// Which words go on the cards, and why the pass is reached where it is reached, is `cards.ts`.
// What one card is worth to the repetition schedule, and why a self-assessment deliberately
// weighs less than a checked answer, is `fsrs.ts` RATING. What this file is for is making
// sure nothing ELSE about the pass quietly claims more than happened:
//
//   · `session_items.status` says only `revealed` — true for every card, because the card
//     turned over and she saw the answer. It never says `correct`, which would be a claim
//     that something was right, and `first_try_correct` stays false, which is what every
//     reader outside this module ("sits", the sheet's per-question marker, the selection of
//     what to practise next) keys on. So a word she says she knew stays in rotation.
//   · `session_items.answered_by` says `self_rated`, so the summary counts the cards as work
//     she did and never lets them name a topic as one that went well (`summary.ts`).
//   · `item_states.last_outcome` says `self_known` or `self_unknown` — the mark on the review
//     itself, so what an interval was built on stays legible later.
//
// Nothing here calls a model, judges anything or writes a reply: there is no verdict to give.

import type {
  CardRequest,
  SessionView,
  StartCardPassRequest,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { isUniqueViolation } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { t } from '../../i18n/index.js';
import { bumpContext } from '../buddy/plan.js';
import { CARD_PASS, goesOnACard, offersCardPass, type CardCandidate } from './cards.js';
import { reviewItem, type ItemOutcome } from './fsrs.js';
import { createSession, loadSession, nextSeq, type PracticeLearner } from './service.js';
import { passTurn } from './passTurn.js';

/** The columns `goesOnACard` needs, for a session whose rows are not loaded yet. */
const CANDIDATE_COLS = `si.item_id, si.position, si.status, si.first_try_correct, si.flagged_at,
         si.disputed_at, i.kind, i.archived_at`;

/**
 * Start (or return) the flashcard pass over the words of a finished run.
 *
 * Idempotent per `client_request_id` (the unique index on `practice_sessions`): a lost reply
 * never leaves her with two passes over the same words. The new session belongs to the same
 * goal and carries the same title, so Buddy's home card and the result screen name it the
 * way she knows it.
 */
export async function startCardPass(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  input: StartCardPassRequest,
): Promise<string> {
  const now = deps.now();
  const existing = await deps.db.maybeOne<{ id: string }>(
    `select id from practice_sessions where learner_id = $1 and client_request_id = $2`,
    [learnerId, input.client_request_id],
  );
  if (existing) return existing.id;

  // Another learner's session is not found, not refused (tenant isolation).
  const source = await loadSession(deps.db, learnerId, sessionId);
  if (source.pass === CARD_PASS) {
    throw new AppError('conflict', 'A flashcard pass does not start another one', {
      reason: 'not_from_card_pass',
    });
  }
  if (source.status !== 'finished') {
    throw new AppError('conflict', 'This practice is still running', { reason: 'session_running' });
  }
  const rows = await deps.db.query<CardCandidate & { item_id: string }>(
    `select ${CANDIDATE_COLS}
       from session_items si join items i on i.id = si.item_id
      where si.session_id = $1 and i.learner_id = $2
      order by si.position`,
    [sessionId, learnerId],
  );
  // The same rule the result screen's offer is built on, so the endpoint can never start a
  // pass the app would not have offered (and a hand-written request cannot either).
  if (!offersCardPass(source, rows)) {
    throw new AppError('not_found', 'No words to go through here', { reason: 'no_cards' });
  }
  const itemIds = rows.filter(goesOnACard).map((r) => r.item_id);
  const title = await deps.db.maybeOne<{ title: string | null }>(
    `select coalesce(ps.title, g.title, st.title) as title from practice_sessions ps
       left join buddy_goals g on g.id = ps.goal_id left join buddy_steps st on st.id = ps.step_id
      where ps.id = $1`,
    [sessionId],
  );
  try {
    return await deps.db.tx(async (tx) => {
      const id = await createSession(
        tx,
        learnerId,
        itemIds,
        {
          stepId: null,
          goalId: source.goal_id,
          // A card pass IS practice (it feeds the same spaced repetition); `pass` says which
          // kind of pass it is, so nothing outside this module has to learn a new mode.
          mode: 'practice',
          pass: CARD_PASS,
          clientRequestId: input.client_request_id,
          ...(title?.title ? { title: title.title } : {}),
        },
        now,
      );
      // Buddy's picture of her ("was läuft gerade?") now holds this pass.
      await bumpContext(tx, learnerId);
      return id;
    });
  } catch (err) {
    // Two taps at once: the one that lost reads the pass the other one started.
    if (isUniqueViolation(err)) {
      const again = await deps.db.maybeOne<{ id: string }>(
        `select id from practice_sessions where learner_id = $1 and client_request_id = $2`,
        [learnerId, input.client_request_id],
      );
      if (again) return again.id;
    }
    throw err;
  }
}

/** What she tapped, as the one review it produces (fsrs.ts RATING argues the two). */
function outcomeOf(recall: CardRequest['recall']): ItemOutcome {
  return recall === 'knew_it' ? 'self_known' : 'self_unknown';
}

/** Her tap, in her own language, as it goes into the conversation of the session. */
function recallText(locale: string, recall: CardRequest['recall']): string {
  return t(locale, recall === 'knew_it' ? 'practice.card_knew' : 'practice.card_not_yet');
}

/**
 * One card, recorded: her own report becomes a turn in the session's conversation, the
 * question closes as shown (because it was), and one review goes into the spaced repetition
 * with the mark that she judged it herself.
 *
 * Nothing here calls a model, judges anything or writes a reply: there is no verdict to give.
 */
export async function recordCard(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: CardRequest,
): Promise<SessionView> {
  return passTurn(
    deps,
    learner,
    sessionId,
    input.client_turn_id,
    {
      pass: CARD_PASS,
      message: 'This practice is answered, not turned over',
      reason: 'not_a_card_pass',
    },
    async (tx, now) => {
      const si = await tx.maybeOne<{ status: string }>(
        `select si.status from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3
        for update of si`,
        [sessionId, input.item_id, learner.id],
      );
      if (!si) throw new AppError('not_found', 'Card not in this pass');
      if (si.status !== 'open') {
        throw new AppError('conflict', 'This card is already done', { reason: 'already_closed' });
      }
      const seq = await nextSeq(tx, sessionId);
      // `evaluated_by` stays null on purpose: nobody evaluated this. The verdict column says
      // `not_an_attempt` for the same reason — it was never an attempt at the answer.
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, client_turn_id)
       values ($1, $2, $3, $4, 'learner', $5, 'not_an_attempt', $6)`,
        [
          sessionId,
          learner.id,
          input.item_id,
          seq,
          recallText(learner.locale, input.recall),
          input.client_turn_id,
        ],
      );
      // `revealed`, never `correct`: the card turned over and she saw the answer, which is
      // all that was observed. `first_try_correct` false keeps every reader outside this
      // module honest — the word stays in rotation whatever she said about it.
      await tx.query(
        `update session_items
          set status = 'revealed', first_try_correct = false, closed_at = $3,
              answered_by = 'self_rated'
        where session_id = $1 and item_id = $2`,
        [sessionId, input.item_id, now],
      );
      // The state this overwrites is recorded by `reviewItem` from the same read, so a card
      // pass can be taken back exactly like any other review (issue #164).
      await reviewItem(tx, learner.id, sessionId, input.item_id, outcomeOf(input.recall), now);
    },
  );
}
