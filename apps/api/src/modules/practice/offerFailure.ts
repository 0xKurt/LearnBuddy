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
  const reason = isAppError(error) ? error.details?.reason : undefined;
  const permanent = reason === 'not_usable' || reason === 'speech_off';
  const code = permanent ? reason : isAppError(error) ? error.code : 'internal';
  const at = deps.now();
  const text = t(learner.locale, permanent ? 'practice.not_usable' : 'practice.prepare_failed');
  await deps.db.tx(async (tx) => {
    // Same fence/order as a turn: neither the card nor its words change under a decision.
    await tx.query(`select 1 from buddy_settings where learner_id = $1 for update`, [learner.id]);
    const offer = await tx.maybeOne<{ decision_id: string }>(
      `update buddy_actions set cannot_start_at = case when $3 then $4 else cannot_start_at end,
           result = jsonb_set(result, '{offer_failure}', $5::jsonb)
        where id = $1 and learner_id = $2 and tool = 'offer_learning' and status = 'applied'
          and cannot_start_at is null
          and not exists (select 1 from practice_sessions
                           where learner_id = $2 and client_request_id = $1)
        returning decision_id`,
      [actionId, learner.id, permanent, at, JSON.stringify({ code, at: at.toISOString() })],
    );
    if (!offer) return;
    const messages = await tx.query<{ id: string; text: string }>(
      `select id, text from buddy_messages
        where learner_id = $1 and decision_id = $2 and role = 'buddy' for update`,
      [learner.id, offer.decision_id],
    );
    const failures = [
      t(learner.locale, 'practice.not_usable'),
      t(learner.locale, 'practice.prepare_failed'),
    ];
    let changed = false;
    for (const message of messages) {
      // A free-form reply has no reliable offer-only boundary. Preserve its other content;
      // only a known fixed notice can be replaced, and never append the correction twice.
      const previous = failures.find(
        (failure) => message.text === failure || message.text.endsWith(`\n\n${failure}`),
      );
      const original = previous ? message.text.slice(0, -previous.length).trimEnd() : message.text;
      const corrected = original ? `${original}\n\n${text}` : text;
      if (corrected === message.text) continue;
      await tx.query(`update buddy_messages set text = $3 where id = $1 and learner_id = $2`, [
        message.id,
        learner.id,
        corrected,
      ]);
      changed = true;
    }
    if (permanent || changed) await bumpContext(tx, learner.id);
  });
}
