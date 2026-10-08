// Interrupted conversation turns: the scheduler queues a recovery job for a message stuck in
// "processing" (queueStalledTurns), the learner's worker takes it over (resumeTurns).
// Split from check.ts (#311); docs/architecture.md §Turns.

import type { Deps } from '../../deps.js';
import { enqueueJob, finishJob, type JobRow } from '../scheduler/jobs.js';
import { claimMessage, processTurn, TURN_STALL_MS, type TurnLearner } from './turn.js';

/** How often a turn that keeps dying is taken over before it fails. */
const MAX_TURN_RECOVERIES = 3;

/** Interrupted turns: queue a recovery job for messages stuck in "processing". */
export async function queueStalledTurns(deps: Deps): Promise<number> {
  const now = deps.now();
  const stalled = await deps.db.query<{
    id: string;
    learner_id: string;
    claim_token: string | null;
  }>(
    `select id, learner_id, claim_token from buddy_messages
      where role = 'learner' and status = 'processing' and (claimed_at is null or claimed_at < $1)
      limit 50`,
    [new Date(now.getTime() - TURN_STALL_MS)],
  );
  for (const m of stalled) {
    // A turn that keeps dying (a crash, not a model error) is taken over at most
    // MAX_TURN_RECOVERIES times, then it fails honestly instead of being re-billed every
    // few minutes (p2-J-stall-recovery-loop-drains-budget).
    const tried = await deps.db.one<{ n: number }>(
      `select count(*)::int as n from jobs
        where learner_id = $1 and kind = 'buddy_turn' and payload ->> 'message_id' = $2`,
      [m.learner_id, m.id],
    );
    if (tried.n >= MAX_TURN_RECOVERIES) {
      await deps.db.query(
        `update buddy_messages set status = 'failed', failure_code = 'internal'
          where id = $1 and status = 'processing' and claim_token is not distinct from $2`,
        [m.id, m.claim_token],
      );
      continue;
    }
    await enqueueJob(deps.db, {
      learnerId: m.learner_id,
      kind: 'buddy_turn',
      runAt: now,
      // One recovery per claim: a later takeover that stalls again gets its own.
      dedupeKey: `turn:${m.id}:${m.claim_token ?? 'unclaimed'}`,
      payload: { message_id: m.id },
      maxAttempts: 2,
    });
  }
  return stalled.length;
}

/** The learner's claimed `buddy_turn` jobs: take each stalled turn over with a new claim, run it again. */
export async function resumeTurns(
  deps: Deps,
  learner: TurnLearner,
  jobs: JobRow[],
  now: Date,
): Promise<void> {
  for (const job of jobs) {
    const messageId = typeof job.payload.message_id === 'string' ? job.payload.message_id : null;
    const msg = messageId
      ? await deps.db.maybeOne<{
          id: string;
          status: string;
          claim_token: string | null;
          claimed_at: Date | null;
        }>(
          `select id, status, claim_token, claimed_at from buddy_messages where id = $1 and learner_id = $2`,
          [messageId, learner.id],
        )
      : null;
    const stalled =
      msg?.status === 'processing' &&
      (!msg.claimed_at || now.getTime() - msg.claimed_at.getTime() > TURN_STALL_MS);
    const claimed =
      msg && stalled ? await claimMessage(deps, learner.id, msg.id, msg.claim_token) : null;
    if (claimed) {
      const r = await processTurn(deps, learner, claimed);
      await finishJob(deps.db, job, deps.now(), {
        status: 'done',
        result: { outcome: r.status },
      });
    } else {
      await finishJob(deps.db, job, now, {
        status: 'done',
        result: { outcome: 'nothing_to_resume' },
      });
    }
  }
}
