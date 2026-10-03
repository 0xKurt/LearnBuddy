// Buddy prepares what he just offered, while she still reads his reply (issue #48).
//
// Until now `offer_learning` only put a card in the chat; the questions were written when
// she tapped it — a model call of 2.5–6 s she waited through (docs/architecture.md §Speed).
// Now the same call starts right after the decision is applied, under the offer's action id.
// That is the id the app sends as `client_request_id` when she taps, so:
//   - finished by then  → her tap finds the session and opens it at once,
//   - still running     → `startTopic` joins the running one (no second model call),
//   - failed or skipped → her tap prepares it exactly as before. Nothing is lost.
//
// Nothing here tells her anything: a preparation that is not finished is not claimed
// (CLAUDE.md rule 5); the offer card says what it always said until the session is there.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { isAppError } from '../../lib/errors.js';
import { startTopic } from './generate.js';
import type { PracticeLearner } from './service.js';

/** Offers that open a prepared session; `open_area` and the rest have nothing to prepare. */
type Offer = Extract<ActionSummary, { tool: 'offer_learning' }>;

export function prepareOffered(
  deps: Deps,
  learnerId: string,
  actions: ReadonlyArray<{ id: string; summary: ActionSummary }>,
): void {
  for (const action of actions) {
    if (action.summary.tool !== 'offer_learning') continue;
    const offer: Offer = action.summary;
    deps.background(async () => {
      const learner = await deps.db.maybeOne<PracticeLearner>(
        `select id, display_name, locale, level, grade, birth_date, curriculum_region
           from learners where id = $1`,
        [learnerId],
      );
      if (!learner) return;
      try {
        await startTopic(deps, learner, {
          client_request_id: action.id,
          kind: offer.kind,
          text: offer.text,
          goal_id: offer.goal_id,
          // A Diktat of her sheet takes its words from there (issue #242).
          material_id: offer.material_id,
          // Prepared exactly as her tap would ask for it (issue #113) — otherwise the
          // prepared session and the tapped one would be two different things.
          difficulty: offer.difficulty,
          direction: offer.direction,
          // A test she asked to sit with time keeps its minutes (issue #241). The clock itself
          // starts only when she opens it — not here, while she is still reading his reply.
          minutes: offer.minutes,
        });
      } catch (err) {
        // "Nothing to learn from this" is not an outage — it is the generator saying this
        // offer can never start, and it would say the same to her tap (issue #196). So it is
        // kept: the button stops being a button, and STATE stops calling it something waiting
        // for her. Every other failure (model down, timeout) says nothing about the offer —
        // her tap prepares it then, and says what went wrong there.
        // 'speech_off' is the same kind of answer for a listening offer (issue #210) and a Diktat (#242): there is
        // no voice configured to read a text aloud, which her tap would hit just the same. Both
        // are stable facts about this deployment, not an outage — so the button stops being a
        // button instead of promising a text nobody can hear.
        if (
          isAppError(err) &&
          (err.details?.reason === 'not_usable' || err.details?.reason === 'speech_off')
        ) {
          await deps.db.query(
            `update buddy_actions set cannot_start_at = $3
              where id = $1 and learner_id = $2 and tool = 'offer_learning'
                and cannot_start_at is null`,
            [action.id, learnerId, deps.now()],
          );
        }
      }
    });
  }
}
