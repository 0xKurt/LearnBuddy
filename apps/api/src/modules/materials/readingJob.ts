// How a reading run ends when it cannot write questions: fenced by its lease, failed honestly
// or tried again after an outage. docs/architecture.md §Material.

import {
  PHOTOS_GONE_AT_ONCE,
  type MaterialView,
  type NotPracticable,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { bumpContext } from '../buddy/plan.js';
import { backoffMs, finishJob, retryJob, type JobRow } from '../scheduler/jobs.js';
import { enqueuePhotoPurge, PHOTO_RETENTION_DAYS } from './purge.js';
import { abandonStaleUploads } from './submit.js';

/**
 * The one way a material becomes failed — from the reading job and from the scheduler's
 * recovery alike: status, the photo purge after the retention period (at once when it is
 * not learning material) and Buddy's context, in the caller's transaction.
 */
async function markMaterialFailed(
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
  // A corrected test with nothing marked shows a grade: its photos go at once too (#259).
  const keepMs = PHOTOS_GONE_AT_ONCE.has(reason) ? 0 : PHOTO_RETENTION_DAYS * 86_400_000;
  await enqueuePhotoPurge(tx, {
    learnerId: m.learner_id,
    materialId,
    runAt: new Date(now.getTime() + keepMs),
  });
  await bumpContext(tx, m.learner_id);
}

/**
 * The scheduler's recovery for readings (registered by modules/learning/register.ts): material
 * whose reading job gave up must not look "in progress" forever. It fails the same way as in the
 * job — with its photo purge and a context bump (repro-14). Uploads nobody finished are given up.
 */
export async function recoverReadings(deps: Deps): Promise<void> {
  await deps.db.tx(async (tx) => {
    const stuck = await tx.query<{ id: string }>(
      `select m.id from materials m
        where m.status in ('queued','processing') and m.archived_at is null
          and not exists (select 1 from jobs j where j.kind = 'extract_material'
                            and j.payload ->> 'material_id' = m.id::text
                            and j.status in ('queued','running'))
        for update of m skip locked`,
    );
    for (const m of stuck) await markMaterialFailed(tx, m.id, 'model_error', deps.now());
  });
  await abandonStaleUploads(deps);
}

export async function fail(
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
export async function holdsLease(tx: Db, job: JobRow): Promise<boolean> {
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
export async function retryTransient(
  deps: Deps,
  job: JobRow,
  materialId: string,
  error: string,
): Promise<void> {
  const now = deps.now();
  if (job.attempts < job.max_attempts) {
    await deps.db.tx(async (tx) => {
      const requeued = await retryJob(tx, job, {
        runAt: new Date(now.getTime() + backoffMs(job.attempts)),
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
