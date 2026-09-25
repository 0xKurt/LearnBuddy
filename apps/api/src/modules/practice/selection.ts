// Chooses the questions for a practice set. Deterministic, shared by Buddy's
// prepare_practice tool, its fallbacks, and manual practice from the library.
//
// Order: questions due for review (FSRS) → never practised → the rest by due
// date. Focus topics narrow the pool when they match enough questions.

import type { Db } from '../../lib/db.js';

export type PracticeScope = {
  goalId?: string | null;
  subjectId?: string | null;
  materialId?: string | null;
};

export const QUESTIONS_PER_MINUTE = 1.2;

export function questionCountFor(minutes: number): number {
  return Math.min(15, Math.max(3, Math.round(minutes * QUESTIONS_PER_MINUTE)));
}

type Candidate = { id: string; topic: string | null; due: Date | null };

export async function selectPracticeItems(
  db: Db,
  learnerId: string,
  scope: PracticeScope,
  focusTopics: string[],
  count: number,
  now: Date,
): Promise<string[]> {
  // For a goal: its own material first; if it has none yet, its subject.
  let goalMaterialsOnly = false;
  let subjectId = scope.subjectId ?? null;
  if (scope.goalId) {
    const g = await db.maybeOne<{ subject_id: string | null; has_material: boolean }>(
      `select g.subject_id,
              exists (select 1 from items i join materials m on m.id = i.material_id
                       where m.goal_id = g.id and i.archived_at is null) as has_material
         from buddy_goals g where g.id = $1 and g.learner_id = $2`,
      [scope.goalId, learnerId],
    );
    if (!g) return [];
    goalMaterialsOnly = g.has_material;
    subjectId = subjectId ?? g.subject_id;
  }

  const candidates = await db.query<Candidate>(
    `select i.id, i.topic, st.due
       from items i
       left join materials m on m.id = i.material_id
       left join item_states st on st.item_id = i.id
      where i.learner_id = $1 and i.archived_at is null and (m.id is null or m.archived_at is null)
        -- Homework is helped with, not drilled; speaking needs a quiet moment the learner chooses.
        and i.origin <> 'homework' and i.kind <> 'speak'
        and ($2::uuid is null or m.goal_id = $2)
        and ($3::uuid is null or i.subject_id = $3)
        and ($4::uuid is null or i.material_id = $4)
      order by
        case when st.due is not null and st.due <= $5 then 0
             when st.item_id is null then 1
             else 2 end,
        st.due nulls last,
        i.created_at, i.id
      limit 200`,
    [
      learnerId,
      goalMaterialsOnly ? scope.goalId : null,
      goalMaterialsOnly ? null : subjectId,
      scope.materialId ?? null,
      now,
    ],
  );
  if (candidates.length === 0) return [];

  const wanted = focusTopics.map((t) => t.toLowerCase().trim()).filter(Boolean);
  let pool = candidates;
  if (wanted.length > 0) {
    const focused = candidates.filter((c) => {
      const topic = (c.topic ?? '').toLowerCase();
      return topic !== '' && wanted.some((w) => topic.includes(w) || w.includes(topic));
    });
    // Only narrow when the focus actually matches a meaningful set.
    if (focused.length >= Math.min(3, count)) {
      const rest = candidates.filter((c) => !focused.includes(c));
      pool = [...focused, ...rest];
    }
  }
  return pool.slice(0, count).map((c) => c.id);
}
