// Retention and erasure of what the learner photographed, deleted or had Buddy forget.
// docs/privacy.md §What is stored, §Export and deletion (D-7, D-9).
//
//   purge_photos   → a material's photos leave Storage (7 days after reading, at once when
//                    deleted or not learning material). Retried with backoff, never parked.
//   purge_content  → a deleted material's transcript, title and questions (with their
//                    answers and memory state), or one deleted question, are erased.
//   storage queue  → photo paths still owed to Storage after an account deletion (D-9),
//                    retried in chunks of at most 1000 until they are gone.
//   sweeps         → a safety net for photos no job will purge any more, and removed or
//                    replaced memories whose undo window has passed.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { removeAll, STORAGE_REMOVE_LIMIT } from '../../storage/gateway.js';
import { bumpContext } from '../buddy/plan.js';
import { enqueueJob, finishJob, type JobRow } from '../scheduler/jobs.js';

export const PHOTO_RETENTION_DAYS = 7;
/** Removing or correcting a memory can be undone this long; then its words are erased. */
export const MEMORY_UNDO_DAYS = 7;
/**
 * Signed upload URLs stay valid for 2 hours (Supabase Storage). Photos of a deleted sheet
 * that arrive later are removed by a second purge once no URL can deliver any more.
 */
export const UPLOAD_URL_TTL_MS = 2 * 3_600_000;
/** Storage deletions waiting longer than this are reported by /health. */
export const ERASURE_OVERDUE_MS = 86_400_000;

const DAY = 86_400_000;

/**
 * Photos of one material leave Storage; `photos_deleted_at` only once they really did.
 * With `positions` in the payload only those photos go (a photo of something else inside a
 * sheet that was read — p2-page-not-material-photo-kept-7-days); the rest keep their retention.
 */
export async function purgePhotos(deps: Deps, job: JobRow): Promise<void> {
  const materialId = String(job.payload.material_id ?? '');
  const positions = Array.isArray(job.payload.positions)
    ? job.payload.positions.filter((p): p is number => Number.isInteger(p))
    : null;
  const photos = await deps.db.query<{ storage_path: string }>(
    `select storage_path from material_photos
      where material_id = $1 and ($2::int[] is null or position = any($2::int[]))`,
    [materialId, positions],
  );
  // A Storage failure throws: the job is retried with backoff (scheduler/jobs.ts PERSISTENT_KINDS).
  await removeAll(
    deps.storage,
    photos.map((p) => p.storage_path),
  );
  if (!positions)
    await deps.db.query(`update materials set photos_deleted_at = $2 where id = $1`, [
      materialId,
      deps.now(),
    ]);
  await finishJob(deps.db, job, deps.now(), { status: 'done', result: { removed: photos.length } });
}

/** Plans the erasure of a deleted material's content (and of its merged pages). */
export async function enqueueContentPurge(
  db: Db,
  learnerId: string,
  target: { materialId: string } | { itemId: string },
  now: Date,
): Promise<void> {
  const key = 'materialId' in target ? `material:${target.materialId}` : `item:${target.itemId}`;
  await enqueueJob(db, {
    learnerId,
    kind: 'purge_content',
    runAt: now,
    dedupeKey: `purge-content:${key}`,
    payload:
      'materialId' in target ? { material_id: target.materialId } : { item_id: target.itemId },
  });
}

/**
 * "Blatt löschen" / "Frage löschen" really delete (D-7): the transcript, title and page
 * report are erased, and the questions are deleted with their answers, practice turns and
 * memory state (ON DELETE CASCADE). What remains of the sheet is a row with ids, dates and
 * counts, so the learning history (sessions, steps, events) stays consistent.
 */
export async function purgeContent(deps: Deps, job: JobRow): Promise<void> {
  const now = deps.now();
  const result = await deps.db.tx(async (tx) => {
    if (typeof job.payload.item_id === 'string') {
      const gone = await tx.query<{ learner_id: string }>(
        `delete from items where id = $1 and archived_at is not null returning learner_id`,
        [job.payload.item_id],
      );
      if (gone[0]) await bumpContext(tx, gone[0].learner_id);
      return { items: gone.length };
    }
    const materialId = String(job.payload.material_id ?? '');
    const m = await tx.maybeOne<{ learner_id: string; archived_at: Date | null }>(
      `select learner_id, archived_at from materials where id = $1 for update`,
      [materialId],
    );
    // Only deleted material is erased (the job is planned by archiveMaterial).
    if (!m || !m.archived_at) return { items: 0 };
    const ids = (
      await tx.query<{ id: string }>(
        `select id from materials where id = $1 or (merged_into = $1 and archived_at is not null)`,
        [materialId],
      )
    ).map((r) => r.id);
    const items = await tx.query(
      `delete from items where material_id = any($1::uuid[]) returning id`,
      [ids],
    );
    await tx.query(
      `update materials set extracted_text = null, title = null, page_problems = '[]'::jsonb,
                            content_purged_at = $2
        where id = any($1::uuid[])`,
      [ids, now],
    );
    // A help session's title and introduction come from the sheet.
    await tx.query(
      `update practice_sessions set title = null, intro = null where material_id = any($1::uuid[])`,
      [ids],
    );
    await bumpContext(tx, m.learner_id);
    return { items: items.length };
  });
  await finishJob(deps.db, job, now, { status: 'done', result });
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
 * Safety net: photos of material that is failed, deleted or read long enough ago, for which
 * no purge is planned any more (a crash between two steps, a job from before this rule).
 */
export async function sweepForgottenPhotos(deps: Deps): Promise<number> {
  const now = deps.now();
  const retention = new Date(now.getTime() - PHOTO_RETENTION_DAYS * DAY);
  return deps.db.tx(async (tx) => {
    const rows = await tx.query<{ id: string; learner_id: string }>(
      `select m.id, m.learner_id from materials m
        where m.photos_deleted_at is null
          and (m.archived_at is not null
               or (m.status = 'failed' and m.created_at < $1)
               or (m.status = 'ready' and m.ready_at < $1))
          and exists (select 1 from material_photos mp where mp.material_id = m.id)
          and not exists (select 1 from jobs j where j.kind = 'purge_photos'
                            and j.payload ->> 'material_id' = m.id::text
                            and j.status in ('queued','running'))
        limit 50`,
      [retention],
    );
    for (const m of rows) {
      await enqueueJob(tx, {
        learnerId: m.learner_id,
        kind: 'purge_photos',
        runAt: now,
        dedupeKey: `purge:${m.id}:sweep:${now.toISOString()}`,
        payload: { material_id: m.id },
      });
    }
    return rows.length;
  });
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
 * What the model wrote while deciding, and the bookkeeping of its calls (issue #78).
 * A decision's `output` holds Buddy's reply and what he quoted from her — that is her
 * content, and it has no reason to live longer than the conversation needs it for
 * debugging. After DECISION_CONTENT_DAYS only the shape of the decision remains
 * (disposition, model, prompt version, timing); after CALL_LOG_DAYS the pure
 * bookkeeping rows go as well (they never held content: tokens, cost, latency).
 * Both are in docs/privacy.md §What is stored.
 */
export const DECISION_CONTENT_DAYS = 90;
export const CALL_LOG_DAYS = 180;

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
