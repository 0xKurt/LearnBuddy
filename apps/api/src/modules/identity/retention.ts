// Retention and erasure every Buddy has, whatever it teaches (issue #107). docs/privacy.md
// §What is stored, §Export and deletion (D-7, D-9):
//
//   storage queue  → paths still owed to Storage after an account deletion (D-9), retried in
//                    chunks of at most 1000 until they are gone;
//   memories       → removed or replaced memories whose undo window has passed;
//   decisions      → what the model wrote while deciding, and the bookkeeping of its calls;
//   backlog        → what /health reports as overdue.
//
// A domain's own retention (photos of a sheet, its questions) stays with the domain and joins the
// scheduler's retention pass through its registry (scheduler/registry.ts).

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { STORAGE_REMOVE_LIMIT } from '../../storage/gateway.js';

/** Deletions waiting longer than this are reported by /health. */
const ERASURE_OVERDUE_MS = 86_400_000;
/** Removing or correcting a memory can be undone this long; then its words are erased. */
const MEMORY_UNDO_DAYS = 7;

const DAY = 86_400_000;

/** Counts for /health: erasure that is later than promised. */
export async function erasureBacklog(
  db: Db,
  now: Date,
): Promise<{ overdue_deletions: number; overdue_photo_deletions: number }> {
  const before = new Date(now.getTime() - ERASURE_OVERDUE_MS);
  const row = await db.one<{ accounts: number; photos: number }>(
    `select (select count(*) from accounts where deletion_due_at < $1)::int as accounts,
            (select count(*) from storage_deletions where created_at < $1)::int as photos`,
    [before],
  );
  return { overdue_deletions: row.accounts, overdue_photo_deletions: row.photos };
}

/**
 * Works off the Storage deletion queue (photo paths owed after an account deletion, D-9):
 * due rows in requests of at most 1000 paths; a failure keeps them queued with backoff.
 */
export async function drainStorageDeletions(
  deps: Deps,
  opts: { prefix?: string; batches?: number } = {},
): Promise<{ removed: number; waiting: number }> {
  let removed = 0;
  let waiting = 0;
  for (let b = 0; b < (opts.batches ?? 5); b++) {
    const now = deps.now();
    const rows = await deps.db.query<{ path: string }>(
      `select path from storage_deletions
        where next_attempt_at <= $1 and ($2::text is null or starts_with(path, $2::text))
        order by next_attempt_at, path
        limit $3`,
      [now, opts.prefix ?? null, STORAGE_REMOVE_LIMIT],
    );
    if (rows.length === 0) break;
    const paths = rows.map((r) => r.path);
    try {
      await deps.storage.remove(paths);
    } catch (err) {
      // Stays queued: 2, 4, 8 … minutes later, at most 6 h. /health reports it once overdue.
      await deps.db.query(
        `update storage_deletions
            set attempts = attempts + 1, last_error = $3,
                next_attempt_at = $2::timestamptz
                  + make_interval(secs => least(60 * power(2, attempts + 1), 21600))
          where path = any($1::text[])`,
        [paths, now, err instanceof Error ? err.message.slice(0, 200) : 'error'],
      );
      waiting += paths.length;
      break;
    }
    await deps.db.query(`delete from storage_deletions where path = any($1::text[])`, [paths]);
    removed += paths.length;
    if (rows.length < STORAGE_REMOVE_LIMIT) break;
  }
  return { removed, waiting };
}

/**
 * Removed or replaced memories are erased once their undo window has passed, and temporary
 * situations a week after they ended ("Entfernt. Buddy vergisst das." — D-7). The copies of
 * the words in Buddy's audit trail (the action's arguments and summary, the decision's
 * validated output) are blanked with them.
 */
export async function purgeClosedMemories(deps: Deps): Promise<number> {
  const cutoff = new Date(deps.now().getTime() - MEMORY_UNDO_DAYS * DAY);
  return deps.db.tx(async (tx) => {
    const gone = await tx.query<{ id: string; learner_id: string }>(
      `delete from buddy_memories
        where id in (select id from buddy_memories
                      where (closed_at is not null and closed_at < $1)
                         or (status = 'active' and kind = 'constraint' and valid_until < $1)
                      limit 500)
        returning id, learner_id`,
      [cutoff],
    );
    if (gone.length === 0) return 0;
    const ids = gone.map((g) => g.id);
    const actions = await tx.query<{ decision_id: string | null }>(
      `update buddy_actions
          set args = args - 'statement' - 'quote',
              result = case when result ? 'statement'
                            then jsonb_set(result, '{statement}', '"…"'::jsonb) else result end
        where result ->> 'memory_id' = any($1::text[])
        returning decision_id`,
      [ids],
    );
    const decisions = [
      ...new Set(actions.map((a) => a.decision_id).filter((d): d is string => d !== null)),
    ];
    if (decisions.length > 0) {
      await tx.query(
        `update buddy_decisions d
            set output = jsonb_set(d.output, '{actions}', (
                  select coalesce(jsonb_agg(
                           case when jsonb_typeof(x -> 'args') = 'object'
                                then jsonb_set(x, '{args}', (x -> 'args') - 'statement' - 'quote')
                                else x end), '[]'::jsonb)
                    from jsonb_array_elements(d.output -> 'actions') x))
          where d.id = any($1::uuid[]) and jsonb_typeof(d.output -> 'actions') = 'array'`,
        [decisions],
      );
    }
    return gone.length;
  });
}

/**
 * What the model wrote while deciding, and the bookkeeping of its calls (issue #78).
 * A decision's `output` holds Buddy's reply and what he quoted from her — that is her
 * content, and it has no reason to live longer than the conversation needs it for
 * debugging. After DECISION_CONTENT_DAYS only the shape of the decision remains
 * (disposition, model, prompt version, timing); after CALL_LOG_DAYS the pure
 * bookkeeping rows go as well (they never held content: tokens, cost, latency).
 * Both are in docs/privacy.md §What is stored.
 */
const DECISION_CONTENT_DAYS = 90;
const CALL_LOG_DAYS = 180;

/** Returns how many rows were changed; runs in small bites, like every other sweep. */
export async function purgeDecisionContent(deps: Deps): Promise<number> {
  const now = deps.now().getTime();
  const contentCutoff = new Date(now - DECISION_CONTENT_DAYS * DAY);
  const callCutoff = new Date(now - CALL_LOG_DAYS * DAY);
  const cleared = await deps.db.query<{ id: string }>(
    `update buddy_decisions set output = null, errors = null, triggers = '[]'::jsonb
      where id in (select id from buddy_decisions
                    where created_at < $1 and (output is not null or errors is not null)
                    limit 500)
      returning id`,
    [contentCutoff],
  );
  const calls = await deps.db.query<{ id: string }>(
    `delete from llm_calls
      where id in (select id from llm_calls where created_at < $1 limit 1000)
      returning id`,
    [callCutoff],
  );
  return cleared.length + calls.length;
}
