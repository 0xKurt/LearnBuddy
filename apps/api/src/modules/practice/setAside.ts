// A question closed or set aside without an answer (docs/architecture.md §Practice): "Lösung
// zeigen" closes it as not known (`revealItem`), and in homework "Später" puts a task aside for
// now (`deferItem`). Use cases of their own, beside answering (service.ts).

import { type SessionView } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { noSingleSolution } from './evaluate.js';
import { changeSession } from './sessionRow.js';
import { reviewItem } from './fsrs.js';
import { CARD_PASS } from './cards.js';
import { DRILL_PASS } from './drill.js';
import {
  learnsFsrs,
  revealReady,
  sessionView,
  touchRun,
  type ItemRow,
  type SessionItemRow,
} from './service.js';
import { settleTestClock, timeUpError } from './testClock.js';

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
  // "Überspringen" after the time is up changes nothing: the question stays "nicht beantwortet".
  if ((await settleTestClock(deps.db, learnerId, sessionId, deps.now())) === 'time_up') {
    throw timeUpError();
  }
  await changeSession(deps, learnerId, sessionId, async (tx, s, now) => {
    if (s.pass === CARD_PASS) {
      throw new AppError('conflict', 'A card shows its answer by itself', {
        reason: 'use_cards',
      });
    }
    if (s.pass === DRILL_PASS) {
      // One try per task; the key is on screen the moment she answered (issue #243).
      throw new AppError('conflict', 'A quick round shows the key by itself', {
        reason: 'use_drill',
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
    await touchRun(tx, learnerId, sessionId, now);
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
  await changeSession(deps, learnerId, sessionId, async (tx, s, now) => {
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
