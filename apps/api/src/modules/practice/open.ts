// An app request opens a run; preparing an offer never does (#868).
// docs/architecture.md §Practice. Hints run beside the request, not on its critical path.

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { prepareHints } from './hints.js';
import type { PracticeLearner } from './service.js';

/** Record the app's first open and its offer counter atomically, including resume. */
export async function openSession(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
): Promise<void> {
  await deps.db.tx(async (tx) => {
    const opened = await tx.maybeOne<{ client_request_id: string | null }>(
      `update practice_sessions set opened_at = $3
        where id = $1 and learner_id = $2 and opened_at is null
        returning client_request_id`,
      [sessionId, learner.id, deps.now()],
    );
    if (!opened) {
      const existing = await tx.maybeOne(
        'select id from practice_sessions where id = $1 and learner_id = $2',
        [sessionId, learner.id],
      );
      if (!existing) throw new AppError('not_found', 'Session not found');
      return;
    }
    if (!opened.client_request_id) return;
    await tx.query(
      `update offer_counters set opened = 1
        where action_id = $1 and learner_id = $2 and opened = 0`,
      [opened.client_request_id, learner.id],
    );
  });
  deps.background(() => prepareOpenedHints(deps, learner, sessionId));
}

/**
 * Claim each question once in the database, also across simultaneous opens or streamed batches.
 * An unopened run claims nothing. An open racing the remaining questions sees them here, or
 * their writer claims them after its commit. A failed call keeps the existing tutor fallback.
 */
export async function prepareOpenedHints(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  itemIds?: readonly string[],
): Promise<void> {
  const claimed = await deps.db.query<{ item_id: string }>(
    `update session_items si set hints_requested_at = $3
      from practice_sessions ps, items i
      where si.session_id = $1 and ps.id = si.session_id and ps.learner_id = $2
        and ps.opened_at is not null and ps.hints_on_open
        and ps.status = 'active' and ps.mode in ('practice', 'test')
        and i.id = si.item_id and i.learner_id = $2 and i.hints = '{}'
        and i.kind not in ('vocab', 'speak', 'spelling_dictation')
        and si.hints_requested_at is null
        and ($4::uuid[] is null or si.item_id = any($4::uuid[]))
      returning si.item_id`,
    [sessionId, learner.id, deps.now(), itemIds ?? null],
  );
  await prepareHints(
    deps,
    learner,
    sessionId,
    claimed.map((r) => r.item_id),
  ).catch(() => 0);
}
