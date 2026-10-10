// What Buddy may look back on (issue #107, cut 5; buddy/lookback.ts decides when): a topic that
// sits now and was still shaky in a practice some days ago ("Vor einer Woche war Brüche erweitern
// noch wacklig – jetzt sitzt es."). Rules, all read from her practice:
//   * honest: the topic was shaky in a practice at least shakyMinDaysAgo days ago (and not
//     since), and now every question of it she has practised was right at once, at least
//     minSeen of them, the latest within freshDays;
//   * rare: a topic is not named again within repeatTopicDays;
//   * deterministic: topics of the session just finished first, then the one shaky longest ago,
//     then by name.

import type { Db } from '../../lib/db.js';
import type { LookBackCandidate, LookBackFocus } from '../buddy/lookback.js';

const LOOK_BACK = {
  repeatTopicDays: 60,
  shakyMinDaysAgo: 5,
  shakyWithinDays: 60,
  freshDays: 7,
  minSeen: 2,
} as const;

const DAY_MS = 86_400_000;

/** The topic to look back on, or null (the context provider's `lookBack`). */
export async function findLearningLookBack(
  db: Db,
  learnerId: string,
  now: Date,
  focus: LookBackFocus,
): Promise<LookBackCandidate | null> {
  return db.maybeOne<LookBackCandidate>(
    `with topic_items as (
       select i.id, i.subject_id, btrim(i.topic) as topic, lower(btrim(i.topic)) as topic_key
         from items i
        where i.learner_id = $1 and i.archived_at is null and i.origin <> 'homework'
          and nullif(btrim(i.topic), '') is not null
     ),
     sits as (
       select ti.subject_id, ti.topic_key, min(ti.topic) as topic,
              count(*) as seen,
              bool_and(st.last_outcome = 'first_try') as all_first_try,
              max(st.last_review) as last_review
         from topic_items ti join item_states st on st.item_id = ti.id
        where st.last_outcome is not null
        group by ti.subject_id, ti.topic_key
     ),
     shaky as (
       select ti.subject_id, ti.topic_key, max(si.closed_at) as shaky_at
         from topic_items ti
         join session_items si on si.item_id = ti.id
         join practice_sessions ps on ps.id = si.session_id and ps.learner_id = $1
        where si.status <> 'open' and si.flagged_at is null and si.closed_at is not null
          and not (si.status = 'correct' and coalesce(si.first_try_correct, false))
          and si.closed_at > $2
        group by ti.subject_id, ti.topic_key
     ),
     in_session as (
       select distinct i.subject_id, lower(btrim(i.topic)) as topic_key
         from session_items si join items i on i.id = si.item_id
        where si.session_id = $6 and si.status <> 'open' and si.flagged_at is null
     )
     select s.subject_id, sub.name as subject_name, s.topic, s.topic_key, h.shaky_at
       from sits s
       join shaky h on h.topic_key = s.topic_key and h.subject_id is not distinct from s.subject_id
       left join subjects sub on sub.id = s.subject_id
      where s.all_first_try and s.seen >= $3 and s.last_review > $4
        and h.shaky_at <= $5
        and ($7::uuid is null or s.subject_id = $7)
        and not exists (
              select 1 from buddy_lookbacks b
               where b.learner_id = $1 and b.topic_key = s.topic_key
                 and b.subject_id is not distinct from s.subject_id and b.said_at > $8)
      order by exists (select 1 from in_session x
                        where x.topic_key = s.topic_key
                          and x.subject_id is not distinct from s.subject_id) desc,
               h.shaky_at, s.topic_key
      limit 1`,
    [
      learnerId,
      new Date(now.getTime() - LOOK_BACK.shakyWithinDays * DAY_MS),
      LOOK_BACK.minSeen,
      new Date(now.getTime() - LOOK_BACK.freshDays * DAY_MS),
      new Date(now.getTime() - LOOK_BACK.shakyMinDaysAgo * DAY_MS),
      focus.sessionId,
      focus.subjectId,
      new Date(now.getTime() - LOOK_BACK.repeatTopicDays * DAY_MS),
    ],
  );
}
