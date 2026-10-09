// "Blatt löschen" and "Frage löschen" (D-7): gone for her at once, erased by jobs right after.
// docs/architecture.md §Material.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import { enqueueContentPurge, enqueuePhotoPurge, UPLOAD_URL_TTL_MS } from './purge.js';

/**
 * "Blatt löschen" (D-7): the sheet and the pages added to it are gone for her at once —
 * out of the library, of Buddy's picture, of running sessions and prepared practice — and
 * their content and photos are erased by jobs right after (purge.ts). A reading still
 * running for it ends without a result (runExtraction re-checks under the row lock).
 */
export async function archiveMaterial(
  // Narrower than Deps on purpose: the conversation calls this too (issue #111), where only
  // the connection and the clock exist — and those are all this needs.
  deps: Pick<Deps, 'db' | 'now'>,
  learnerId: string,
  materialId: string,
): Promise<void> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const r = await tx.query(
      `update materials set archived_at = $3 where id = $1 and learner_id = $2 and archived_at is null returning id`,
      [materialId, learnerId, now],
    );
    if (r.length === 0) throw new AppError('not_found', 'Material not found');
    // Pages that joined it go with it (root-delete-leaves-part-notice). Pages still on their
    // way stay a sheet of their own when they are read: she did not delete those.
    const parts = await tx.query<{ id: string }>(
      `update materials set archived_at = $3
        where learner_id = $2 and archived_at is null and merged_into = $1
        returning id`,
      [materialId, learnerId, now],
    );
    const ids = [materialId, ...parts.map((p) => p.id)];
    const items = await tx.query<{ id: string }>(
      `update items set archived_at = $2 where material_id = any($1::uuid[]) and archived_at is null
       returning id`,
      [ids, now],
    );
    await withdrawItems(
      tx,
      learnerId,
      items.map((i) => i.id),
      now,
    );
    // A help session for this homework ends: there is nothing left to help with.
    await tx.query(
      `update practice_sessions set status = 'abandoned', last_activity_at = $3
        where learner_id = $2 and material_id = any($1::uuid[]) and status = 'active'`,
      [ids, learnerId, now],
    );
    for (const id of ids) {
      // Deleted by the learner: the photos go now, not after the retention period, and
      // once more when no upload URL can deliver a late photo any more.
      await enqueuePhotoPurge(tx, { learnerId, materialId: id, runAt: now, reason: 'archived' });
      await enqueuePhotoPurge(tx, {
        learnerId,
        materialId: id,
        runAt: new Date(now.getTime() + UPLOAD_URL_TTL_MS),
        reason: 'late',
      });
    }
    await enqueueContentPurge(tx, learnerId, { materialId }, now);
    await bumpContext(tx, learnerId);
  });
}

/**
 * Deleted questions leave every running session (closed as taken out, like "Frage passt
 * nicht") and Buddy's prepared practice; a prepared step left without questions goes back
 * to planned so Buddy prepares it anew (p2-HW-05, p2-stale-prepared-step-after-material-delete).
 */
async function withdrawItems(tx: Db, learnerId: string, itemIds: string[], now: Date) {
  if (itemIds.length === 0) return;
  await tx.query(
    `update session_items si set status = 'skipped', flagged_at = $3, closed_at = $3
       from practice_sessions ps
      where ps.id = si.session_id and ps.learner_id = $2 and ps.status = 'active'
        and si.status = 'open' and si.item_id = any($1::uuid[])`,
    [itemIds, learnerId, now],
  );
  await tx.query(
    `update buddy_steps s
        set payload = jsonb_set(s.payload, '{item_ids}', kept.ids),
            state = case when jsonb_array_length(kept.ids) = 0 and s.state = 'prepared'
                         then 'planned' else s.state end,
            version = s.version + 1
       from (select b.id, coalesce((select jsonb_agg(x) from jsonb_array_elements(b.payload -> 'item_ids') x
                                     where not (x #>> '{}' = any($1::text[]))), '[]'::jsonb) as ids
               from buddy_steps b
              where b.learner_id = $2 and b.state in ('planned','prepared')
                and jsonb_typeof(b.payload -> 'item_ids') = 'array'
                and b.payload -> 'item_ids' ?| $1::text[]) kept
      where s.id = kept.id`,
    [itemIds, learnerId],
  );
}

/**
 * The learner deletes one question of a material: archived, so it never comes up in
 * practice again. Idempotent — deleting it twice is fine; another learner's ids are 404.
 */
export async function archiveMaterialItem(
  // Narrower than Deps on purpose: the conversation calls this too (issue #120), where only
  // the connection and the clock exist — and those are all this needs.
  deps: Pick<Deps, 'db' | 'now'>,
  learnerId: string,
  materialId: string,
  itemId: string,
): Promise<void> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const item = await tx.maybeOne<{ archived_at: Date | null }>(
      `select i.archived_at from items i join materials m on m.id = i.material_id
        where i.id = $1 and i.material_id = $2 and i.learner_id = $3 and m.learner_id = $3
          and m.archived_at is null
        for update of i`,
      [itemId, materialId, learnerId],
    );
    if (!item) {
      // Deleted before and already erased: deleting it again is fine (idempotent).
      const erased = await tx.maybeOne(
        `select 1 from jobs j join materials m on m.id = $2 and m.learner_id = $3
          where j.kind = 'purge_content' and j.learner_id = $3 and j.dedupe_key = $1`,
        [`purge-content:item:${itemId}`, materialId, learnerId],
      );
      if (erased) return;
      throw new AppError('not_found', 'Question not found');
    }
    if (item.archived_at) return;
    await tx.query(`update items set archived_at = $2 where id = $1`, [itemId, now]);
    await withdrawItems(tx, learnerId, [itemId], now);
    // "Frage löschen" deletes it (D-7): its text, solution and her answers go by job.
    await enqueueContentPurge(tx, learnerId, { itemId }, now);
    // Buddy's picture of her material changed (question counts, what can be practised).
    await bumpContext(tx, learnerId);
  });
}
