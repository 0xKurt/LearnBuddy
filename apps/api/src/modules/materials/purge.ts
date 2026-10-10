// Retention and erasure of what the learner photographed, deleted or had Buddy forget.
// docs/privacy.md §What is stored, §Export and deletion (D-7, D-9).
//
//   purge_photos   → a material's photos leave Storage (7 days after reading, at once when
//                    deleted or not learning material). Retried with backoff, never parked.
//   purge_content  → a deleted material's transcript, title and questions (with their
//                    answers and memory state), or one deleted question, are erased.
//   sweep          → a safety net for photos no job will purge any more.
// The storage queue after an account deletion, closed memories and the model's decision content
// are every Buddy's retention (identity/retention.ts, issue #107).

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { removeAll } from '../../storage/gateway.js';
import { bumpContext } from '../buddy/plan.js';
import { enqueueJob, finishJob, type JobRow } from '../scheduler/jobs.js';

export const PHOTO_RETENTION_DAYS = 7;
/**
 * Signed upload URLs stay valid for 2 hours (Supabase Storage). Photos of a deleted sheet
 * that arrive later are removed by a second purge once no URL can deliver any more.
 */
export const UPLOAD_URL_TTL_MS = 2 * 3_600_000;

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

/** Crop paths owed to Storage go on the durable queue (drained by the tick; D-9 pattern). */
async function queueImageDeletions(db: Db, paths: string[], now: Date): Promise<void> {
  for (const path of paths) {
    await db.query(
      `insert into storage_deletions (path, reason, next_attempt_at, created_at)
       values ($1, 'material', $2, $2) on conflict (path) do nothing`,
      [path, now],
    );
  }
}

/**
 * Plans the deletion of a material's photos at `runAt`: all of them, or only `positions`.
 * `reason` keeps the occasions apart, one job each; without one it is the retention purge
 * after the reading (or the failure) that every material gets once.
 */
export async function enqueuePhotoPurge(
  db: Db,
  o: { learnerId: string; materialId: string; runAt: Date; reason?: string; positions?: number[] },
): Promise<void> {
  await enqueueJob(db, {
    learnerId: o.learnerId,
    kind: 'purge_photos',
    runAt: o.runAt,
    dedupeKey: o.reason ? `purge:${o.materialId}:${o.reason}` : `purge:${o.materialId}`,
    payload: o.positions
      ? { material_id: o.materialId, positions: o.positions }
      : { material_id: o.materialId },
  });
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
      const gone = await tx.query<{ learner_id: string; image_id: string | null }>(
        `delete from items where id = $1 and archived_at is not null returning learner_id, image_id`,
        [job.payload.item_id],
      );
      // The question's concept image goes with it — once no other question shows it
      // (issue #50; the crop is derived content like the question's own text).
      if (gone[0]?.image_id) {
        const orphaned = await tx.query<{ storage_path: string }>(
          `delete from material_images mi where mi.id = $1
            and not exists (select 1 from items i where i.image_id = mi.id)
            returning storage_path`,
          [gone[0].image_id],
        );
        await queueImageDeletions(
          tx,
          orphaned.map((o) => o.storage_path),
          now,
        );
      }
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
    // Concept images are derived content like the transcript: their crops leave
    // Storage with it, through the durable deletion queue (a Storage outage only
    // delays them; the tick drains the queue — issue #50, docs/privacy.md).
    const images = await tx.query<{ storage_path: string }>(
      `delete from material_images where material_id = any($1::uuid[]) returning storage_path`,
      [ids],
    );
    await queueImageDeletions(
      tx,
      images.map((i) => i.storage_path),
      now,
    );
    // An unsettled spot quotes her task as printed (issue #164): it is content of the sheet and
    // goes with it, like the transcript and the crops.
    await tx.query(
      `delete from material_unclear_spots
        where material_id = any($1::uuid[]) or sheet_id = any($1::uuid[])`,
      [ids],
    );
    // `not_practicable` holds her tasks AS PRINTED (issue #198) — the same kind of content as
    // the transcript, and it survived this purge until issue #237. A deleted sheet keeps ids,
    // dates and counts; it keeps nothing she wrote or photographed.
    await tx.query(
      `update materials set extracted_text = null, title = null, page_problems = '[]'::jsonb,
                            not_practicable = '[]'::jsonb, content_purged_at = $2
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
      await enqueuePhotoPurge(tx, {
        learnerId: m.learner_id,
        materialId: m.id,
        runAt: now,
        reason: `sweep:${now.toISOString()}`,
      });
    }
    return rows.length;
  });
}
