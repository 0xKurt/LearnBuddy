// Material: photos in, questions out — durable and honest about progress.
// docs/architecture.md §Material.
//
//   create  → reserve the material + signed upload URLs (idempotent per client id)
//   submit  → verify the photos really arrived, enqueue extraction
//   job     → read the photos with the model, store questions, wake Buddy
//   retry   → only after a failure, bounded
// Status is what the database says: awaiting_upload → queued → processing →
// ready | failed(reason). Nothing claims "in the background" unless a job
// exists for it.

import type {
  CreateMaterialRequest,
  Figure,
  ItemResult,
  LibraryView,
  MaterialItemsView,
  MaterialView,
  PageProblem,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError, isAppError } from '../../lib/errors.js';
import { localParts } from '../../lib/time.js';
import { callModel } from '../../llm/call.js';
import { LlmError, type LlmPart } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { ageOn } from '../identity/model.js';
import { bumpContext, findOrCreateSubject } from '../buddy/plan.js';
import { enqueueJob, finishJob, retryJob, type JobRow } from '../scheduler/jobs.js';
import { StorageError } from '../../storage/gateway.js';
import { insertItems, usableItems } from '../practice/items.js';
import { createSession } from '../practice/service.js';
import {
  EXTRACT_PROMPT_VERSION,
  EXTRACT_SYSTEM,
  ExtractionParse,
  ExtractionResult,
  type PageReport,
  HOMEWORK_SYSTEM,
  HomeworkExtraction,
  LEAN_RULES,
} from './extract.js';
import { emitEvent } from '../buddy/events.js';
import {
  filesWhollyIn,
  MAX_PAGES,
  MAX_PDF_BYTES,
  PDF_MIME,
  pageRanges,
  pdfPageCount,
} from './pdf.js';
import { attachConceptImages } from './images.js';
import { indexMaterialPassages } from './passages.js';
import { enqueueContentPurge, PHOTO_RETENTION_DAYS, UPLOAD_URL_TTL_MS } from './purge.js';

const EXTRACTION_SCHEMA = toJsonSchema(ExtractionResult);
const HOMEWORK_SCHEMA = toJsonSchema(HomeworkExtraction);
const ABANDON_UPLOAD_MS = 24 * 3_600_000;
const MAX_EXTRACTION_ATTEMPTS = 3;

type MaterialRow = {
  id: string;
  learner_id: string;
  subject_id: string | null;
  goal_id: string | null;
  step_id: string | null;
  title: string | null;
  status: 'awaiting_upload' | 'queued' | 'processing' | 'ready' | 'failed';
  failure_reason: MaterialView['failure_reason'];
  photo_count: number;
  purpose: 'study' | 'homework';
  page_problems: PageProblem[];
  pages_resolved_at: Date | null;
  completes_material_id: string | null;
  merged_into: string | null;
  archived_at: Date | null;
  photos_deleted_at: Date | null;
  created_at: Date;
};

export async function materialView(
  db: Db,
  learnerId: string,
  materialId: string,
): Promise<MaterialView> {
  const m = await db.maybeOne<
    MaterialRow & {
      subject_name: string | null;
      item_count: number;
      session_id: string | null;
      session_status: MaterialView['session_status'];
    }
  >(
    `select m.*, s.name as subject_name,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as item_count,
            (select ps.id from practice_sessions ps where ps.material_id = m.id
              order by ps.started_at desc, ps.seq desc limit 1) as session_id,
            (select ps.status from practice_sessions ps where ps.material_id = m.id
              order by ps.started_at desc, ps.seq desc limit 1) as session_status
       from materials m left join subjects s on s.id = m.subject_id
      where m.id = $1 and m.learner_id = $2 and m.archived_at is null`,
    [materialId, learnerId],
  );
  if (!m) throw new AppError('not_found', 'Material not found');
  return toView(m);
}

function toView(
  m: MaterialRow & {
    subject_name: string | null;
    item_count: number;
    session_id: string | null;
    session_status: MaterialView['session_status'];
  },
): MaterialView {
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    failure_reason: m.failure_reason,
    photos_deleted: m.photos_deleted_at !== null,
    item_count: m.item_count,
    purpose: m.purpose,
    session_id: m.session_id,
    session_status: m.session_status,
    page_problems: m.pages_resolved_at ? [] : m.page_problems,
    photo_count: m.photo_count,
    merged_into: m.merged_into,
    subject_name: m.subject_name,
    goal_id: m.goal_id,
    created_at: m.created_at.toISOString(),
  };
}

export async function createMaterial(
  deps: Deps,
  learner: { id: string; account_id: string },
  input: CreateMaterialRequest,
): Promise<{
  material: MaterialView;
  uploads: Array<{ position: number; path: string; url: string; token: string }>;
}> {
  // Everything referenced must belong to this learner.
  const step = input.step_id
    ? await deps.db.maybeOne<{ id: string; goal_id: string | null }>(
        `select id, goal_id from buddy_steps where id = $1 and learner_id = $2 and kind = 'capture'`,
        [input.step_id, learner.id],
      )
    : null;
  if (input.step_id && !step) throw new AppError('not_found', 'Step not found');
  // A study sheet sent without a link (the composer camera, "Mein Stoff") while exactly one
  // photo is asked for (an open capture step) is that photo: it completes the step and joins
  // its goal, whichever way she took it (audit H-16). With two or more open, none is guessed.
  const asked =
    !step && !input.goal_id && !input.completes && input.purpose !== 'homework'
      ? await deps.db.query<{ id: string; goal_id: string | null }>(
          `select id, goal_id from buddy_steps
            where learner_id = $1 and kind = 'capture' and state = 'planned' limit 2`,
          [learner.id],
        )
      : [];
  const captureStep = step ?? (asked.length === 1 ? asked[0]! : null);
  // Pages photographed again for an earlier material keep its goal and purpose.
  // `id`: the notice answered (this material); `root`: the sheet the pages join.
  const completes = input.completes
    ? await deps.db.maybeOne<{
        id: string;
        root: string;
        goal_id: string | null;
        purpose: 'study' | 'homework';
      }>(
        `select m.id, coalesce(m.merged_into, m.id) as root, r.goal_id, r.purpose
           from materials m join materials r on r.id = coalesce(m.merged_into, m.id)
          where m.id = $1 and m.learner_id = $2 and m.archived_at is null and r.archived_at is null`,
        [input.completes, learner.id],
      )
    : null;
  if (input.completes && !completes) throw new AppError('not_found', 'Material not found');
  const goalId = input.goal_id ?? captureStep?.goal_id ?? completes?.goal_id ?? null;
  const purpose = completes?.purpose ?? input.purpose;
  const goal = goalId
    ? await deps.db.maybeOne<{ subject_id: string | null }>(
        `select subject_id from buddy_goals where id = $1 and learner_id = $2`,
        [goalId, learner.id],
      )
    : null;
  if (goalId && !goal) throw new AppError('not_found', 'Goal not found');
  const material = await deps.db.tx(async (tx) => {
    const existing = await tx.maybeOne<{ id: string; archived_at: Date | null }>(
      `select id, archived_at from materials where learner_id = $1 and client_request_id = $2
        for update`,
      [learner.id, input.client_request_id],
    );
    if (existing && !existing.archived_at) return existing.id;
    if (existing) {
      // The earlier send was given up (photos never all arrived within a day) or its sheet
      // was deleted: the photos still on her phone become a new sheet, never an endless
      // "Das gibt es nicht mehr" (audit H-13). The old row gives up the request id (a new
      // random one: the column is required and nothing else knows it).
      await tx.query(`update materials set client_request_id = gen_random_uuid() where id = $1`, [
        existing.id,
      ]);
    }
    // One row per client request id, also when two sends race: the loser of the insert
    // waits for the winner and answers with its material (create-material-idempotency-race).
    const row = await tx.maybeOne<{ id: string }>(
      `insert into materials (learner_id, client_request_id, goal_id, step_id, subject_id, photo_count,
                              created_at, purpose, completes_material_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (learner_id, client_request_id) do nothing
       returning id`,
      [
        learner.id,
        input.client_request_id,
        goalId,
        captureStep?.id ?? null,
        goal?.subject_id ?? null,
        input.photo_mimes.length,
        deps.now(),
        purpose,
        completes?.root ?? null,
      ],
    );
    if (!row) {
      const existing = await tx.one<{ id: string }>(
        `select id from materials where learner_id = $1 and client_request_id = $2`,
        [learner.id, input.client_request_id],
      );
      return existing.id;
    }
    if (completes) {
      // The notice about the missing pages has been answered.
      await tx.query(
        `update materials set pages_resolved_at = coalesce(pages_resolved_at, $2) where id = $1`,
        [completes.id, deps.now()],
      );
      await bumpContext(tx, learner.id);
    }
    for (const [position, mime] of input.photo_mimes.entries()) {
      const ext = mime === 'image/png' ? 'png' : mime === PDF_MIME ? 'pdf' : 'jpg';
      await tx.query(
        `insert into material_photos (material_id, position, storage_path, mime) values ($1, $2, $3, $4)`,
        [row.id, position, `${learner.account_id}/${row.id}/${position}.${ext}`, mime],
      );
    }
    return row.id;
  });
  // "Senden" (issue #56): from now on these pages are on their way, so the home may say so.
  if (input.sending)
    await deps.db.query(
      `update materials set send_requested_at = coalesce(send_requested_at, $2) where id = $1`,
      [material, deps.now()],
    );

  // Pages she took after the reservation (issue #56: every page goes up as soon as it is
  // ready, so sending only has to finish). The same request id, more mimes: the missing
  // positions are added as long as nothing has been submitted. Fewer or changed pages are
  // not an extension — the app gives that reservation up and starts a new one.
  await deps.db.tx(async (tx) => {
    const m = await tx.one<{ status: string; photo_count: number }>(
      `select status, photo_count from materials where id = $1 for update`,
      [material],
    );
    if (m.status !== 'awaiting_upload' || input.photo_mimes.length <= m.photo_count) return;
    for (const [position, mime] of input.photo_mimes.entries()) {
      if (position < m.photo_count) continue;
      const ext = mime === 'image/png' ? 'png' : mime === PDF_MIME ? 'pdf' : 'jpg';
      await tx.query(
        `insert into material_photos (material_id, position, storage_path, mime)
         values ($1, $2, $3, $4) on conflict (material_id, position) do nothing`,
        [material, position, `${learner.account_id}/${material}/${position}.${ext}`, mime],
      );
    }
    await tx.query(`update materials set photo_count = $2 where id = $1`, [
      material,
      input.photo_mimes.length,
    ]);
  });

  const view = await materialView(deps.db, learner.id, material);
  // A repeated request after the photos went through has nothing left to upload.
  const photos =
    view.status === 'awaiting_upload'
      ? await deps.db.query<{ position: number; storage_path: string }>(
          `select position, storage_path from material_photos where material_id = $1 order by position`,
          [material],
        )
      : [];
  const uploads = [];
  for (const p of photos) {
    const target = await deps.storage.createUploadTarget(p.storage_path);
    uploads.push({
      position: p.position,
      path: p.storage_path,
      url: target.url,
      token: target.token,
    });
  }
  return { material: view, uploads };
}

/** "Passt so": the missing pages are fine as they are; the notice ends. Idempotent. */
export async function acceptMissingPages(
  deps: Deps,
  learnerId: string,
  materialId: string,
): Promise<void> {
  await deps.db.tx(async (tx) => {
    const m = await tx.maybeOne<{ pages_resolved_at: Date | null }>(
      `select pages_resolved_at from materials
        where id = $1 and learner_id = $2 and archived_at is null for update`,
      [materialId, learnerId],
    );
    if (!m) throw new AppError('not_found', 'Material not found');
    if (m.pages_resolved_at) return;
    await tx.query(`update materials set pages_resolved_at = $2 where id = $1`, [
      materialId,
      deps.now(),
    ]);
    await bumpContext(tx, learnerId);
  });
}

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
    await enqueueJob(deps.db, {
      learnerId,
      kind: 'purge_photos',
      runAt: deps.now(),
      dedupeKey: `purge:${materialId}:submitted:${deps.now().toISOString()}`,
      payload: { material_id: materialId },
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
    // Storage could not say: never tell her the photos did not arrive (rule 5).
    if (err instanceof StorageError)
      throw new AppError('unavailable', 'Photo storage is not reachable', {
        reason: 'storage_unavailable',
      });
    throw err;
  }
  const missing = photos.filter((p) => !present.has(p.storage_path)).map((p) => p.position);
  if (missing.length > 0) {
    throw new AppError('invalid_input', 'Some photos did not arrive', {
      reason: 'photos_missing',
      missing,
    });
  }
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
      if (err instanceof StorageError)
        throw new AppError('unavailable', 'Photo storage is not reachable', {
          reason: 'storage_unavailable',
        });
      throw err;
    }
    if (!bytes) {
      throw new AppError('invalid_input', 'Some photos did not arrive', {
        reason: 'photos_missing',
        missing: [f.position],
      });
    }
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
    await enqueueJob(tx, {
      learnerId,
      kind: 'purge_photos',
      runAt: deps.now(),
      dedupeKey: `purge:${materialId}:refused`,
      payload: { material_id: materialId },
    });
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
    if (m.failure_reason === 'not_learning_material' || m.failure_reason === 'blocked') {
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
    const runs = await tx.one<{ n: number; counted: number }>(
      `select count(*)::int as n,
              count(*) filter (where coalesce((result ->> 'uncounted')::boolean, false) = false)::int
                as counted
         from jobs where kind = 'extract_material' and payload ->> 'material_id' = $1`,
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
 * The one way a material becomes failed — from the reading job and from the scheduler's
 * recovery alike: status, the photo purge after the retention period (at once when it is
 * not learning material) and Buddy's context, in the caller's transaction.
 */
export async function markMaterialFailed(
  tx: Db,
  materialId: string,
  reason: NonNullable<MaterialView['failure_reason']>,
  now: Date,
): Promise<void> {
  const m = await tx.maybeOne<{ learner_id: string; completes_material_id: string | null }>(
    `update materials set status = 'failed', failure_reason = $2, failed_at = $3 where id = $1
     returning learner_id, completes_material_id`,
    [materialId, reason, now],
  );
  if (!m) return;
  if (m.completes_material_id) {
    // A page photographed for a sheet stays recognisable as that sheet's page (p2-J-04).
    await tx.query(
      `update materials p set title = coalesce(p.title, r.title), subject_id = coalesce(p.subject_id, r.subject_id)
         from materials r where p.id = $1 and r.id = $2`,
      [materialId, m.completes_material_id],
    );
  }
  // Unusable photos are not kept longer than readable ones, and a photo of
  // something else (a letter, a recipe) not at all: it cannot be read again
  // anyway (docs/privacy.md).
  // The same holds for photos the safety filter refused to read.
  const keepMs =
    reason === 'not_learning_material' || reason === 'blocked'
      ? 0
      : PHOTO_RETENTION_DAYS * 86_400_000;
  await enqueueJob(tx, {
    learnerId: m.learner_id,
    kind: 'purge_photos',
    runAt: new Date(now.getTime() + keepMs),
    dedupeKey: `purge:${materialId}`,
    payload: { material_id: materialId },
  });
  await bumpContext(tx, m.learner_id);
}

async function fail(
  deps: Deps,
  job: JobRow,
  materialId: string,
  reason: NonNullable<MaterialView['failure_reason']>,
  opts: { uncounted?: boolean } = {},
): Promise<void> {
  // Fenced: a run whose lease was taken over must not fail a sheet another run owns now
  // (extraction-status-writes-unfenced). Job and material change in one transaction.
  await deps.db.tx(async (tx) => {
    const finished = await finishJob(tx, job, deps.now(), {
      status: 'done',
      result: { outcome: 'failed', reason, ...(opts.uncounted ? { uncounted: true } : {}) },
    });
    if (finished) await markMaterialFailed(tx, materialId, reason, deps.now());
  });
}

/** Locks this run's job row; false when its lease was lost to another run. */
async function holdsLease(tx: Db, job: JobRow): Promise<boolean> {
  const row = await tx.maybeOne(
    `select 1 from jobs where id = $1 and lease_token = $2 and status = 'running' for update`,
    [job.id, job.lease_token],
  );
  return row !== null;
}

/**
 * A reading run hit an outage (model provider or Storage): try again with backoff, and if
 * it keeps failing, fail as `model_error` without using up one of her runs.
 */
async function retryTransient(
  deps: Deps,
  job: JobRow,
  materialId: string,
  error: string,
): Promise<void> {
  const now = deps.now();
  if (job.attempts < job.max_attempts) {
    await deps.db.tx(async (tx) => {
      const requeued = await retryJob(tx, job, {
        runAt: new Date(now.getTime() + 60_000 * 2 ** Math.max(0, job.attempts - 1)),
        error,
        countAttempt: true,
        now,
      });
      if (requeued)
        await tx.query(`update materials set status = 'queued', read_stage = null where id = $1`, [
          materialId,
        ]);
    });
    return;
  }
  return fail(deps, job, materialId, 'model_error', { uncounted: true });
}

/** The extraction job. Idempotent: a re-run after a crash starts over for the same material. */
export async function runExtraction(deps: Deps, job: JobRow): Promise<void> {
  const materialId = String(job.payload.material_id ?? '');
  const m = await deps.db.maybeOne<MaterialRow>(`select * from materials where id = $1`, [
    materialId,
  ]);
  if (!m || m.status === 'ready' || m.status === 'awaiting_upload' || m.archived_at) {
    await finishJob(deps.db, job, deps.now(), {
      status: 'done',
      result: { outcome: 'nothing_to_do' },
    });
    return;
  }
  const started = await deps.db.query(
    `update materials set status = 'processing', read_stage = 'opening', read_stage_at = $4
      where id = $1
        and exists (select 1 from jobs where id = $2 and lease_token = $3 and status = 'running')
      returning id`,
    [materialId, job.id, job.lease_token, deps.now()],
  );
  if (started.length === 0) return; // the lease went to another run
  const learner = await deps.db.one<{
    id: string;
    locale: string;
    level: string;
    grade: number | null;
    birth_date: string;
  }>(`select id, locale, level, grade, birth_date from learners where id = $1`, [m.learner_id]);

  const photos = await deps.db.query<{
    position: number;
    storage_path: string;
    mime: 'image/jpeg' | 'image/png' | 'application/pdf';
    page_count: number | null;
  }>(
    `select position, storage_path, mime, page_count from material_photos
      where material_id = $1 order by position`,
    [materialId],
  );
  const ranges = pageRanges(photos);
  const pageTotal = ranges.at(-1)?.last ?? 0;
  const parts: LlmPart[] = [];
  for (const [i, p] of photos.entries()) {
    let bytes: Uint8Array | null;
    try {
      bytes = await deps.storage.download(p.storage_path);
    } catch (err) {
      // An outage is not a missing photo (storage-errors-reported-as-missing-photos).
      if (err instanceof StorageError) return retryTransient(deps, job, materialId, 'storage');
      throw err;
    }
    if (!bytes) return fail(deps, job, materialId, 'photos_missing');
    // Each photo is labelled, so a page number in the report names this photo, not the
    // model's count of unlabelled images (p2-model-page-numbers-unlabeled-images).
    // A PDF brings its pages in one file: the label says which page numbers they are.
    const range = ranges[i]!;
    parts.push({
      text:
        p.mime === PDF_MIME
          ? `PDF with pages ${range.first}–${range.last} of ${pageTotal} (one page report per PDF page):`
          : `Photo ${range.first} of ${pageTotal}:`,
    });
    parts.push({ inlineData: { mimeType: p.mime, data: Buffer.from(bytes).toString('base64') } });
  }
  const now = deps.now();
  const tz = await deps.db.one<{ timezone: string }>(
    `select coalesce((select timezone from buddy_settings where learner_id = $1), 'Europe/Berlin') as timezone`,
    [learner.id],
  );
  const level =
    learner.level === 'school'
      ? `school, grade ${learner.grade ?? 'unknown'}`
      : learner.level === 'unknown'
        ? 'unknown'
        : learner.level;

  // Without a model nothing can read the photos: say so at once, not after minutes of futile
  // retries (p2-uf-llm-disabled-capture-dead-end). Not her sheet's fault: the run is uncounted.
  if (!deps.llm.available) return fail(deps, job, materialId, 'model_error', { uncounted: true });
  // The photos are loaded: Buddy reads them now (the card on the home says so, rule 5).
  await deps.db.query(
    `update materials set read_stage = 'reading', read_stage_at = $4
      where id = $1 and status = 'processing'
        and exists (select 1 from jobs where id = $2 and lease_token = $3 and status = 'running')`,
    [materialId, job.id, job.lease_token, deps.now()],
  );
  const homework = m.purpose === 'homework';
  const read = (lean: boolean) =>
    callModel(deps, learner.id, localParts(now, tz.timezone).date, {
      purpose: 'extraction',
      tier: 'smart',
      promptVersion: EXTRACT_PROMPT_VERSION,
      system: `${homework ? HOMEWORK_SYSTEM : EXTRACT_SYSTEM}${lean ? `\n\n${LEAN_RULES}` : ''}`,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `LEARNER: ${ageOn(learner.birth_date, now)} years, level ${level}, app language ${learner.locale}`,
            },
            ...parts,
          ],
        },
      ],
      schema: homework ? HOMEWORK_SCHEMA : EXTRACTION_SCHEMA,
      // Homework is at most 12 tasks without worked solutions: a smaller limit, so a
      // reading that runs on is cut off after seconds, not after 40 (live finding 2).
      maxOutputTokens: homework ? 8_000 : 12_000,
      temperature: 0.3,
      timeoutMs: 120_000,
      // Read once in the background: time to think (see generate.ts).
      thinkingBudget: 2048,
    });
  let result;
  try {
    // A run after one that was cut off starts lean at once.
    let lean = job.last_error === 'truncated';
    let res;
    try {
      res = await read(lean);
    } catch (err) {
      // Cut off at the token limit: read again at once, told to be brief (live finding 2).
      if (!(err instanceof LlmError && err.truncated) || lean) throw err;
      lean = true;
      res = await read(lean);
    }
    result = ExtractionParse.safeParse(res.json);
  } catch (err) {
    if (isAppError(err) && err.code === 'budget_exhausted')
      return fail(deps, job, materialId, 'budget_exhausted', { uncounted: true });
    // An outage, or cut off twice: try again later; after the last run she gets an honest
    // failed card with "Nochmal lesen" (rule 5), never silence.
    if (err instanceof LlmError && err.retryable)
      return retryTransient(deps, job, materialId, err.truncated ? 'truncated' : err.kind);
    // The provider's safety filter refused this sheet: reading it again gives the same
    // answer, so it ends here with its own honest words and no retry (audit p2-T8).
    if (err instanceof LlmError && err.kind === 'blocked')
      return fail(deps, job, materialId, 'blocked');
    return fail(deps, job, materialId, 'model_error');
  }
  if (!result.success) return fail(deps, job, materialId, 'model_error');
  const x = result.data;
  if (!x.is_learning_material) return fail(deps, job, materialId, 'not_learning_material');
  const items = usableItems(x.items);
  const pageProblems = pageProblemsOf(x.pages, m.photo_count);
  // "Not readable" with questions and a page that was read: one bad page must not
  // cost the whole sheet (the model says so for a cut-off page at times); the
  // page report tells Lena what is missing.
  const somePageRead = x.pages.some((p) => p.page <= m.photo_count && p.read !== 'none');
  if (!x.readable && !somePageRead) return fail(deps, job, materialId, 'unreadable');
  // Questions were written but none passed validation: the reading went wrong, not the
  // photo — no lighting advice for a fine photo (empty-after-validation-says-unreadable).
  if (items.length === 0)
    return fail(deps, job, materialId, x.items.length > 0 ? 'model_error' : 'unreadable');

  // The sheet this run's questions went onto (the merge target, else this material);
  // null when another run finished first or the sheet was deleted meanwhile.
  let sheetForImages: string | null = null;
  await deps.db.tx(async (tx) => {
    // A run past its lease writes nothing: the run that took over owns the sheet now.
    if (!(await holdsLease(tx, job))) return;
    const outcome = await readyTx(tx);
    await finishJob(tx, job, deps.now(), {
      status: 'done',
      result: outcome === 'ready' ? { outcome, items: items.length } : { outcome: 'nothing_to_do' },
    });
  });
  // Concept images are a bonus on top of a sheet that is already ready (issue #50):
  // attachConceptImages never throws — a vision pass or Storage that fails leaves the
  // sheet ready without images, it never becomes a failure path of the reading.
  if (sheetForImages) {
    // Search passages for the sheet that carries the text (the merge target when pages
    // joined an earlier sheet): rewritten from scratch so they follow the grown text.
    // Like the images below, a bonus on a sheet that is already ready — indexMaterialPassages
    // never throws, and a sheet without its index is still found by full text (issue #23).
    await indexMaterialPassages(deps, {
      materialId: sheetForImages,
      learnerId: learner.id,
      timezone: tz.timezone,
    });
    await attachConceptImages(deps, {
      materialId,
      sheetId: sheetForImages,
      learnerId: learner.id,
      locale: learner.locale,
      timezone: tz.timezone,
    });
  }

  async function readyTx(tx: Db): Promise<'ready' | 'deleted'> {
    const current = await tx.one<MaterialRow>(`select * from materials where id = $1 for update`, [
      materialId,
    ]);
    if (current.status === 'ready') return 'ready'; // a concurrent run finished first
    // Deleted while it was being read: no questions, no "ready", no wake-up (repro-13).
    if (current.archived_at) return 'deleted';
    // Pages for an earlier sheet join it (migration 0011): its questions, subject and session.
    const target = current.completes_material_id
      ? await tx.maybeOne<MaterialRow>(
          `select * from materials where id = $1 and learner_id = $2 and status = 'ready'
              and archived_at is null and merged_into is null for update`,
          [current.completes_material_id, current.learner_id],
        )
      : null;
    const home = target ?? current;
    let subjectId = home.subject_id;
    if (!subjectId && x.subject) {
      subjectId = (
        await findOrCreateSubject(tx, current.learner_id, x.subject.name, x.subject.kind)
      ).id;
    }
    // A second subject on the sheet: its questions go there (found by their topics).
    const second =
      x.other_subject && x.other_subject.topics.length
        ? await findOrCreateSubject(
            tx,
            current.learner_id,
            x.other_subject.name,
            x.other_subject.kind,
          )
        : null;
    const secondTopics = new Set(
      (x.other_subject?.topics ?? []).map((t) => t.trim().toLowerCase()),
    );
    const homework = home.purpose === 'homework';
    const bySubject = new Map<string | null, typeof items>();
    for (const item of items) {
      const own =
        second &&
        second.id !== subjectId &&
        secondTopics.has((item.topic ?? '').trim().toLowerCase())
          ? second.id
          : subjectId;
      bySubject.set(own, [...(bySubject.get(own) ?? []), item]);
    }
    const itemIds: string[] = [];
    for (const [sid, group] of bySubject) {
      itemIds.push(
        ...(await insertItems(
          tx,
          {
            learnerId: current.learner_id,
            materialId: home.id,
            subjectId: sid,
            origin: homework ? 'homework' : 'material',
          },
          group,
        )),
      );
    }
    if (target) {
      await tx.query(
        `update materials set status = 'ready', failure_reason = null, title = $2, subject_id = $3,
                              ready_at = $4, page_problems = $5, merged_into = $6
          where id = $1`,
        [materialId, target.title, subjectId, now, JSON.stringify(pageProblems), target.id],
      );
      await tx.query(
        `update materials set extracted_text = concat_ws(E'\n\n', extracted_text, $2::text),
                              subject_id = coalesce(subject_id, $3)
          where id = $1`,
        [target.id, x.extracted_text, subjectId],
      );
    } else {
      await tx.query(
        `update materials set status = 'ready', failure_reason = null, title = coalesce(title, $2),
                              extracted_text = $3, subject_id = $4, ready_at = $5, page_problems = $6
          where id = $1`,
        [materialId, x.title, x.extracted_text, subjectId, now, JSON.stringify(pageProblems)],
      );
    }
    if (homework) {
      // Homework goes straight into a help session: hints only, never the solution. The
      // tasks of a later page join the sheet's session while it is still open.
      const open = target
        ? await tx.maybeOne<{ id: string; next: number }>(
            `select ps.id, coalesce(max(si.position) + 1, 0)::int as next
               from practice_sessions ps left join session_items si on si.session_id = ps.id
              where ps.material_id = $1 and ps.status = 'active'
              group by ps.id order by ps.started_at desc, ps.seq desc limit 1`,
            [target.id],
          )
        : null;
      if (open) {
        for (const [i, itemId] of itemIds.entries()) {
          await tx.query(
            `insert into session_items (session_id, item_id, position) values ($1, $2, $3)`,
            [open.id, itemId, open.next + i],
          );
        }
        await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
          open.id,
          now,
        ]);
      } else {
        await createSession(
          tx,
          current.learner_id,
          itemIds,
          {
            mode: 'help',
            stepId: null,
            goalId: home.goal_id,
            materialId: home.id,
            title: target?.title ?? x.title,
            clientRequestId: null,
          },
          now,
        );
      }
    }
    // The capture step Buddy asked for (or, without one, the goal's open
    // capture step) is now done — with evidence. A page added to an earlier sheet completes
    // only a step it was sent for: a later request is about other material (p2-J-01).
    if (!homework && (current.step_id || (current.goal_id && !current.completes_material_id))) {
      await tx.query(
        `update buddy_steps set state = 'done', done_source = 'evidence', finished_at = $4, version = version + 1,
                                evidence = $5
          where learner_id = $1 and kind = 'capture' and state = 'planned'
            and (id = $2 or ($2::uuid is null and goal_id = $3))`,
        [
          current.learner_id,
          current.step_id,
          current.goal_id,
          now,
          { material_id: materialId, questions: items.length },
        ],
      );
    }
    // One event per reading: pages added to a sheet wake Buddy about that sheet again
    // (merged-part-no-wake); the event is the part's, the check looks at the sheet.
    await emitEvent(
      tx,
      current.learner_id,
      homework
        ? { type: 'homework_ready', materialId: materialId, rootId: home.id }
        : { type: 'material_ready', materialId: materialId, rootId: home.id },
      now,
      { questions: items.length, ...(target ? { root_id: home.id } : {}) },
    );
    await enqueueJob(tx, {
      learnerId: current.learner_id,
      kind: 'purge_photos',
      runAt: new Date(now.getTime() + PHOTO_RETENTION_DAYS * 86_400_000),
      dedupeKey: `purge:${materialId}`,
      payload: { material_id: materialId },
    });
    // A photo of something else among the pages (a letter, a recipe) is not kept at all,
    // like a whole sheet that is not learning material (docs/privacy.md).
    const foreign = pageProblems.filter((p) => p.problem === 'not_material' && p.read === 'none');
    if (filesWhollyIn(photos, new Set(foreign.map((p) => p.page))).length > 0) {
      await enqueueJob(tx, {
        learnerId: current.learner_id,
        kind: 'purge_photos',
        runAt: now,
        dedupeKey: `purge:${materialId}:not_material`,
        payload: {
          material_id: materialId,
          // Only whole files: a PDF with one foreign page among the sheet's pages is kept
          // for its retention like the rest.
          positions: filesWhollyIn(photos, new Set(foreign.map((p) => p.page))),
        },
      });
    }
    await bumpContext(tx, current.learner_id);
    sheetForImages = home.id;
    return 'ready';
  }
}

/**
 * The pages that were not read completely, as the model reported them: only real
 * photo positions, each once. Lena is told about them (docs/architecture.md §Material).
 */
export function pageProblemsOf(pages: PageReport[], photoCount: number): PageProblem[] {
  const out = new Map<number, PageProblem>();
  for (const p of pages) {
    if (p.read === 'all' || p.page > photoCount || out.has(p.page)) continue;
    out.set(p.page, { page: p.page, read: p.read, problem: p.problem });
  }
  return [...out.values()].sort((a, b) => a.page - b.page);
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
      await enqueueJob(tx, {
        learnerId: m.learner_id,
        kind: 'purge_photos',
        runAt: now,
        dedupeKey: `purge:${m.id}:abandoned`,
        payload: { material_id: m.id },
      });
    }
    // Only the sheets that stay change what Buddy sees (rule 4).
    for (const learnerId of new Set(sent.map((m) => m.learner_id)))
      await bumpContext(tx, learnerId);
    return sent.length + neverSent.length;
  });
}

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
      await enqueueJob(tx, {
        learnerId,
        kind: 'purge_photos',
        runAt: now,
        dedupeKey: `purge:${id}:archived`,
        payload: { material_id: id },
      });
      await enqueueJob(tx, {
        learnerId,
        kind: 'purge_photos',
        runAt: new Date(now.getTime() + UPLOAD_URL_TTL_MS),
        dedupeKey: `purge:${id}:late`,
        payload: { material_id: id },
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

export async function libraryView(db: Db, learnerId: string): Promise<LibraryView> {
  const materials = await db.query<
    MaterialRow & {
      subject_name: string | null;
      item_count: number;
      session_id: string | null;
      session_status: MaterialView['session_status'];
    }
  >(
    `select m.*, s.name as subject_name,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as item_count,
            (select ps.id from practice_sessions ps where ps.material_id = m.id
              order by ps.started_at desc, ps.seq desc limit 1) as session_id,
            (select ps.status from practice_sessions ps where ps.material_id = m.id
              order by ps.started_at desc, ps.seq desc limit 1) as session_status
       from materials m left join subjects s on s.id = m.subject_id
      where m.learner_id = $1 and m.archived_at is null and m.merged_into is null
        -- Pages she is still attaching are not in her library yet (issue #56).
        and (m.status <> 'awaiting_upload' or m.send_requested_at is not null)
      order by m.created_at desc, m.seq desc
      limit 200`,
    [learnerId],
  );
  const subjects = await db.query<{
    id: string;
    name: string;
    kind: LibraryView['subjects'][number]['kind'];
  }>(
    `select id, name, kind from subjects where learner_id = $1 and archived_at is null order by name`,
    [learnerId],
  );
  return {
    subjects: subjects.map((s) => ({
      ...s,
      materials: materials.filter((m) => m.subject_id === s.id).map(toView),
    })),
    unsorted: materials.filter((m) => !m.subject_id).map(toView),
  };
}

// ─────────────── the questions of one material ───────────────

type MaterialItemRow = {
  id: string;
  kind: MaterialItemsView['items'][number]['kind'];
  prompt: string;
  choices: string[] | null;
  unit: string | null;
  topic: string | null;
  origin: MaterialItemsView['items'][number]['origin'];
  lang: string | null;
  prompt_lang: string | null;
  figure: Figure | null;
  last_status: 'correct' | 'revealed' | 'skipped' | 'missed' | null;
  last_first_try: boolean | null;
};

function resultOf(r: MaterialItemRow): ItemResult {
  if (r.last_status === null) return 'never_asked';
  if (r.last_status === 'correct') return r.last_first_try ? 'first_try' : 'with_help';
  return 'not_known';
}

/**
 * The learner's questions from one material, with how the latest attempt went.
 * Never the solution (answer, accepted answers, correct choice stay on the server).
 */
export async function materialItems(
  db: Db,
  learnerId: string,
  materialId: string,
): Promise<MaterialItemsView> {
  const material = await materialView(db, learnerId, materialId);
  const rows = await db.query<MaterialItemRow>(
    `select i.id, i.kind, i.prompt, i.choices, i.unit, i.topic, i.origin, i.lang, i.prompt_lang, i.figure,
            last.status as last_status, last.first_try_correct as last_first_try
       from items i
       left join lateral (
         select si.status, si.first_try_correct from session_items si
          where si.item_id = i.id and si.status <> 'open' and si.flagged_at is null
          order by si.closed_at desc nulls last limit 1) last on true
      where i.material_id = $1 and i.learner_id = $2 and i.archived_at is null
      order by i.seq`,
    [materialId, learnerId],
  );
  return {
    material,
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      prompt: r.prompt,
      choices: r.choices,
      unit: r.unit,
      topic: r.topic,
      origin: r.origin,
      lang: r.lang,
      prompt_lang: r.prompt_lang,
      figure: r.figure,
      // The concept image is shown where the question is shown full size (sessions);
      // the material list stays a list (issue #50).
      image: null,
      result: resultOf(r),
    })),
  };
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

/** The learner renames a material (1–120 characters, trimmed by the contract). */
export async function renameMaterial(
  deps: Deps,
  learnerId: string,
  materialId: string,
  title: string,
): Promise<MaterialView> {
  await deps.db.tx(async (tx) => {
    const m = await tx.maybeOne<{ title: string | null }>(
      `select title from materials where id = $1 and learner_id = $2 and archived_at is null for update`,
      [materialId, learnerId],
    );
    if (!m) throw new AppError('not_found', 'Material not found');
    if (m.title === title) return;
    await tx.query(`update materials set title = $2 where id = $1`, [materialId, title]);
    // Buddy refers to material by its title.
    await bumpContext(tx, learnerId);
  });
  return materialView(deps.db, learnerId, materialId);
}
