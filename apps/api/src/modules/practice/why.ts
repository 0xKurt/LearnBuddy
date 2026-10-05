// „Warum stimmt das?" (issue #388, report „Hilfe und Fragen beim Üben" §5.3; docs/architecture.md
// §Practice): once a question has closed, she taps one of three reasons. One of them is the rule or
// concept behind the solution. This is self-explanation (Bisra et al. 2018) without typing and
// without a word list (CLAUDE.md rule 3): the reasons belong to the question, and her tap decides.
//
// The reasons are written with the question's hints, in the background call that already exists
// (`hints.ts`). Code checks them there (`checkedWhy`). Her tap is judged here by code, against the
// index stored with them, with no model call. The app's reply is a fixed sentence. Her tap and
// the reply are practice turns with `reexplain = 'why'`, so they stand after the solution like
// every "why" exchange (migration 0036, 0098).

import {
  WHY_REASONS,
  type AnswerResponse,
  type WhyRequest,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import type { Deps } from '../../deps.js';
import { t } from '../../i18n/index.js';
import { AppError } from '../../lib/errors.js';
import { CARD_PASS } from './cards.js';
import { mentionsSolution } from './tutor.js';
import { storeExchange } from './exchange.js';
import { replayTurn, type PracticeLearner } from './service.js';
import { loadSession } from './sessionRow.js';

/** The reasons as the model writes them, and as `items.why` keeps them. */
export const ItemWhy = z.object({
  reasons: z
    .array(z.string().trim().min(1).max(200))
    .length(WHY_REASONS)
    .describe(
      'three short reasons (at most 15 words each) why the solution is right: ONE is the true rule or concept behind it, the other two sound plausible but are wrong (typical misconceptions). None states the answer or the result.',
    ),
  correct: z
    .number()
    .int()
    .min(0)
    .max(WHY_REASONS - 1)
    .describe('the number (0–2) of the true reason; vary its place'),
});
export type ItemWhy = z.infer<typeof ItemWhy>;

/** Stored reasons, read back through the contract they were written under, or none. */
export function whyOf(raw: unknown): ItemWhy | null {
  const parsed = ItemWhy.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The reasons kept for a question, or null when they cannot be offered: not exactly three
 * different ones, or one that states the solution. A reason that does would give the right one
 * away by its answer instead of its rule.
 */
export function checkedWhy(
  raw: unknown,
  secrets: readonly string[],
  visible: string,
): ItemWhy | null {
  const why = whyOf(raw);
  if (!why) return null;
  const distinct = new Set(why.reasons.map((r) => r.toLowerCase().replace(/\s+/g, ' ')));
  if (distinct.size !== WHY_REASONS) return null;
  const leaks = why.reasons.some((r) => secrets.some((sol) => mentionsSolution(r, sol, visible)));
  return leaks ? null : why;
}

/**
 * Her tap on a reason: judged by code, answered with a fixed sentence, once per question.
 * Idempotent per `client_turn_id`. 404 for a question that is not in her run. 409 for an open
 * question, one without reasons, a running test or a second tap.
 */
export async function answerWhy(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: WhyRequest,
): Promise<AnswerResponse> {
  // The same tap again gets what the first one got.
  const again = await replayTurn(deps, learner.id, sessionId, input.client_turn_id);
  if (again) return again;
  const session = await loadSession(deps.db, learner.id, sessionId);
  if ((session.mode === 'test' && session.status === 'active') || session.pass === CARD_PASS) {
    throw new AppError('conflict', 'No explanations here', { reason: 'reexplain_not_allowed' });
  }
  const turn = { clientTurnId: input.client_turn_id, itemId: input.item_id, way: 'why' as const };
  return storeExchange(deps, learner.id, sessionId, turn, async (tx) => {
    const row = await tx.maybeOne<{ status: string; why: unknown; asked: boolean }>(
      `select si.status, i.why,
              exists (select 1 from practice_turns pt
                       where pt.session_id = si.session_id and pt.item_id = si.item_id
                         and pt.reexplain = 'why' and pt.role = 'learner') as asked
         from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3
        for update of si`,
      [sessionId, input.item_id, learner.id],
    );
    if (!row) throw new AppError('not_found', 'Question not in this session');
    if (row.status === 'open') {
      throw new AppError('conflict', 'Its solution is not shown yet', { reason: 'try_first' });
    }
    const why = whyOf(row.why);
    if (!why) throw new AppError('conflict', 'No reasons for this question', { reason: 'no_why' });
    if (row.asked) {
      throw new AppError('conflict', 'She already picked a reason', { reason: 'why_answered' });
    }
    const right = why.reasons[why.correct]!;
    return {
      asked: why.reasons[input.choice]!,
      reply: t(
        learner.locale,
        input.choice === why.correct ? 'practice.why.right' : 'practice.why.not_quite',
        {
          reason: right,
        },
      ),
    };
  });
}
