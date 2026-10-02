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
  ClarifyUnclearRequest,
  CreateMaterialRequest,
  CurriculumRegion,
  Figure,
  ItemResult,
  LibraryView,
  MaterialItemsView,
  MaterialView,
  NotPracticable,
  PageProblem,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError, isAppError } from '../../lib/errors.js';
import { localParts } from '../../lib/time.js';
import { callModel } from '../../llm/call.js';
import { LlmError, type LlmPart, type LlmResult } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { ageOn } from '../identity/model.js';
import { curriculumBlock } from '../curriculum/state.js';
import { bumpContext, findOrCreateSubject } from '../buddy/plan.js';
import { enqueueJob, finishJob, retryJob, type JobRow } from '../scheduler/jobs.js';
import { StorageError } from '../../storage/gateway.js';
import { insertItems, samePrompt, usableItems } from '../practice/items.js';
import { structuredItems } from '../practice/structured.js';
import { createSession } from '../practice/service.js';
import {
  clarifiedRules,
  EXTRACT_PROMPT_VERSION,
  EXTRACT_SYSTEM,
  ExtractionParse,
  MOST_READINGS,
  MOST_UNCLEAR_SPOTS,
  moreRules,
  ExtractionResult,
  type PageReport,
  type UnclearReport,
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

/** The structured kinds a sheet may give (#228 an order, #230 a table, #229 links to make). */
const SHEET_STRUCTURED: ReadonlySet<string> = new Set(['order', 'table_fill', 'match']);

const EXTRACTION_SCHEMA = toJsonSchema(ExtractionResult);
const HOMEWORK_SCHEMA = toJsonSchema(HomeworkExtraction);
const ABANDON_UPLOAD_MS = 24 * 3_600_000;
const MAX_EXTRACTION_ATTEMPTS = 3;
/**
 * How long an unsettled spot is asked about (issue #164 point 1): the same day-long window the
 * page notice uses, because it rests on the same fact — the sheet is still at hand. After it the
 * ask is gone and the sheet is exactly what it was: a question that was never written, and a page
 * report she can still act on. Nothing nags and nothing is counted (CLAUDE.md rule 6).
 */
const UNCLEAR_TTL_MS = 24 * 3_600_000;
/** A clarified reading is one more look at the same photos: two tries, then it stays unwritten. */
const MAX_CLARIFY_ATTEMPTS = 2;

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
  /** The sheet holds more questions than were read into items (issue #150). */
  items_incomplete: boolean;
  /** Tasks that got no questions because Buddy has no exercise for their form (issue #198). */
  not_practicable: NotPracticable[];
  pages_resolved_at: Date | null;
  completes_material_id: string | null;
  merged_into: string | null;
  archived_at: Date | null;
  photos_deleted_at: Date | null;
  created_at: Date;
};

/**
 * The sentences on this sheet to read aloud (issue #223 point 2). Exactly what a speaking run
 * started from the sheet would hold — the same two conditions `practice/selection.ts` applies
 * for `run = 'speak'` — so the offer the card makes and what the run then holds can never
 * disagree (the same reason `offersCardPass` lives in one place).
 */
const SPEAK_COUNT = `(select count(*) from items i
   where i.material_id = m.id and i.archived_at is null
     and i.kind = 'speak' and i.origin <> 'homework')::int`;

export async function materialView(
  db: Db,
  learnerId: string,
  materialId: string,
): Promise<MaterialView> {
  const m = await db.maybeOne<
    MaterialRow & {
      subject_name: string | null;
      item_count: number;
      speak_count: number;
      session_id: string | null;
      session_status: MaterialView['session_status'];
    }
  >(
    `select m.*, s.name as subject_name,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as item_count,
            ${SPEAK_COUNT} as speak_count,
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
    speak_count: number;
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
    speak_count: m.speak_count,
    purpose: m.purpose,
    session_id: m.session_id,
    session_status: m.session_status,
    page_problems: m.pages_resolved_at ? [] : m.page_problems,
    items_incomplete: m.items_incomplete,
    not_practicable: m.not_practicable,
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
    if (
      m.failure_reason === 'not_learning_material' ||
      m.failure_reason === 'blocked' ||
      // The sheet was read perfectly well: every task on it is an exercise form Buddy has
      // no exercise for (issue #198). A second reading finds the same tasks — nothing about
      // the photo or the reading is what went wrong, so there is nothing to try again.
      m.failure_reason === 'form_not_practicable'
    ) {
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
  // `form_not_practicable` is deliberately NOT one of them (issue #198): that sheet is
  // valid school material, read without trouble — she may well want to look at it, so its
  // photos keep the normal retention like any other sheet's.
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
  opts: { uncounted?: boolean; notPracticable?: NotPracticable[] } = {},
): Promise<void> {
  // Fenced: a run whose lease was taken over must not fail a sheet another run owns now
  // (extraction-status-writes-unfenced). Job and material change in one transaction.
  await deps.db.tx(async (tx) => {
    const finished = await finishJob(tx, job, deps.now(), {
      status: 'done',
      result: { outcome: 'failed', reason, ...(opts.uncounted ? { uncounted: true } : {}) },
    });
    if (!finished) return;
    await markMaterialFailed(tx, materialId, reason, deps.now());
    // The tasks the reading refused are kept on the failed sheet too (issue #198): the card
    // and Buddy name them, and a task nobody names is exactly what looks done.
    if (opts.notPracticable && opts.notPracticable.length > 0) {
      await tx.query(`update materials set not_practicable = $2::jsonb where id = $1`, [
        materialId,
        JSON.stringify(opts.notPracticable),
      ]);
    }
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

type PhotoRow = {
  position: number;
  storage_path: string;
  mime: 'image/jpeg' | 'image/png' | 'application/pdf';
  page_count: number | null;
};

async function photosOf(db: Db, materialId: string): Promise<PhotoRow[]> {
  return db.query<PhotoRow>(
    `select position, storage_path, mime, page_count from material_photos
      where material_id = $1 order by position`,
    [materialId],
  );
}

/**
 * The photos of one material as a reading request sees them. Each is labelled, so a page number
 * in the answer names this photo and not the model's count of unlabelled images
 * (p2-model-page-numbers-unlabeled-images); a PDF brings its pages in one file, and its label
 * says which page numbers they are.
 *
 * `missing` is the position of the first photo Storage does not have — nothing can be read then.
 * A Storage OUTAGE is not a missing photo and is thrown as such (`StorageError`), so a caller
 * never reports "photos missing" for a provider that was simply unreachable.
 */
async function photoPartsOf(
  deps: Deps,
  photos: PhotoRow[],
): Promise<{ parts: LlmPart[]; missing: number | null }> {
  const ranges = pageRanges(photos);
  const pageTotal = ranges.at(-1)?.last ?? 0;
  const parts: LlmPart[] = [];
  for (const [i, p] of photos.entries()) {
    const bytes = await deps.storage.download(p.storage_path);
    if (!bytes) return { parts, missing: p.position };
    const range = ranges[i]!;
    parts.push({
      text:
        p.mime === PDF_MIME
          ? `PDF with pages ${range.first}–${range.last} of ${pageTotal} (one page report per PDF page):`
          : `Photo ${range.first} of ${pageTotal}:`,
    });
    parts.push({ inlineData: { mimeType: p.mime, data: Buffer.from(bytes).toString('base64') } });
  }
  return { parts, missing: null };
}

type ReadingLearner = {
  id: string;
  locale: string;
  level: string;
  grade: number | null;
  birth_date: string;
  /**
   * The Bundesland of her school (issue #199): at twelve verified places it decides what a
   * complete answer is, so the key written from her sheet depends on it (issue #214).
   */
  curriculum_region: CurriculumRegion | null;
};

/** One reading of the photos already loaded. `extra` is what THIS reading is told on top. */
type Reader = (lean: boolean, extra: string) => Promise<LlmResult>;

/**
 * Everything a reading of a sheet needs besides its photos: the learner it is pitched at, her
 * zone, and the model call itself. One place, because every reading of a sheet is the same call
 * with one more paragraph: nothing for the first, `moreRules` for a continued one (issue #150),
 * `clarifiedRules` for one the learner has settled a spot for (issue #164).
 */
async function sheetReader(
  deps: Deps,
  learnerId: string,
  opts: { homework: boolean; parts: LlmPart[]; now: Date },
): Promise<{ learner: ReadingLearner; timezone: string; read: Reader }> {
  const learner = await deps.db.one<ReadingLearner>(
    `select id, locale, level, grade, birth_date, curriculum_region from learners where id = $1`,
    [learnerId],
  );
  const tz = await deps.db.one<{ timezone: string }>(
    `select coalesce((select timezone from buddy_settings where learner_id = $1), 'Europe/Berlin') as timezone`,
    [learnerId],
  );
  const level =
    learner.level === 'school'
      ? `school, grade ${learner.grade ?? 'unknown'}`
      : learner.level === 'unknown'
        ? 'unknown'
        : learner.level;
  const read: Reader = (lean, extra) =>
    callModel(deps, learner.id, localParts(opts.now, tz.timezone).date, {
      purpose: 'extraction',
      tier: 'smart',
      promptVersion: EXTRACT_PROMPT_VERSION,
      system: `${opts.homework ? HOMEWORK_SYSTEM : EXTRACT_SYSTEM}${
        lean ? `\n\n${LEAN_RULES}` : ''
      }${extra ? `\n\n${extra}` : ''}`,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                `LEARNER: ${ageOn(learner.birth_date, opts.now)} years, level ${level}, app language ${learner.locale}`,
                // Which curriculum decides what a complete answer is (issue #214). The sheet
                // itself is never questioned here — only the key written from it.
                curriculumBlock({ region: learner.curriculum_region, grade: learner.grade }),
              ]
                .filter(Boolean)
                .join('\n'),
            },
            ...opts.parts,
          ],
        },
      ],
      schema: opts.homework ? HOMEWORK_SCHEMA : EXTRACTION_SCHEMA,
      // Homework is at most 12 tasks without worked solutions: a smaller limit, so a
      // reading that runs on is cut off after seconds, not after 40 (live finding 2).
      maxOutputTokens: opts.homework ? 8_000 : 12_000,
      temperature: 0.3,
      timeoutMs: 120_000,
      // Read once in the background: time to think (see generate.ts).
      thinkingBudget: 2048,
    });
  return { learner, timezone: tz.timezone, read };
}

/** The extraction job. Idempotent: a re-run after a crash starts over for the same material. */
export async function runExtraction(deps: Deps, job: JobRow): Promise<void> {
  // A reading the learner's own answer asked for (issue #164 point 1): the same job kind and the
  // same photos, told one fact the photo could not give. It never touches the sheet's status —
  // the sheet has been `ready` and usable since its first reading.
  const spotId = job.payload.unclear_spot_id;
  if (typeof spotId === 'string') return runClarifiedReading(deps, job, spotId);
  return runFirstReading(deps, job);
}

async function runFirstReading(deps: Deps, job: JobRow): Promise<void> {
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

  const photos = await photosOf(deps.db, materialId);
  let loaded;
  try {
    loaded = await photoPartsOf(deps, photos);
  } catch (err) {
    // An outage is not a missing photo (storage-errors-reported-as-missing-photos).
    if (err instanceof StorageError) return retryTransient(deps, job, materialId, 'storage');
    throw err;
  }
  if (loaded.missing !== null) return fail(deps, job, materialId, 'photos_missing');
  const now = deps.now();
  const homework = m.purpose === 'homework';
  const {
    learner,
    timezone,
    read: readOnce,
  } = await sheetReader(deps, m.learner_id, {
    homework,
    parts: loaded.parts,
    now,
  });

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
  const read = (lean: boolean, alreadyRead: readonly string[] = []) =>
    readOnce(lean, alreadyRead.length > 0 ? moreRules(alreadyRead) : '');
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
    // The sheet has more than one answer could hold: read it again for the rest (#150).
    // A word list with fifty pairs is fifty questions — "das kunstlich deckeln ist der
    // falsche weg" (owner, 30.09.). Homework is a short list by design and is never
    // continued; a reading that had to go lean is already at the model's limit.
    if (!homework && result.success) {
      for (let pass = 1; pass < MOST_READINGS && result.data.more_items; pass++) {
        const seen = [...result.data.items, ...result.data.structured].map((it) => it.prompt);
        let next;
        try {
          next = await read(lean, seen);
        } catch (err) {
          // The rest could not be read. What was read stands, and the sheet says it is
          // incomplete rather than pretending to be whole (rule 5).
          if (err instanceof LlmError && (err.retryable || err.truncated)) break;
          throw err;
        }
        const parsed = ExtractionParse.safeParse(next.json);
        if (!parsed.success) break;
        const known = new Set(seen.map(samePrompt));
        const fresh = parsed.data.items.filter((it) => !known.has(samePrompt(it.prompt)));
        const freshStructured = parsed.data.structured.filter(
          (it) => !known.has(samePrompt(it.prompt)),
        );
        // No progress: stop rather than ask a fourth time for the same nothing.
        if (fresh.length === 0 && freshStructured.length === 0) {
          result = { success: true, data: { ...result.data, more_items: false } } as typeof result;
          break;
        }
        // A continued reading sees the same photos, so it names the same refused tasks and the
        // same unsettled spots: only ones it has not named yet are added (issues #198, #164).
        const named = new Set(result.data.not_practicable.map((n) => samePrompt(n.task)));
        const unsettled = new Set(result.data.unclear.map((u) => samePrompt(u.task)));
        result = {
          success: true,
          data: {
            ...result.data,
            items: [...result.data.items, ...fresh],
            structured: [...result.data.structured, ...freshStructured],
            more_items: parsed.data.more_items,
            not_practicable: [
              ...result.data.not_practicable,
              ...parsed.data.not_practicable.filter((n) => !named.has(samePrompt(n.task))),
            ].slice(0, 20),
            unclear: [
              ...result.data.unclear,
              ...parsed.data.unclear.filter((u) => !unsettled.has(samePrompt(u.task))),
            ].slice(0, MOST_UNCLEAR_SPOTS),
          },
        } as typeof result;
      }
    }
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
  // The ordinary questions, and after them the structured ones that pass Regel 0 (#228–#230):
  // an order, a table or links to make, each checked by code before it is stored.
  const items = [
    ...usableItems(x.items),
    ...structuredItems(x.structured, SHEET_STRUCTURED, x.structured.length),
  ];
  const pageProblems = pageProblemsOf(x.pages, m.photo_count);
  // "Not readable" with questions and a page that was read: one bad page must not
  // cost the whole sheet (the model says so for a cut-off page at times); the
  // page report tells Lena what is missing.
  const somePageRead = x.pages.some((p) => p.page <= m.photo_count && p.read !== 'none');
  if (!x.readable && !somePageRead) return fail(deps, job, materialId, 'unreadable');
  // Read without trouble, and nothing on it is an exercise form Buddy can practise
  // (issue #198): its own reason, before the two that blame the reading or the photo. A
  // reading that NAMED the tasks it refused has said why there is nothing to practise, and
  // that is worth more to her than "something went wrong" — it also means no "Nochmal
  // lesen", because a second reading finds the same tasks (retryMaterial refuses it).
  if (items.length === 0 && x.not_practicable.length > 0)
    return fail(deps, job, materialId, 'form_not_practicable', {
      notPracticable: x.not_practicable,
    });
  // Questions were written but none passed validation: the reading went wrong, not the
  // photo — no lighting advice for a fine photo (empty-after-validation-says-unreadable).
  if (items.length === 0)
    return fail(
      deps,
      job,
      materialId,
      x.items.length + x.structured.length > 0 ? 'model_error' : 'unreadable',
    );

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
      timezone,
    });
    await attachConceptImages(deps, {
      materialId,
      sheetId: sheetForImages,
      learnerId: learner.id,
      locale: learner.locale,
      timezone,
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
    // Tasks this reading wrote no questions for, because their form is not one Buddy can
    // practise (issue #198). They travel with the sheet the learner sees: pages added to an
    // earlier sheet put theirs onto that sheet, after the ones already there.
    const notPracticable = JSON.stringify(x.not_practicable);
    if (target) {
      await tx.query(
        `update materials set status = 'ready', failure_reason = null, title = $2, subject_id = $3,
                              ready_at = $4, page_problems = $5, merged_into = $6,
                              items_incomplete = $7, not_practicable = $8
          where id = $1`,
        [
          materialId,
          target.title,
          subjectId,
          now,
          JSON.stringify(pageProblems),
          target.id,
          x.more_items,
          notPracticable,
        ],
      );
      await tx.query(
        `update materials set extracted_text = concat_ws(E'\n\n', extracted_text, $2::text),
                              subject_id = coalesce(subject_id, $3),
                              items_incomplete = items_incomplete or $4,
                              not_practicable = $5
          where id = $1`,
        [
          target.id,
          x.extracted_text,
          subjectId,
          x.more_items,
          // The contract shows at most twenty; the sheet keeps the first twenty of them
          // rather than silently dropping the ones it already named.
          JSON.stringify([...target.not_practicable, ...x.not_practicable].slice(0, 20)),
        ],
      );
    } else {
      await tx.query(
        `update materials set status = 'ready', failure_reason = null, title = coalesce(title, $2),
                              extracted_text = $3, subject_id = $4, ready_at = $5, page_problems = $6,
                              items_incomplete = $7, not_practicable = $8
          where id = $1`,
        [
          materialId,
          x.title,
          x.extracted_text,
          subjectId,
          now,
          JSON.stringify(pageProblems),
          // Still more on the sheet after every reading it was given (#150): said out loud
          // instead of letting a half-read sheet pass for a whole one.
          x.more_items,
          notPracticable,
        ],
      );
    }
    if (homework) {
      await intoHelpSession(tx, {
        learnerId: current.learner_id,
        sheetId: home.id,
        goalId: home.goal_id,
        title: target?.title ?? x.title,
        itemIds,
        now,
        // A first reading has no session to join; only a page added to a sheet does.
        joinOpen: target !== null,
      });
    }
    // Spots this reading could not settle, so the smallest clarification can be asked instead
    // of "photograph the page again" (issue #164 point 1). Like the tasks above they travel
    // with the sheet the learner sees; the questions for them do not exist until she answers.
    await insertUnclearSpots(tx, {
      learnerId: current.learner_id,
      materialId,
      sheetId: home.id,
      spots: x.unclear,
      photoCount: current.photo_count,
      now,
    });
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
 * New questions of a homework sheet belong in the help session she is working in (hints only,
 * never the solution). `joinOpen`: pages added to a sheet, and a task she settled afterwards
 * (issue #164), join the session that is still open — a question nobody can reach would be no
 * answer at all. A first reading has nothing to join and starts the session.
 */
async function intoHelpSession(
  tx: Db,
  o: {
    learnerId: string;
    sheetId: string;
    goalId: string | null;
    title: string | null;
    itemIds: string[];
    now: Date;
    joinOpen: boolean;
  },
): Promise<void> {
  if (o.itemIds.length === 0) return;
  const open = o.joinOpen
    ? await tx.maybeOne<{ id: string; next: number }>(
        `select ps.id, coalesce(max(si.position) + 1, 0)::int as next
           from practice_sessions ps left join session_items si on si.session_id = ps.id
          where ps.material_id = $1 and ps.status = 'active'
          group by ps.id order by ps.started_at desc, ps.seq desc limit 1`,
        [o.sheetId],
      )
    : null;
  if (open) {
    for (const [i, itemId] of o.itemIds.entries()) {
      await tx.query(
        `insert into session_items (session_id, item_id, position) values ($1, $2, $3)`,
        [open.id, itemId, open.next + i],
      );
    }
    await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
      open.id,
      o.now,
    ]);
    return;
  }
  await createSession(
    tx,
    o.learnerId,
    o.itemIds,
    {
      mode: 'help',
      stepId: null,
      goalId: o.goalId,
      materialId: o.sheetId,
      title: o.title,
      clientRequestId: null,
    },
    o.now,
  );
}

// ─────────────── the smallest clarification a sheet needs (issue #164 point 1) ───────────────

type UnclearSpotRow = {
  id: string;
  learner_id: string;
  material_id: string;
  sheet_id: string;
  ref: string;
  page: number;
  task: string;
  about: string;
  readings: string[];
  status: 'open' | 'answered' | 'read' | 'dismissed' | 'expired';
  answer: string | null;
  items_added: number;
  asked_at: Date;
  expires_at: Date;
};

/**
 * The spots a reading could not settle, kept so the learner can be asked the SMALLEST question
 * (migration 0070). Before this, one unreadable digit made the whole page "partly read" and the
 * task's question was never written; she was told to photograph the page again without ever
 * learning where it stuck.
 *
 * Three things are enforced here, not in the prompt (CLAUDE.md rule 1): the alias she answers
 * with is issued by the server, a page the model invented is dropped (it would point her at
 * another page of her own sheet), and the same spot is never asked about twice — a continued
 * reading sees the same photos and names it again, exactly as it does with `not_practicable`.
 */
async function insertUnclearSpots(
  tx: Db,
  o: {
    learnerId: string;
    materialId: string;
    sheetId: string;
    spots: readonly UnclearReport[];
    photoCount: number;
    now: Date;
  },
): Promise<void> {
  if (o.spots.length === 0) return;
  const known = await tx.query<{ ref: string; task: string }>(
    `select ref, task from material_unclear_spots where sheet_id = $1`,
    [o.sheetId],
  );
  const asked = new Set(known.map((k) => samePrompt(k.task)));
  const expires = new Date(o.now.getTime() + UNCLEAR_TTL_MS);
  let next = known.length + 1;
  for (const s of o.spots) {
    // A sheet asks about at most as many spots as one reading may name: more unsettled than
    // that is a page that was not read, and the page report is the honest step for it.
    if (next > MOST_UNCLEAR_SPOTS) break;
    if (s.page > o.photoCount || asked.has(samePrompt(s.task))) continue;
    await tx.query(
      `insert into material_unclear_spots
         (learner_id, material_id, sheet_id, ref, page, task, about, readings, asked_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
       on conflict (sheet_id, ref) do nothing`,
      [
        o.learnerId,
        o.materialId,
        o.sheetId,
        `u${next}`,
        s.page,
        s.task,
        s.about,
        JSON.stringify(s.readings),
        o.now,
        expires,
      ],
    );
    asked.add(samePrompt(s.task));
    next++;
  }
}

/**
 * Her answer to one spot: the reading she confirmed, or "weiß ich nicht" (`reading: null`).
 *
 * Nothing the model wrote decides anything here. Both aliases were issued by the server and are
 * resolved by it (rule 2); the confirmed reading is copied out of the row, so the question that
 * follows can only ever be built on a reading the app itself offered her. An ask that is no
 * longer open — answered before, let go, or past its day — says so instead of being answered
 * twice, and an ignored one has cost the sheet nothing.
 */
export async function clarifyUnclearSpot(
  deps: Deps,
  learnerId: string,
  materialId: string,
  input: ClarifyUnclearRequest,
): Promise<{ view: MaterialView; jobId: string | null }> {
  const now = deps.now();
  // Another learner's sheet (and a deleted one) is not found here, before anything else.
  await materialView(deps.db, learnerId, materialId);
  const jobId = await deps.db.tx(async (tx) => {
    const spot = await tx.maybeOne<UnclearSpotRow>(
      `select s.* from material_unclear_spots s
         join materials m on m.id = s.sheet_id and m.learner_id = s.learner_id
        where s.sheet_id = $1 and s.learner_id = $2 and s.ref = $3 and m.archived_at is null
        for update of s`,
      [materialId, learnerId, input.spot],
    );
    if (!spot) throw new AppError('not_found', 'Unclear spot not found');
    if (spot.status === 'open' && spot.expires_at <= now) {
      await tx.query(`update material_unclear_spots set status = 'expired' where id = $1`, [
        spot.id,
      ]);
      throw new AppError('conflict', 'This question is no longer open', {
        reason: 'no_longer_open',
      });
    }
    if (spot.status !== 'open')
      throw new AppError('conflict', 'This question is no longer open', {
        reason: 'no_longer_open',
      });
    if (input.reading === null) {
      // "Weiß ich nicht": the ask closes and no question is written for that task. The page
      // report is still there for her, and nothing comes back asking again.
      await tx.query(
        `update material_unclear_spots set status = 'dismissed', answered_at = $2 where id = $1`,
        [spot.id, now],
      );
      await bumpContext(tx, learnerId);
      return null;
    }
    const at = Number(input.reading.slice(1)) - 1;
    const answer = spot.readings[at];
    if (answer === undefined)
      throw new AppError('invalid_input', 'That is not one of the readings', {
        reason: 'unknown_reading',
      });
    await tx.query(
      `update material_unclear_spots set status = 'answered', answer = $2, answered_at = $3
        where id = $1`,
      [spot.id, answer, now],
    );
    // The reading of the rest of this sheet is long done, so this is one more look at the same
    // photos — the continued-reading machinery of issue #150 with one fact added, not a second
    // mechanism. Its own dedupe key, so answering twice can never read twice.
    const jobId = await enqueueJob(tx, {
      learnerId,
      kind: 'extract_material',
      runAt: now,
      dedupeKey: `clarify:${spot.id}`,
      payload: { material_id: spot.material_id, unclear_spot_id: spot.id },
      maxAttempts: MAX_CLARIFY_ATTEMPTS,
    });
    await bumpContext(tx, learnerId);
    return jobId;
  });
  return { view: await materialView(deps.db, learnerId, materialId), jobId };
}

/**
 * One more reading of the same photos, now that SHE has settled the spot (issue #164 point 1).
 *
 * The sheet never leaves `ready` for this: everything else on it has been practicable since its
 * first reading, and a clarification may not take that away. What comes back is merged exactly
 * as a continued reading's questions are — dropped when a question with that prompt already
 * exists (`samePrompt`), so a reading that retypes the whole sheet adds only the one task.
 *
 * `items_added` is the honest end of it: 0 means the question still could not be written, and
 * Buddy says so rather than letting her answer disappear (rule 5).
 */
async function runClarifiedReading(deps: Deps, job: JobRow, spotId: string): Promise<void> {
  const spot = await deps.db.maybeOne<
    UnclearSpotRow & {
      purpose: 'study' | 'homework';
      sheet_status: MaterialRow['status'];
      sheet_archived: Date | null;
      sheet_title: string | null;
      sheet_subject_id: string | null;
      sheet_goal_id: string | null;
      photos_deleted_at: Date | null;
    }
  >(
    `select s.*, m.purpose, m.status as sheet_status, m.archived_at as sheet_archived,
            m.title as sheet_title, m.subject_id as sheet_subject_id, m.goal_id as sheet_goal_id,
            p.photos_deleted_at
       from material_unclear_spots s
       join materials m on m.id = s.sheet_id
       join materials p on p.id = s.material_id
      where s.id = $1`,
    [spotId],
  );
  const stop = async (outcome: string) => {
    await finishJob(deps.db, job, deps.now(), { status: 'done', result: { outcome } });
  };
  // Answered and nothing else: a spot let go, read before, or a sheet that is gone has nothing
  // to read for.
  if (!spot || spot.status !== 'answered' || spot.answer === null) return stop('nothing_to_do');
  if (spot.sheet_archived || spot.sheet_status !== 'ready') return stop('nothing_to_do');
  if (spot.photos_deleted_at) {
    // The photos are gone (retention or deletion): her answer cannot be turned into a question
    // any more. Said, not swallowed — `items_added` stays 0.
    await deps.db.tx(async (tx) => {
      if (!(await holdsLease(tx, job))) return;
      await closeSpot(tx, spot.id, spot.learner_id, 0, deps.now());
      await finishJob(tx, job, deps.now(), {
        status: 'done',
        result: { outcome: 'photos_deleted' },
      });
    });
    return;
  }

  const photos = await photosOf(deps.db, spot.material_id);
  let loaded;
  try {
    loaded = await photoPartsOf(deps, photos);
  } catch (err) {
    if (err instanceof StorageError) return retryClarification(deps, job, spot, 'storage');
    throw err;
  }
  if (loaded.missing !== null || loaded.parts.length === 0)
    return retryClarification(deps, job, spot, 'photos_missing');
  if (!deps.llm.available) return retryClarification(deps, job, spot, 'model_unavailable');

  const now = deps.now();
  const homework = spot.purpose === 'homework';
  const { read } = await sheetReader(deps, spot.learner_id, {
    homework,
    parts: loaded.parts,
    now,
  });
  // Everything the sheet already asks, so the reading adds the one task and repeats nothing.
  const existing = await deps.db.query<{ prompt: string }>(
    `select prompt from items where material_id = $1 and learner_id = $2 and archived_at is null
      order by seq`,
    [spot.sheet_id, spot.learner_id],
  );
  const known = new Set(existing.map((e) => samePrompt(e.prompt)));
  let parsed;
  try {
    const res = await read(
      false,
      `${moreRules(existing.map((e) => e.prompt))}\n\n${clarifiedRules({
        task: spot.task,
        about: spot.about,
        answer: spot.answer,
      })}`,
    );
    parsed = ExtractionParse.safeParse(res.json);
  } catch (err) {
    // An outage, a budget that is used up for today, an answer cut off: try again while this
    // job has a run left. After that the question stays unwritten and says so.
    if (isAppError(err) && err.code === 'budget_exhausted')
      return retryClarification(deps, job, spot, 'budget_exhausted');
    if (err instanceof LlmError) return retryClarification(deps, job, spot, err.kind);
    throw err;
  }
  const fresh = parsed.success
    ? usableItems(parsed.data.items).filter((it) => !known.has(samePrompt(it.prompt)))
    : [];

  await deps.db.tx(async (tx) => {
    // A run past its lease writes nothing (extraction-status-writes-unfenced).
    if (!(await holdsLease(tx, job))) return;
    // Still hers, still there, still answered: the sheet could have been deleted while the
    // model was reading.
    const current = await tx.maybeOne<{ status: UnclearSpotRow['status'] }>(
      `select s.status from material_unclear_spots s join materials m on m.id = s.sheet_id
        where s.id = $1 and m.archived_at is null and m.status = 'ready' for update of s`,
      [spot.id],
    );
    if (!current || current.status !== 'answered') {
      await finishJob(tx, job, deps.now(), {
        status: 'done',
        result: { outcome: 'nothing_to_do' },
      });
      return;
    }
    const itemIds = await insertItems(
      tx,
      {
        learnerId: spot.learner_id,
        materialId: spot.sheet_id,
        subjectId: spot.sheet_subject_id,
        origin: homework ? 'homework' : 'material',
      },
      fresh,
    );
    if (homework) {
      await intoHelpSession(tx, {
        learnerId: spot.learner_id,
        sheetId: spot.sheet_id,
        goalId: spot.sheet_goal_id,
        title: spot.sheet_title,
        itemIds,
        now: deps.now(),
        joinOpen: true,
      });
    }
    await closeSpot(tx, spot.id, spot.learner_id, itemIds.length, deps.now());
    await finishJob(tx, job, deps.now(), {
      status: 'done',
      result: { outcome: 'clarified', items: itemIds.length },
    });
  });
}

/** The spot is done with: what came of her answer, and Buddy's picture of the sheet changed. */
async function closeSpot(
  tx: Db,
  spotId: string,
  learnerId: string,
  itemsAdded: number,
  now: Date,
): Promise<void> {
  await tx.query(
    `update material_unclear_spots set status = 'read', items_added = $2, read_at = $3
      where id = $1`,
    [spotId, itemsAdded, now],
  );
  await bumpContext(tx, learnerId);
}

/**
 * The clarified reading could not run (an outage, no model, the daily budget): try again while
 * this job has a run left. After the last one her answer still stands and the question stays
 * unwritten — `items_added` 0, which Buddy says out loud instead of going quiet.
 */
async function retryClarification(
  deps: Deps,
  job: JobRow,
  spot: UnclearSpotRow,
  error: string,
): Promise<void> {
  const now = deps.now();
  if (job.attempts < job.max_attempts) {
    await deps.db.tx(async (tx) => {
      await retryJob(tx, job, {
        runAt: new Date(now.getTime() + 60_000 * 2 ** Math.max(0, job.attempts - 1)),
        error,
        countAttempt: true,
        now,
      });
    });
    return;
  }
  await deps.db.tx(async (tx) => {
    if (!(await holdsLease(tx, job))) return;
    await closeSpot(tx, spot.id, spot.learner_id, 0, now);
    await finishJob(tx, job, now, { status: 'done', result: { outcome: 'not_written', error } });
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
      speak_count: number;
      session_id: string | null;
      session_status: MaterialView['session_status'];
    }
  >(
    `select m.*, s.name as subject_name,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as item_count,
            ${SPEAK_COUNT} as speak_count,
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
  // The exercises of a subject that came from NO sheet (issue #189): a vocabulary list she
  // typed, a topic she named, the practice Buddy prepared for a test. A sheet's own practice
  // is reached from the sheet, so one from a sheet is left out instead of standing twice.
  // The subject is the one her questions carry — a session has no subject column.
  // Abandoned sessions are left out: their screen has nothing to show.
  const exercises = await db.query<{
    id: string;
    subject_id: string | null;
    title: string | null;
    status: 'active' | 'finished';
    started_at: Date;
  }>(
    `select ps.id, ps.title, ps.status, ps.started_at,
            (select i.subject_id from session_items si join items i on i.id = si.item_id
              where si.session_id = ps.id and i.learner_id = ps.learner_id
                and i.subject_id is not null
              order by si.position limit 1) as subject_id
       from practice_sessions ps
      where ps.learner_id = $1 and ps.material_id is null
        and ps.status in ('active', 'finished')
      order by ps.started_at desc, ps.seq desc
      limit 200`,
    [learnerId],
  );
  // What came up in this subject, newest first. Distinct topics, not questions: this says
  // what is in there, never how many of anything (rule 6).
  const topics = await db.query<{ subject_id: string; topic: string }>(
    `select t.subject_id, t.topic
       from (select i.subject_id, btrim(i.topic) as topic, max(i.created_at) as last_seen
               from items i
              where i.learner_id = $1 and i.archived_at is null and i.subject_id is not null
                and btrim(coalesce(i.topic, '')) <> ''
              group by i.subject_id, btrim(i.topic)) t
      order by t.last_seen desc
      limit 400`,
    [learnerId],
  );
  const take = <T>(rows: T[], subjectId: string, of: (row: T) => string | null, most: number) =>
    rows.filter((r) => of(r) === subjectId).slice(0, most);
  return {
    subjects: subjects.map((s) => ({
      ...s,
      materials: materials.filter((m) => m.subject_id === s.id).map(toView),
      exercises: take(exercises, s.id, (e) => e.subject_id, 10).map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        started_at: e.started_at.toISOString(),
      })),
      topics: take(topics, s.id, (t) => t.subject_id, 12).map((t) => t.topic),
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
      // The sheet lists its questions; tapping belongs to a session, where her own other
      // words are what the choices are made of (issue #147).
      tap_choices: null,
      unit: r.unit,
      topic: r.topic,
      origin: r.origin,
      lang: r.lang,
      prompt_lang: r.prompt_lang,
      figure: r.figure,
      // The concept image is shown where the question is shown full size (sessions);
      // the material list stays a list (issue #50).
      image: null,
      // Same for the fraction bar (issue #162): a surface is something she works WITH on
      // an open question, not a control in a list of what the sheet holds.
      surface: null,
      // And for a structured item's parts (issues #228–#230): the list says what the sheet
      // asks, and arranging it belongs to the session where the answer counts.
      task_view: null,
      // A sheet holds no listening question: a spoken text comes from a listening run, never
      // from a photo (issue #210, `practice/listen.ts`). Nothing to play here either way — the
      // recording belongs to a session, like the crop and the bar above.
      listen: null,
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
