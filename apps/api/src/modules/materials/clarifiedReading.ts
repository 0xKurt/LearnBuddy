// One more reading of a sheet, for a spot she settled (issue #164 point 1).
// docs/architecture.md §Material.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { isAppError } from '../../lib/errors.js';
import { LlmError } from '../../llm/gateway.js';
import { StorageError } from '../../storage/gateway.js';
import { bumpContext } from '../buddy/plan.js';
import { insertItems, samePrompt } from '../practice/items.js';
import { backoffMs, finishJob, retryJob, type JobRow } from '../scheduler/jobs.js';
import { clarifiedRules, moreRules } from './extract.js';
import { intoHelpSession } from './helpSession.js';
import { loadPhotos } from './photos.js';
import { sheetReader } from './reader.js';
import { holdsLease } from './readingJob.js';
import { addedQuestions } from './sheetQuestions.js';
import { ReadingParse } from './sources.js';
import type { UnclearSpotRow } from './unclear.js';
import type { MaterialRow } from './view.js';

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
export async function runClarifiedReading(deps: Deps, job: JobRow, spotId: string): Promise<void> {
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

  let loaded;
  try {
    loaded = await loadPhotos(deps, spot.material_id);
  } catch (err) {
    if (err instanceof StorageError) return retryClarification(deps, job, spot, 'storage');
    throw err;
  }
  if (loaded.missing !== null || loaded.parts.length === 0)
    return retryClarification(deps, job, spot, 'photos_missing');
  if (!deps.llm.available) return retryClarification(deps, job, spot, 'model_unavailable');

  const now = deps.now();
  const homework = spot.purpose === 'homework';
  const { learner, read } = await sheetReader(deps, spot.learner_id, {
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
    parsed = ReadingParse.safeParse(res.json);
  } catch (err) {
    // An outage, a budget that is used up for today, an answer cut off: try again while this
    // job has a run left. After that the question stays unwritten and says so.
    if (isAppError(err) && err.code === 'budget_exhausted')
      return retryClarification(deps, job, spot, 'budget_exhausted');
    if (err instanceof LlmError) return retryClarification(deps, job, spot, err.kind);
    throw err;
  }
  const forms = { locale: learner.locale, off: deps.config.FORMS_OFF };
  const fresh = parsed.success ? addedQuestions(parsed.data, known, forms) : [];

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
        runAt: new Date(now.getTime() + backoffMs(job.attempts)),
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
