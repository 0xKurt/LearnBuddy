// Looking back: visible progress without pressure (gaps.md #7; docs/architecture.md
// §Proactivity, "Looking back"). Buddy sometimes names in the chat what now sits that
// was still shaky some days ago ("Vor einer Woche war Brüche erweitern noch wacklig –
// jetzt sitzt es.").
//
// Code decides WHEN and ABOUT WHAT, from real data; the model only phrases it (and may
// leave it out). Rules:
//   * only after a finished practice or before a test (the check triggers
//     session_finished / exam_countdown), never in an ordinary chat turn;
//   * rare: at most one look-back per LOOK_BACK.gapDays, and a topic is not named again
//     within LOOK_BACK.repeatTopicDays;
//   * honest: the topic was shaky in a practice at least shakyMinDaysAgo days ago (and
//     not since), and now every question of it she has practised was right at once,
//     at least minSeen of them, the latest within freshDays;
//   * only what was reached: never what is still open, never numbers, never missed days
//     (CLAUDE.md rule 6). It stays in the app — never on the lock screen.

import type { Db } from '../../lib/db.js';
import { daysBetween, localParts } from '../../lib/time.js';

const LOOK_BACK = {
  gapDays: 7,
  repeatTopicDays: 60,
  shakyMinDaysAgo: 5,
  shakyWithinDays: 60,
  freshDays: 7,
  minSeen: 2,
} as const;

/** The alias the model uses for the one look-back it is offered. */
const LOOK_BACK_ALIAS = 'p1';

/** The triggers after which Buddy may look back. */
export const LOOK_BACK_TRIGGERS: ReadonlySet<string> = new Set([
  'session_finished',
  'exam_countdown',
]);

export type LookBackFact = {
  subjectId: string | null;
  subjectName: string | null;
  topic: string;
  topicKey: string;
  /** The last time the topic was shaky. */
  shakyAt: Date;
  /** Whole days between then and today, in the learner's zone. */
  shakyDaysAgo: number;
};

export type LookBackFocus = {
  /** The session that was just finished: its topics come first. */
  sessionId: string | null;
  /** The subject of the test ahead: only its topics (when it has one). */
  subjectId: string | null;
};

const DAY_MS = 86_400_000;

/**
 * The one topic Buddy may look back on now, or null. Deterministic: topics of the
 * session just finished first, then the one shaky longest ago, then by name.
 */
export async function findLookBack(
  db: Db,
  learnerId: string,
  now: Date,
  timezone: string,
  focus: LookBackFocus,
): Promise<LookBackFact | null> {
  const recent = await db.maybeOne(
    `select 1 from buddy_lookbacks where learner_id = $1 and said_at > $2`,
    [learnerId, new Date(now.getTime() - LOOK_BACK.gapDays * DAY_MS)],
  );
  if (recent) return null;

  const row = await db.maybeOne<{
    subject_id: string | null;
    subject_name: string | null;
    topic: string;
    topic_key: string;
    shaky_at: Date;
  }>(
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
  if (!row) return null;
  return {
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    topic: row.topic,
    topicKey: row.topic_key,
    shakyAt: row.shaky_at,
    shakyDaysAgo: daysBetween(
      localParts(row.shaky_at, timezone).date,
      localParts(now, timezone).date,
    ),
  };
}

/** The fact as the model sees it (after the triggers). */
export function describeLookBack(fact: LookBackFact): string {
  const subject = fact.subjectName ? ` (${fact.subjectName})` : '';
  return [
    `LOOK BACK (optional, shown only in the app): ${LOOK_BACK_ALIAS} = the topic "${fact.topic}"${subject} was still shaky in a practice ${fact.shakyDaysAgo} days ago; now every question of it she practised was right at once.`,
    `If it fits this moment, name this progress in "look_back" (fact "${LOOK_BACK_ALIAS}"): one short, warm sentence in the learner's language that says roughly when it was shaky and that it sits now — no numbers of questions, no scores, nothing still open, no pressure. Otherwise look_back null.`,
  ].join('\n');
}

/**
 * Code-enforced: a look-back only about the fact offered, and only with disposition
 * "act" (it is a message in the app). Returns the reasons to repair.
 */
export function lookBackErrors(
  d: { disposition: 'act' | 'wait'; look_back?: { fact: string } | null },
  offered: LookBackFact | null,
): string[] {
  if (!d.look_back) return [];
  if (!offered) return ['look_back: there is nothing to look back on now; set look_back to null'];
  if (d.look_back.fact !== LOOK_BACK_ALIAS)
    return [`look_back.fact: the only fact offered is "${LOOK_BACK_ALIAS}"`];
  if (d.disposition === 'wait') return ['disposition "wait" must have no look_back'];
  return [];
}
