// Where the practice behind a card in the conversation stands now (issue #844): a card Buddy
// showed (`show_ready`) or a background message announced (`announces`) keeps standing in the
// thread once she started it — running, done or closed — instead of vanishing, so the history
// stays what it was and never claims a start that is gone (CLAUDE.md rule 5).

import type { PracticeOutcome } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';

/** Each step's outcome by id; null while it waits to be started. A step not found is closed. */
export async function practiceOutcomes(
  db: Db,
  learnerId: string,
  stepIds: readonly string[],
): Promise<Map<string, PracticeOutcome | null>> {
  const ids = [...new Set(stepIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.query<{
    id: string;
    state: string;
    session_id: string | null;
    session_status: string | null;
    left: number;
  }>(
    `select s.id, s.state, ps.id as session_id, ps.status as session_status,
            coalesce((select count(*) from session_items si
                       where si.session_id = ps.id and si.status = 'open'), 0)::int as left
       from buddy_steps s
       left join lateral (
         select id, status from practice_sessions
          where learner_id = $1 and step_id = s.id
          order by started_at desc limit 1
       ) ps on true
      where s.learner_id = $1 and s.id = any($2::uuid[]) and s.kind = 'practice'`,
    [learnerId, ids],
  );
  const out = new Map<string, PracticeOutcome | null>();
  for (const id of ids) out.set(id, { state: 'closed' });
  for (const r of rows) {
    out.set(
      r.id,
      r.session_id && r.session_status === 'active'
        ? { state: 'running', session_id: r.session_id, left: r.left }
        : r.session_id && r.session_status === 'finished'
          ? { state: 'done', session_id: r.session_id }
          : r.state === 'prepared'
            ? null
            : { state: 'closed' },
    );
  }
  return out;
}
