// „Merk ich mir für nachher" (issue #391; report „Hilfe und Fragen beim Üben" §4;
// docs/architecture.md §Practice): her question that had nothing to do with the task, kept as a
// note on the session when she taps the chip — and only then. Buddy reads the kept notes once the
// practice is over (`modules/buddy/state.ts` `loadLaterNotes`) and brings them up in the chat.
//
// The note is not a copy: it is the flag on the tutor turn that offered the chip, and her words
// stay in her own learner turn right before it. Deleting the session deletes the note.

import type { KeepForLaterRequest, KeepForLaterResponse } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import { loadSession } from './sessionRow.js';
import { sessionView } from './sessionView.js';

/**
 * The tap on „Merk ich mir für nachher". Only a tutor turn of hers that offered it can be kept
 * (404 for any other turn id, 409 `not_offered` for a reply without the chip); tapping again
 * changes nothing. Allowed after the practice ended too: the chip stays in the thread.
 */
export async function keepForLater(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  input: KeepForLaterRequest,
): Promise<KeepForLaterResponse> {
  // Someone else's session is not found, like every practice route (tenant isolation).
  await loadSession(deps.db, learnerId, sessionId);
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const turn = await tx.maybeOne<{ later: 'offered' | 'kept' | null }>(
      `select later from practice_turns
        where id = $1 and session_id = $2 and learner_id = $3 and role = 'tutor'
        for update`,
      [input.turn_id, sessionId, learnerId],
    );
    if (!turn) throw new AppError('not_found', 'No such reply in this session');
    if (turn.later === 'kept') return;
    if (turn.later !== 'offered') {
      throw new AppError('conflict', 'This reply offered nothing to keep', {
        reason: 'not_offered',
      });
    }
    await tx.query(`update practice_turns set later = 'kept', later_at = $2 where id = $1`, [
      input.turn_id,
      now,
    ]);
    // What Buddy reads changed: the note joins his STATE once the practice is over (rule 4).
    await bumpContext(tx, learnerId);
  });
  const view = await sessionView(deps.db, learnerId, sessionId, deps.storage, now);
  const turn = view.turns.find((tr) => tr.id === input.turn_id);
  if (!turn) throw new AppError('internal', 'kept reply missing');
  return { turn };
}
