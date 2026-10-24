// Buddy prepares the offered questions while she reads his reply (#48).
// Hints wait for the app to open the run (open.ts, #868).
//
// Until now `offer_learning` only put a card in the chat; the questions were written when
// she tapped it — a model call of 2.5–6 s she waited through (docs/architecture.md §Speed).
// Now the same call starts right after the decision is applied, under the offer's action id.
// That is the id the app sends as `client_request_id` when she taps, so:
//   - finished by then  → her tap finds the session and opens it at once,
//   - still running     → `startTopic` joins the running one (no second model call),
//   - failed or skipped → her tap prepares it exactly as before. Nothing is lost.
//
// A preparation that is not finished is never claimed (CLAUDE.md rule 5). If it fails,
// startTopic corrects the offer's reply; only a permanent refusal withdraws its start.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { startTopic } from './generate.js';
import type { PracticeLearner } from './service.js';

/** Offers that open a prepared session; `open_area` and the rest have nothing to prepare. */
type Offer = Extract<ActionSummary, { tool: 'offer_learning' }>;

export async function prepareOffered(
  deps: Deps,
  learnerId: string,
  actions: ReadonlyArray<{ id: string; summary: ActionSummary }>,
): Promise<void | { text: string }> {
  let reply: { text: string } | undefined;
  for (const action of actions) {
    if (action.summary.tool !== 'offer_learning') continue;
    const offer: Offer = action.summary;
    const prepare = async () => {
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
          vocabulary: offer.vocabulary,
          // A test she asked to sit with time keeps its minutes (issue #241). The clock itself
          // starts only when she opens it — not here, while she is still reading his reply.
          minutes: offer.minutes,
          // The kinds of picture she asked for (#724), as her tap hands them over.
          figures: offer.figures?.length ? offer.figures : null,
        });
      } catch {
        // startTopic records the failed offer and corrects its reply (#913). A transient
        // failure leaves the button available: her tap can try preparing it again.
      }
    };
    // A requested chat list is part of this response; other offers prepare while she reads.
    if (offer.vocabulary?.output === 'chat') await prepare();
    else deps.background(prepare);
    if (offer.vocabulary) {
      reply =
        (await deps.db.maybeOne<{ text: string }>(
          `select text from buddy_messages where learner_id = $1 and role = 'buddy'
          and decision_id = (select decision_id from buddy_actions where id = $2 and learner_id = $1)`,
          [learnerId, action.id],
        )) ?? undefined;
    }
  }
  return reply;
}
