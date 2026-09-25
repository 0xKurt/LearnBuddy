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
  LibraryView,
  MaterialView,
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
import {
  EXTRACT_PROMPT_VERSION,
  EXTRACT_SYSTEM,
  ExtractionResult,
  usableItems,
} from './extract.js';

const EXTRACTION_SCHEMA = toJsonSchema(ExtractionResult);
const PHOTO_RETENTION_DAYS = 7;
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
  archived_at: Date | null;
  created_at: Date;
};

export async function materialView(
  db: Db,
  learnerId: string,
  materialId: string,
): Promise<MaterialView> {
  const m = await db.maybeOne<MaterialRow & { subject_name: string | null; item_count: number }>(
    `select m.*, s.name as subject_name,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as item_count
       from materials m left join subjects s on s.id = m.subject_id
      where m.id = $1 and m.learner_id = $2 and m.archived_at is null`,
    [materialId, learnerId],
  );
  if (!m) throw new AppError('not_found', 'Material not found');
  return toView(m);
}

function toView(
  m: MaterialRow & { subject_name: string | null; item_count: number },
): MaterialView {
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    failure_reason: m.failure_reason,
    item_count: m.item_count,
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
  const goalId = input.goal_id ?? step?.goal_id ?? null;
  const goal = goalId
    ? await deps.db.maybeOne<{ subject_id: string | null }>(
        `select subject_id from buddy_goals where id = $1 and learner_id = $2`,
        [goalId, learner.id],
      )
    : null;
  if (goalId && !goal) throw new AppError('not_found', 'Goal not found');
  const material = await deps.db.tx(async (tx) => {
    const existing = await tx.maybeOne<{ id: string }>(
      `select id from materials where learner_id = $1 and client_request_id = $2`,
      [learner.id, input.client_request_id],
    );
    if (existing) return existing.id;
    const row = await tx.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, goal_id, step_id, subject_id, photo_count, created_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        learner.id,
        input.client_request_id,
        goalId,
        step?.id ?? null,
        goal?.subject_id ?? null,
        input.photo_mimes.length,
        deps.now(),
      ],
    );
    for (const [position, mime] of input.photo_mimes.entries()) {
      const ext = mime === 'image/png' ? 'png' : 'jpg';
      await tx.query(
        `insert into material_photos (material_id, position, storage_path, mime) values ($1, $2, $3, $4)`,
        [row.id, position, `${learner.account_id}/${row.id}/${position}.${ext}`, mime],
      );
    }
    return row.id;
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
  if (m.status !== 'awaiting_upload') return { jobId: null }; // idempotent
  const photos = await deps.db.query<{ position: number; storage_path: string }>(
    `select position, storage_path from material_photos where material_id = $1 order by position`,
    [materialId],
  );
  const present = await deps.storage.existing(photos.map((p) => p.storage_path));
  const missing = photos.filter((p) => !present.has(p.storage_path)).map((p) => p.position);
  if (missing.length > 0) {
    throw new AppError('invalid_input', 'Some photos did not arrive', {
      reason: 'photos_missing',
      missing,
    });
  }
  const now = deps.now();
  return deps.db.tx(async (tx) => {
    const upd = await tx.query(
      `update materials set status = 'queued' where id = $1 and status = 'awaiting_upload' returning id`,
      [materialId],
    );
    if (upd.length === 0) return { jobId: null };
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
    if (m.failure_reason === 'not_learning_material') {
      throw new AppError('conflict', 'This does not look like learning material', {
        reason: m.failure_reason,
      });
    }
    const runs = await tx.one<{ n: number }>(
      `select count(*)::int as n from jobs where kind = 'extract_material' and payload ->> 'material_id' = $1`,
      [materialId],
    );
    if (runs.n >= MAX_EXTRACTION_ATTEMPTS)
      throw new AppError('conflict', 'Retried too often', { reason: 'retry_limit' });
    await tx.query(`update materials set status = 'queued', failure_reason = null where id = $1`, [
      materialId,
    ]);
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

async function fail(
  deps: Deps,
  job: JobRow,
  materialId: string,
  reason: NonNullable<MaterialView['failure_reason']>,
): Promise<void> {
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    await tx.query(`update materials set status = 'failed', failure_reason = $2 where id = $1`, [
      materialId,
      reason,
    ]);
    const m = await tx.one<{ learner_id: string }>(
      `select learner_id from materials where id = $1`,
      [materialId],
    );
    // Unusable photos are not kept longer than readable ones (docs/privacy.md).
    await enqueueJob(tx, {
      learnerId: m.learner_id,
      kind: 'purge_photos',
      runAt: new Date(now.getTime() + PHOTO_RETENTION_DAYS * 86_400_000),
      dedupeKey: `purge:${materialId}`,
      payload: { material_id: materialId },
    });
    await bumpContext(tx, m.learner_id);
  });
  await finishJob(deps.db, job, deps.now(), {
    status: 'done',
    result: { outcome: 'failed', reason },
  });
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
  await deps.db.query(`update materials set status = 'processing' where id = $1`, [materialId]);
  const learner = await deps.db.one<{
    id: string;
    locale: string;
    level: string;
    grade: number | null;
    birth_date: string;
  }>(`select id, locale, level, grade, birth_date from learners where id = $1`, [m.learner_id]);

  const photos = await deps.db.query<{ storage_path: string; mime: 'image/jpeg' | 'image/png' }>(
    `select storage_path, mime from material_photos where material_id = $1 order by position`,
    [materialId],
  );
  const parts: LlmPart[] = [];
  for (const p of photos) {
    const bytes = await deps.storage.download(p.storage_path);
    if (!bytes) return fail(deps, job, materialId, 'photos_missing');
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

  let result;
  try {
    const res = await callModel(deps, learner.id, localParts(now, tz.timezone).date, {
      purpose: 'extraction',
      tier: 'smart',
      promptVersion: EXTRACT_PROMPT_VERSION,
      system: EXTRACT_SYSTEM,
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
      schema: EXTRACTION_SCHEMA,
      maxOutputTokens: 12_000,
      temperature: 0.3,
      timeoutMs: 120_000,
      thinkingBudget: 0,
    });
    result = ExtractionResult.safeParse(res.json);
  } catch (err) {
    if (isAppError(err) && err.code === 'budget_exhausted')
      return fail(deps, job, materialId, 'budget_exhausted');
    if (err instanceof LlmError && err.retryable && job.attempts < job.max_attempts) {
      await deps.db.query(`update materials set status = 'queued' where id = $1`, [materialId]);
      await retryJob(deps.db, job, {
        runAt: new Date(now.getTime() + 60_000 * job.attempts),
        error: err.kind,
        countAttempt: true,
        now,
      });
      return;
    }
    return fail(deps, job, materialId, 'model_error');
  }
  if (!result.success) return fail(deps, job, materialId, 'model_error');
  const x = result.data;
  if (!x.is_learning_material) return fail(deps, job, materialId, 'not_learning_material');
  const items = usableItems(x.items);
  if (!x.readable || items.length === 0) return fail(deps, job, materialId, 'unreadable');

  await deps.db.tx(async (tx) => {
    const current = await tx.one<MaterialRow>(`select * from materials where id = $1 for update`, [
      materialId,
    ]);
    if (current.status === 'ready') return; // a concurrent run finished first
    let subjectId = current.subject_id;
    if (!subjectId && x.subject) {
      subjectId = (
        await findOrCreateSubject(tx, current.learner_id, x.subject.name, x.subject.kind)
      ).id;
    }
    for (const it of items) {
      await tx.query(
        `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, accepted_answers, unit,
                            choices, correct_choice, topic, difficulty, source_excerpt)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          current.learner_id,
          materialId,
          subjectId,
          it.kind,
          it.prompt,
          it.answer,
          it.accepted_answers,
          it.unit,
          it.choices,
          it.correct_choice,
          it.topic,
          it.difficulty,
          it.source_excerpt,
        ],
      );
    }
    await tx.query(
      `update materials set status = 'ready', failure_reason = null, title = coalesce(title, $2),
                            extracted_text = $3, subject_id = $4, ready_at = $5
        where id = $1`,
      [materialId, x.title, x.extracted_text, subjectId, now],
    );
    // The capture step Buddy asked for (or, without one, the goal's open
    // capture step) is now done — with evidence.
    if (current.step_id || current.goal_id) {
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
    await enqueueJob(tx, {
      learnerId: current.learner_id,
      kind: 'buddy_check',
      runAt: now,
      dedupeKey: `material_ready:${materialId}`,
      payload: { reason: 'material_ready', material_id: materialId },
    });
    await enqueueJob(tx, {
      learnerId: current.learner_id,
      kind: 'purge_photos',
      runAt: new Date(now.getTime() + PHOTO_RETENTION_DAYS * 86_400_000),
      dedupeKey: `purge:${materialId}`,
      payload: { material_id: materialId },
    });
    await bumpContext(tx, current.learner_id);
  });
  await finishJob(deps.db, job, deps.now(), {
    status: 'done',
    result: { outcome: 'ready', items: items.length },
  });
}

/** Raw photos are deleted 7 days after reading (docs/privacy.md). */
export async function purgePhotos(deps: Deps, job: JobRow): Promise<void> {
  const materialId = String(job.payload.material_id ?? '');
  const photos = await deps.db.query<{ storage_path: string }>(
    `select storage_path from material_photos where material_id = $1`,
    [materialId],
  );
  await deps.storage.remove(photos.map((p) => p.storage_path));
  await deps.db.query(`update materials set photos_deleted_at = $2 where id = $1`, [
    materialId,
    deps.now(),
  ]);
  await finishJob(deps.db, job, deps.now(), { status: 'done', result: { removed: photos.length } });
}

/**
 * Photos that never all arrived (the app was closed mid-send) are given up after a day: the
 * material is set aside (never shown, nothing to read) and what did arrive is deleted now.
 */
export async function abandonStaleUploads(deps: Deps): Promise<number> {
  const now = deps.now();
  return deps.db.tx(async (tx) => {
    const stale = await tx.query<{ id: string; learner_id: string }>(
      `update materials set status = 'failed', failure_reason = 'photos_missing', archived_at = $1
        where status = 'awaiting_upload' and archived_at is null and created_at < $2
        returning id, learner_id`,
      [now, new Date(now.getTime() - ABANDON_UPLOAD_MS)],
    );
    for (const m of stale) {
      await enqueueJob(tx, {
        learnerId: m.learner_id,
        kind: 'purge_photos',
        runAt: now,
        dedupeKey: `purge:${m.id}:abandoned`,
        payload: { material_id: m.id },
      });
    }
    return stale.length;
  });
}

export async function archiveMaterial(
  deps: Deps,
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
    await tx.query(
      `update items set archived_at = $2 where material_id = $1 and archived_at is null`,
      [materialId, now],
    );
    // Deleted by the learner: the photos go now, not after the retention period.
    await enqueueJob(tx, {
      learnerId,
      kind: 'purge_photos',
      runAt: now,
      dedupeKey: `purge:${materialId}:archived`,
      payload: { material_id: materialId },
    });
    await bumpContext(tx, learnerId);
  });
}

export async function libraryView(db: Db, learnerId: string): Promise<LibraryView> {
  const materials = await db.query<
    MaterialRow & { subject_name: string | null; item_count: number }
  >(
    `select m.*, s.name as subject_name,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as item_count
       from materials m left join subjects s on s.id = m.subject_id
      where m.learner_id = $1 and m.archived_at is null
      order by m.created_at desc
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
