// Every job kind has a visible terminal state (audit S-5). docs/architecture.md §Background work.
//
// A job that failed all its attempts is parked as `failed`. Parking is never the end of the
// story: each kind has a defined effect, enforced by the type below (a new kind without one
// does not compile):
//   buddy_check   — the learner still gets the fixed, model-free fallback for it (a countdown
//                   before a test, "how did it go", the answer to her photos); an agreed
//                   reminder is sent by its template (audit failed-countdown-never-fires-no-fallback)
//   buddy_turn    — her message is marked failed with a code, never "processing" forever
//   extract_material, purge_photos, delete_account — reported to the operator: parked counts
//                   and the last error per kind in GET /health (their retry policy lives with
//                   the materials and privacy modules)
// Handling is recorded on the job (`result.terminal`), so each parked job is handled once.

import type { Deps } from '../../deps.js';
import { enqueueJob, type JobKind, type JobRow } from './jobs.js';

type TerminalEffect = (deps: Deps, job: JobRow) => Promise<string>;

const operator: TerminalEffect = async () => 'reported';

export const TERMINAL: { [K in JobKind]: TerminalEffect } = {
  buddy_check: async (deps, job) => {
    // A fallback that itself failed ends here (reported like the others).
    if (job.payload.fallback_only === true || !job.learner_id) return 'reported';
    await enqueueJob(deps.db, {
      learnerId: job.learner_id,
      kind: 'buddy_check',
      runAt: deps.now(),
      dedupeKey: `${job.dedupe_key}:fallback`,
      payload: { ...job.payload, fallback_only: true, parked_error: job.last_error },
      maxAttempts: 1,
    });
    return 'fallback_queued';
  },
  buddy_turn: async (deps, job) => {
    const messageId = typeof job.payload.message_id === 'string' ? job.payload.message_id : null;
    if (!messageId || !job.learner_id) return 'reported';
    await deps.db.query(
      `update buddy_messages set status = 'failed', failure_code = 'internal'
        where id = $1 and learner_id = $2 and status = 'processing'`,
      [messageId, job.learner_id],
    );
    return 'message_failed';
  },
  extract_material: operator,
  purge_photos: operator,
  delete_account: operator,
};

/** Apply the terminal effect of every parked job not handled yet. */
export async function handleParkedJobs(deps: Deps, limit = 50): Promise<number> {
  const parked = await deps.db.query<JobRow>(
    `select * from jobs
      where status = 'failed' and not (coalesce(result, '{}'::jsonb) ? 'terminal')
      order by finished_at nulls first, seq
      limit $1`,
    [limit],
  );
  for (const job of parked) {
    const effect = await TERMINAL[job.kind](deps, job);
    await deps.db.query(
      `update jobs set result = coalesce(result, '{}'::jsonb) || jsonb_build_object('terminal', $2::text)
        where id = $1 and status = 'failed'`,
      [job.id, effect],
    );
  }
  return parked.length;
}
