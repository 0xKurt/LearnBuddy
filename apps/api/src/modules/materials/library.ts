// Her library: the sheets and practice of each subject, and a sheet she renames there.
// docs/architecture.md §Material.

import type { LibraryView, MaterialView } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import { materialView, SPEAK_COUNT, toView, type MaterialRow } from './view.js';

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
