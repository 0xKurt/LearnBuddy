// She contests something about a question (docs/architecture.md §Practice): "Frage passt nicht"
// takes the question out (`flagItem`), and "Das war doch richtig" disputes a verdict
// (`disputeVerdict`). Both are use cases of their own, kept apart from answering (service.ts).

import type { SessionView } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import { CARD_PASS } from './cards.js';
import { finishIfComplete, sessionView, type ItemRow, type SessionItemRow } from './service.js';
import { changeSession } from './sessionRow.js';

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
  await changeSession(deps, learnerId, sessionId, { active: false }, async (tx, s, now) => {
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
