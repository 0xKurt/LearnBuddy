// The home uses the same counts, drill result and timer facts as the session page (#918).
import type { DrillLine } from '@learnbuddy/shared-types/contracts';
import type { Db } from '../../lib/db.js';
import { ranOut } from '../practice/testClock.js';
import { drillSummary, type DrillSummaryRow } from '../practice/drillView.js';
import { summarize, type SummaryRow } from '../practice/summary.js';

export type SessionBrief = {
  id: string;
  pass: 'cards' | 'drill' | null;
  ran_out: boolean;
  drill_summary: DrillLine | null;
  right: number;
  mode: 'practice' | 'test' | 'help';
  /** Topic and homework sessions carry their own title. */
  title: string | null;
  status: 'active' | 'finished' | 'abandoned';
  goal_id: string | null;
  step_id: string | null;
  started_at: Date;
  /** Resuming is keyed on this, not on started_at (audit H-7; practice/lifecycle.ts). */
  last_activity_at: Date;
  finished_at: Date | null;
  total: number;
  answered: number;
  first_try: number;
  /**
   * Never worked in (`WORKED_IN`): nothing she started, so nothing to "go on with" — whether the
   * background preparation of an offer wrote it (practice/prepare.ts, issue #48), or she opened a
   * practice prepared from her photo and left before answering (#599). Never a homework (`help`):
   * the home card is its way in. `loadStandingOffers` reads "taken up" the same way (rule 5).
   */
  untouched: boolean;
  secure_topics: string[];
  shaky_topics: string[];
};

export const WORKED_IN = `(exists (select 1 from session_items w
                              where w.session_id = ps.id
                                and (w.status <> 'open' or w.attempts > 0 or w.hints_used > 0
                                     or w.deferred_at is not null or w.flagged_at is not null))
                    or exists (select 1 from practice_turns w
                                where w.session_id = ps.id and w.role = 'learner'))`;

export async function loadSessions(db: Db, learnerId: string): Promise<SessionBrief[]> {
  const sessionRows = await db.query<
    Omit<
      SessionBrief,
      | 'secure_topics'
      | 'shaky_topics'
      | 'answered'
      | 'first_try'
      | 'right'
      | 'ran_out'
      | 'drill_summary'
    > & {
      deadline_at: Date | null;
      drill: unknown;
      topic_rows: Array<SummaryRow & DrillSummaryRow>;
    }
  >(
    `select ps.id, ps.status, ps.goal_id, ps.step_id, ps.started_at, ps.last_activity_at,
            ps.finished_at, case when ps.mode = 'explain' then 'practice' else ps.mode end as mode,
            ps.title, ps.pass, ps.deadline_at, ps.drill,
            count(si.item_id)::int as total,
            -- Her homework from her own photos is hers from the moment she sent it: the home card
            -- is its way in, worked in or not (session-lifecycle H-7). Every other session is
            -- hers to go on with only once she worked in it (#599).
            (ps.mode <> 'help' and not ${WORKED_IN}) as untouched,
            coalesce(json_agg(json_build_object('topic', i.topic, 'status', si.status,
                                                'first_try_correct', si.first_try_correct,
                                                -- Recognition and production are different
                                                -- evidence (issue #163).
                                                'answered_by', si.answered_by,
                                                -- A free text she did not get right names no
                                                -- shaky topic (issue #197).
                                                'kind', i.kind, 'drill_fact', i.drill_fact,
                                                'before', si.state_before))
                       filter (where si.item_id is not null), '[]'::json) as topic_rows
       from practice_sessions ps
       -- A question she flagged as unfit counts as neither answered nor shaky.
       left join session_items si on si.session_id = ps.id and si.flagged_at is null
       left join items i on i.id = si.item_id
      where ps.learner_id = $1
        and (ps.status = 'active'
             or ps.id in (select id from practice_sessions where learner_id = $1
                           order by started_at desc, seq desc limit $2))
      group by ps.id
      order by ps.started_at desc, ps.seq desc`,
    [learnerId, 5],
  );
  return sessionRows.map(({ topic_rows, ...s }) => {
    const summary = summarize(topic_rows);
    const { deadline_at: _deadline, drill, ...brief } = s;
    return {
      ...brief,
      ...summary,
      right: summary.right ?? 0,
      ran_out: ranOut(s),
      drill_summary:
        s.pass === 'drill' && s.status === 'finished' ? drillSummary(topic_rows, drill) : null,
    };
  });
}
