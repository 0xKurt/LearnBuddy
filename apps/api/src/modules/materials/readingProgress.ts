// A sheet stays processing/incomplete while validated questions reach its existing start card.
// No model or provider wait is held inside a transaction. docs/architecture.md §Material.
import type { z } from 'zod';

import type { Deps } from '../../deps.js';
import { t } from '../../i18n/index.js';
import type { Db } from '../../lib/db.js';
import { localParts } from '../../lib/time.js';
import { preparedPractice } from '../buddy/checkFallback.js';
import { bumpContext } from '../buddy/plan.js';
import { formsOn } from '../practice/items.js';
import { tenMinutesOf } from '../practice/selection.js';
import type { JobRow } from '../scheduler/jobs.js';
import { holdsLease } from './readingJob.js';
import { sheetQuestions } from './sheetQuestions.js';
import { applySource, type ReadingParse } from './sources.js';
import { storeReadingQuestions } from './storeReadingQuestions.js';
import type { MaterialRow } from './view.js';

/** Only the waiting practice created for this stream grows; a started run keeps its questions. */
export async function growReadingPractice(
  tx: Db,
  m: MaterialRow,
  subjectId: string | null,
  now: Date,
): Promise<void> {
  const step = await tx.maybeOne<{ id: string; state: string }>(
    `select id, state from buddy_steps
      where learner_id = $1 and payload ->> 'reading_material_id' = $2
      order by seq desc limit 1 for update`,
    [m.learner_id, m.id],
  );
  if (!step || step.state !== 'prepared') return;
  const { itemIds, minutes } = await tenMinutesOf(tx, m.learner_id, { materialId: m.id }, [], now);
  await tx.query(
    `update buddy_steps set payload = payload || $2::jsonb, version = version + 1 where id = $1`,
    [step.id, JSON.stringify({ item_ids: itemIds, est_minutes: minutes, subject_id: subjectId })],
  );
}

export function readingProgress(
  deps: Deps,
  job: JobRow,
  material: MaterialRow,
  locale: string,
  timezone: string,
) {
  // Homework opens its help session, and added pages merge atomically with their root sheet.
  // Their existing completion path stays authoritative; neither opens a new practice card.
  const accept =
    material.purpose === 'study' && !material.completes_material_id
      ? async (x: z.infer<typeof ReadingParse>) => {
          if (!x.is_learning_material || !x.readable) return;
          const sourced = applySource(x, material.photo_count);
          if (sourced.nothingMarked) return;
          const reading = sourced.reading;
          const items = formsOn(
            sheetQuestions(reading, {
              locale,
              off: deps.config.FORMS_OFF,
              homework: false,
            }),
            deps.config.FORMS_OFF,
          );
          if (items.length === 0) return;
          await deps.db.tx(async (tx) => {
            if (!(await holdsLease(tx, job))) return;
            const m = await tx.one<MaterialRow>(
              `select * from materials where id = $1 for update`,
              [material.id],
            );
            if (m.archived_at || m.status !== 'processing') return;
            const { subjectId, itemIds } = await storeReadingQuestions(tx, m, reading, items, true);
            if (itemIds.length === 0) return;
            const now = deps.now();
            await tx.query(
              `update materials set items_incomplete = true, title = coalesce(title, $2),
               subject_id = $3, source = $4 where id = $1`,
              [m.id, reading.title, subjectId, reading.source],
            );
            const existing = await tx.maybeOne(
              `select 1 from buddy_steps where learner_id = $1 and payload ->> 'reading_material_id' = $2`,
              [m.learner_id, m.id],
            );
            if (!existing) {
              const p = await preparedPractice(
                tx,
                m.learner_id,
                {
                  goalId: m.goal_id,
                  subjectId,
                  materialId: m.id,
                  title: m.title ?? reading.title ?? t(locale, 'practice.untitled'),
                },
                localParts(now, timezone).date,
                now,
              );
              if (p?.created)
                await tx.query(
                  `update buddy_steps set payload = payload || $2::jsonb where id = $1`,
                  [p.stepId, JSON.stringify({ reading_material_id: m.id })],
                );
            }
            await growReadingPractice(tx, m, subjectId, now);
            await bumpContext(tx, m.learner_id);
          });
        }
      : undefined;
  return {
    accept,
    hasQuestions: async () =>
      (await deps.db.maybeOne(`select 1 from items where material_id = $1 limit 1`, [
        material.id,
      ])) !== null,
  };
}
