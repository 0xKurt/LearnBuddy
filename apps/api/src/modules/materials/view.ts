// What she sees of a sheet: its row, the query that reads it, and the view the app gets.
// docs/architecture.md §Material.

import type {
  MaterialSource,
  MaterialView,
  NotPracticable,
  PageProblem,
} from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';

export type MaterialRow = {
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
  source: MaterialSource;
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

/** A material row with what its card shows besides: subject, question counts, latest session. */
export type MaterialViewRow = Pick<
  MaterialRow,
  | 'id'
  | 'subject_id'
  | 'title'
  | 'status'
  | 'failure_reason'
  | 'photos_deleted_at'
  | 'purpose'
  | 'source'
  | 'pages_resolved_at'
  | 'page_problems'
  | 'items_incomplete'
  | 'not_practicable'
  | 'photo_count'
  | 'merged_into'
  | 'goal_id'
  | 'created_at'
> & {
  subject_name: string | null;
  item_count: number;
  speak_count: number;
  session_id: string | null;
  session_status: MaterialView['session_status'];
};

/**
 * The one query behind every card (`MaterialViewRow`); the caller adds `where` and order.
 * Only the columns a card shows, the two counts in one pass over its questions and the newest
 * session found once (#717): the library reads up to 200 sheets with it. The speaking count is
 * exactly what a speaking run started from the sheet would hold — the same two conditions
 * `practice/selection.ts` applies for `run = 'speak'` (issue #223 point 2).
 */
export const VIEW_SELECT = `select m.id, m.subject_id, m.title, m.status, m.failure_reason, m.photos_deleted_at, m.purpose,
            m.source, m.pages_resolved_at, m.page_problems, m.items_incomplete, m.not_practicable,
            m.photo_count, m.merged_into, m.goal_id, m.created_at,
            s.name as subject_name,
            q.item_count, q.speak_count,
            ls.id as session_id, ls.status as session_status
       from materials m
       left join subjects s on s.id = m.subject_id
       cross join lateral (
         select count(*)::int as item_count,
                (count(*) filter (where i.kind = 'speak' and i.origin <> 'homework'))::int as speak_count
           from items i where i.material_id = m.id and i.archived_at is null) q
       left join lateral (
         select ps.id, ps.status from practice_sessions ps where ps.material_id = m.id
          order by ps.started_at desc, ps.seq desc limit 1) ls on true`;

export async function materialView(
  db: Db,
  learnerId: string,
  materialId: string,
): Promise<MaterialView> {
  const m = await db.maybeOne<MaterialViewRow>(
    `${VIEW_SELECT}
      where m.id = $1 and m.learner_id = $2 and m.archived_at is null`,
    [materialId, learnerId],
  );
  if (!m) throw new AppError('not_found', 'Material not found');
  return toView(m);
}

export function toView(m: MaterialViewRow): MaterialView {
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    failure_reason: m.failure_reason,
    photos_deleted: m.photos_deleted_at !== null,
    item_count: m.item_count,
    speak_count: m.speak_count,
    purpose: m.purpose,
    source: m.source,
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
