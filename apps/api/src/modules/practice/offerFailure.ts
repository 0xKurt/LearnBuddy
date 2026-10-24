// A failed offer cannot keep a success claim in its reply (rule 5, #913).
import type { Deps } from '../../deps.js';
import { t } from '../../i18n/index.js';
import { isAppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import type { PracticeLearner } from './service.js';

/** Both background preparation and a later tap record the same learner-scoped outcome. */
export async function recordOfferFailure(
  deps: Deps,
  learner: PracticeLearner,
  actionId: string,
  error: unknown,
): Promise<void> {
  const permanent =
    isAppError(error) &&
    (error.details?.reason === 'not_usable' || error.details?.reason === 'speech_off');
  const text = t(learner.locale, permanent ? 'practice.not_usable' : 'practice.prepare_failed');
  await deps.db.tx(async (tx) => {
    // Same fence/order as a turn: neither the card nor its words change under a decision.
    await tx.query(`select 1 from buddy_settings where learner_id = $1 for update`, [learner.id]);
    const offer = await tx.maybeOne<{ decision_id: string }>(
      `update buddy_actions set cannot_start_at = case when $3 then $4 else cannot_start_at end
        where id = $1 and learner_id = $2 and tool = 'offer_learning' and status = 'applied'
          and cannot_start_at is null
          and not exists (select 1 from practice_sessions
                           where learner_id = $2 and client_request_id = $1)
        returning decision_id`,
      [actionId, learner.id, permanent, deps.now()],
    );
    if (!offer) return;
    const changed = await tx.query(
      `update buddy_messages set text = $3, ask = null
        where learner_id = $1 and decision_id = $2 and role = 'buddy' and text is distinct from $3
        returning id`,
      [learner.id, offer.decision_id, text],
    );
    if (permanent || changed.length > 0) await bumpContext(tx, learner.id);
  });
}
