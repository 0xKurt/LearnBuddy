// Connector "practice": how practice went — finished sessions with what sat
// and what didn't, and the questions on a topic with their latest result.
// Internal; scoped by the learner id in code. ADR 0005 §Connectors.

import type { Db } from '../../../lib/db.js';
import { localParts } from '../../../lib/time.js';
import { prefixQuery } from './search.js';

export type SessionResult = {
  on: string;
  title: string;
  mode: string;
  answered: number;
  first_try: number;
  secure_topics: string[];
  shaky_topics: string[];
};

/** Finished sessions, newest first; with a topic, only sessions that had questions on it. */
export async function recentResults(
  db: Db,
  learnerId: string,
  timezone: string,
  topic: string | null,
  limit: number,
): Promise<SessionResult[]> {
  const q = topic ? prefixQuery(topic) : null;
  const sessions = await db.query<{
    id: string;
    finished_at: Date;
    title: string | null;
    mode: string;
  }>(
    `select ps.id, ps.finished_at, coalesce(ps.title, g.title, st.title) as title, ps.mode
       from practice_sessions ps
       left join buddy_goals g on g.id = ps.goal_id left join buddy_steps st on st.id = ps.step_id
      where ps.learner_id = $1 and ps.status = 'finished' and ps.finished_at is not null
        and ($3::text is null or exists (
              select 1 from session_items si join items i on i.id = si.item_id
               where si.session_id = ps.id
                 and to_tsvector('simple', coalesce(i.topic, '') || ' ' || i.prompt) @@ to_tsquery('simple', $3)))
      order by ps.finished_at desc limit $2`,
    [learnerId, limit, q],
  );
  if (sessions.length === 0) return [];
  const items = await db.query<{
    session_id: string;
    topic: string | null;
    status: string;
    first_try_correct: boolean | null;
  }>(
    `select si.session_id, i.topic, si.status, si.first_try_correct
       from session_items si join items i on i.id = si.item_id
      where si.session_id = any($1::uuid[]) and i.learner_id = $2 and si.status <> 'open'`,
    [sessions.map((s) => s.id), learnerId],
  );
  return sessions.map((s) => {
    const mine = items.filter((i) => i.session_id === s.id);
    const byTopic = new Map<string, boolean>();
    for (const i of mine) {
      if (!i.topic) continue;
      const sits = i.status === 'correct' && i.first_try_correct === true;
      byTopic.set(i.topic, (byTopic.get(i.topic) ?? true) && sits);
    }
    return {
      on: localParts(s.finished_at, timezone).date,
      title: s.title ?? '',
      mode: s.mode,
      answered: mine.length,
      first_try: mine.filter((i) => i.first_try_correct === true).length,
      secure_topics: [...byTopic].filter(([, ok]) => ok).map(([t]) => t),
      shaky_topics: [...byTopic].filter(([, ok]) => !ok).map(([t]) => t),
    };
  });
}

export type QuestionHit = {
  prompt: string;
  topic: string | null;
  from: string | null;
  /** The latest result: first_try, with_help, not_known, or never asked. */
  last: 'first_try' | 'with_help' | 'not_known' | 'never_asked';
};

/** Questions whose topic or text matches, with how she did the last time. Never the solutions. */
export async function findQuestions(
  db: Db,
  learnerId: string,
  query: string,
  limit: number,
): Promise<QuestionHit[]> {
  const q = prefixQuery(query);
  if (q === null) return [];
  const rows = await db.query<{
    prompt: string;
    topic: string | null;
    source: string | null;
    status: string | null;
    first_try_correct: boolean | null;
  }>(
    `select i.prompt, i.topic, coalesce(m.title, ps0.title) as source, last.status, last.first_try_correct
       from items i
       left join materials m on m.id = i.material_id
       left join lateral (
         select si.status, si.first_try_correct, si.session_id from session_items si
          where si.item_id = i.id and si.status <> 'open'
          order by si.closed_at desc nulls last limit 1) last on true
       left join practice_sessions ps0 on ps0.id = last.session_id
      where i.learner_id = $1 and i.archived_at is null
        and to_tsvector('simple', coalesce(i.topic, '') || ' ' || i.prompt) @@ to_tsquery('simple', $3)
      order by i.created_at desc limit $2`,
    [learnerId, limit, q],
  );
  return rows.map((r) => ({
    prompt: r.prompt.slice(0, 300),
    topic: r.topic,
    from: r.source,
    last:
      r.status === null
        ? 'never_asked'
        : r.status === 'correct'
          ? r.first_try_correct
            ? 'first_try'
            : 'with_help'
          : 'not_known',
  }));
}
