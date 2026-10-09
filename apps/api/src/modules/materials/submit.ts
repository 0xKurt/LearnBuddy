// From uploaded photos to a queued reading: the photos are checked, the reading is queued, read
// again after a failure (bounded), and a send that never finished is given up.
// docs/architecture.md §Material.

import { FINAL_FAILURES } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { StorageError } from '../../storage/gateway.js';
import { bumpContext } from '../buddy/plan.js';
import { enqueueJob } from '../scheduler/jobs.js';
import { enqueuePhotoPurge } from './purge.js';
import { MAX_PAGES, MAX_PDF_BYTES, PDF_MIME, pdfPageCount } from './pdf.js';
import type { MaterialRow } from './view.js';

const ABANDON_UPLOAD_MS = 24 * 3_600_000;
const MAX_EXTRACTION_ATTEMPTS = 3;

/** Photos are uploaded: check they are really there, then queue the reading. */
export async function submitMaterial(
  deps: Deps,
  learnerId: string,
  materialId: string,
): Promise<{ jobId: string | null }> {
  const m = await deps.db.maybeOne<MaterialRow>(
    `select * from materials where id = $1 and learner_id = $2`,
    [materialId, learnerId],
  );
  if (!m) throw new AppError('not_found', 'Material not found');
  if (m.archived_at) {
    // Deleted while the photos were on their way: whatever arrived goes now.
    await enqueuePhotoPurge(deps.db, {
      learnerId,
      materialId,
      runAt: deps.now(),
      reason: `submitted:${deps.now().toISOString()}`,
    });
    throw new AppError('not_found', 'Material not found');
  }
  if (m.status !== 'awaiting_upload') return { jobId: null }; // idempotent
  // She asked for these pages (issue #56). Before this, a reservation is only pages lying
  // in her composer — the home says nothing about them and Buddy counts no sheet.
  await deps.db.query(
    `update materials set send_requested_at = coalesce(send_requested_at, $2) where id = $1`,
    [materialId, deps.now()],
  );
  const photos = await deps.db.query<{ position: number; storage_path: string }>(
    `select position, storage_path from material_photos where material_id = $1 order by position`,
    [materialId],
  );
  let present: Set<string>;
  try {
    present = await deps.storage.existing(photos.map((p) => p.storage_path));
  } catch (err) {
    storageDown(err);
  }
  const missing = photos.filter((p) => !present.has(p.storage_path)).map((p) => p.position);
  if (missing.length > 0) throw photosMissing(missing);
  const pages = await countPdfPages(deps, learnerId, materialId);
  const now = deps.now();
  return deps.db.tx(async (tx) => {
    const upd = await tx.query(
      `update materials set status = 'queued', photo_count = $2
        where id = $1 and status = 'awaiting_upload' returning id`,
      [materialId, pages.total],
    );
    if (upd.length === 0) return { jobId: null };
    for (const [position, count] of pages.pdfs) {
      await tx.query(
        `update material_photos set page_count = $3 where material_id = $1 and position = $2`,
        [materialId, position, count],
      );
    }
    const jobId = await enqueueJob(tx, {
      learnerId,
      kind: 'extract_material',
      runAt: now,
      dedupeKey: `extract:${materialId}:1`,
      payload: { material_id: materialId },
      maxAttempts: MAX_EXTRACTION_ATTEMPTS,
    });
    await bumpContext(tx, learnerId);
    return { jobId };
  });
}

/** Storage could not say: never tell her the photos did not arrive (rule 5). */
function storageDown(err: unknown): never {
  if (err instanceof StorageError)
    throw new AppError('unavailable', 'Photo storage is not reachable', {
      reason: 'storage_unavailable',
    });
  throw err;
}

/** The pages at these positions never reached Storage: she can send them again. */
function photosMissing(missing: number[]): AppError {
  return new AppError('invalid_input', 'Some photos did not arrive', {
    reason: 'photos_missing',
    missing,
  });
}

/**
 * The pages of the uploaded files: a photo is one page, a PDF as many as it has. A file
 * that is not a readable PDF, PDFs too large for the model call, or more than 20 pages
 * together end this material here: it is set aside and its files deleted at once, and she
 * is told why (never a reading that cannot work).
 */
async function countPdfPages(
  deps: Deps,
  learnerId: string,
  materialId: string,
): Promise<{ total: number; pdfs: Map<number, number> }> {
  const files = await deps.db.query<{ position: number; storage_path: string; mime: string }>(
    `select position, storage_path, mime from material_photos where material_id = $1 order by position`,
    [materialId],
  );
  const pdfs = new Map<number, number>();
  let bytesTotal = 0;
  let refusal: { reason: string; details: Record<string, unknown> } | null = null;
  for (const f of files) {
    if (f.mime !== PDF_MIME) continue;
    let bytes: Uint8Array | null;
    try {
      bytes = await deps.storage.download(f.storage_path);
    } catch (err) {
      storageDown(err);
    }
    if (!bytes) throw photosMissing([f.position]);
    bytesTotal += bytes.length;
    if (bytesTotal > MAX_PDF_BYTES) {
      refusal = { reason: 'file_too_large', details: { max_mb: MAX_PDF_BYTES / 1024 / 1024 } };
      break;
    }
    const count = await pdfPageCount(bytes);
    if (count === null) {
      refusal = { reason: 'file_unreadable', details: { position: f.position } };
      break;
    }
    pdfs.set(f.position, count);
  }
  const total = files.length - pdfs.size + [...pdfs.values()].reduce((a, b) => a + b, 0);
  if (!refusal && total > MAX_PAGES)
    refusal = { reason: 'too_many_pages', details: { pages: total, max: MAX_PAGES } };
  if (!refusal) return { total, pdfs };
  await deps.db.tx(async (tx) => {
    const set = await tx.query(
      `update materials set status = 'failed', failure_reason = 'unreadable', failed_at = $2,
              archived_at = $2
        where id = $1 and status = 'awaiting_upload' and archived_at is null returning id`,
      [materialId, deps.now()],
    );
    if (set.length === 0) return;
    await enqueuePhotoPurge(tx, { learnerId, materialId, runAt: deps.now(), reason: 'refused' });
  });
  throw new AppError('invalid_input', 'These files cannot be read as one material', {
    reason: refusal.reason,
    ...refusal.details,
  });
}

export async function retryMaterial(
  deps: Deps,
  learnerId: string,
  materialId: string,
): Promise<{ jobId: string | null }> {
  const now = deps.now();
  return deps.db.tx(async (tx) => {
    const m = await tx.maybeOne<MaterialRow>(
      `select * from materials where id = $1 and learner_id = $2 for update`,
      [materialId, learnerId],
    );
    if (!m) throw new AppError('not_found', 'Material not found');
    if (m.status !== 'failed')
      throw new AppError('conflict', 'Only failed material can be retried');
    // Not learning material, refused by the filter, every task a form Buddy has no exercise
    // for (#198), a corrected test with nothing marked (#259): a second reading gives the same.
    if (m.failure_reason && FINAL_FAILURES.has(m.failure_reason)) {
      throw new AppError('conflict', 'Reading this again would give the same answer', {
        reason: m.failure_reason,
      });
    }
    if (m.failure_reason === 'photos_missing') {
      // The photos never all arrived (a send given up, a file gone from Storage): reading
      // again has nothing to read. Photographing it again is the only way on (issue #115).
      throw new AppError('conflict', 'The photos of this material never arrived', {
        reason: 'photos_never_arrived',
      });
    }
    if (m.photos_deleted_at) {
      // The photos are gone (retention or deletion): a new reading has nothing to read.
      throw new AppError('conflict', 'The photos of this material are deleted', {
        reason: 'photos_deleted',
      });
    }
    // Runs refused for the daily budget or lost to a provider/Storage outage were not
    // her sheet's fault and do not count (budget-refusals-consume-retry-runs).
    // A reading the learner's own answer asked for is not one of her three readings of the
    // sheet (issue #164): it reads one task she settled, and it must never be the reason
    // "Nochmal lesen" is refused.
    const runs = await tx.one<{ n: number; counted: number }>(
      `select count(*)::int as n,
              count(*) filter (where coalesce((result ->> 'uncounted')::boolean, false) = false)::int
                as counted
         from jobs where kind = 'extract_material' and payload ->> 'material_id' = $1
           and payload ->> 'unclear_spot_id' is null`,
      [materialId],
    );
    if (runs.counted >= MAX_EXTRACTION_ATTEMPTS)
      throw new AppError('conflict', 'Retried too often', { reason: 'retry_limit' });
    await tx.query(
      `update materials set status = 'queued', failure_reason = null, read_stage = null where id = $1`,
      [materialId],
    );
    const jobId = await enqueueJob(tx, {
      learnerId,
      kind: 'extract_material',
      runAt: now,
      dedupeKey: `extract:${materialId}:${runs.n + 1}`,
      payload: { material_id: materialId },
      maxAttempts: MAX_EXTRACTION_ATTEMPTS,
    });
    await bumpContext(tx, learnerId);
    return { jobId };
  });
}

/**
 * Photos that never all arrived (the app was closed mid-send, the connection broke) are given
 * up after a day. What that leaves behind depends on whether she ever asked for these pages
 * to go (issue #56, `send_requested_at`):
 *
 *   - She tapped "Senden": the sheet stays as `failed` / `photos_missing` and is NOT archived
 *     (issue #115 — failing and archiving in one statement made the sheet vanish from the
 *     home, the library and Buddy's picture in the same instant, so nobody could ever say
 *     where her blatt went). The partial photos are deleted now: there is nothing left to
 *     read, a new photo is the only way on, and Buddy can say exactly that.
 *   - Nobody asked to send it — pages that were lying in her composer: it never was a sheet,
 *     so it is set aside silently, as before.
 */
export async function abandonStaleUploads(deps: Deps): Promise<number> {
  const now = deps.now();
  const cutoff = new Date(now.getTime() - ABANDON_UPLOAD_MS);
  return deps.db.tx(async (tx) => {
    const sent = await tx.query<{ id: string; learner_id: string }>(
      `update materials set status = 'failed', failure_reason = 'photos_missing', failed_at = $1
        where status = 'awaiting_upload' and archived_at is null and created_at < $2
          and send_requested_at is not null
        returning id, learner_id`,
      [now, cutoff],
    );
    const neverSent = await tx.query<{ id: string; learner_id: string }>(
      `update materials set status = 'failed', failure_reason = 'photos_missing', failed_at = $1,
              archived_at = $1
        where status = 'awaiting_upload' and archived_at is null and created_at < $2
          and send_requested_at is null
        returning id, learner_id`,
      [now, cutoff],
    );
    for (const m of [...sent, ...neverSent]) {
      await enqueuePhotoPurge(tx, {
        learnerId: m.learner_id,
        materialId: m.id,
        runAt: now,
        reason: 'abandoned',
      });
    }
    // Only the sheets that stay change what Buddy sees (rule 4).
    for (const learnerId of new Set(sent.map((m) => m.learner_id)))
      await bumpContext(tx, learnerId);
    return sent.length + neverSent.length;
  });
}
