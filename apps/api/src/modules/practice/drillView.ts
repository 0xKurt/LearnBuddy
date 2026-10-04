// The part of a session view only a Kopfrechnen round has (issue #243). Kept apart from
// `drillRound.ts` because `sessionView.ts` builds every session view and must not import the
// module that imports it.

import { DrillSpec, type DrillView } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import { drillLine, factOf, inputOf, type ClosedTask } from './drill.js';

/**
 * What only a round adds to its session view: the range, what the pad needs, the task she
 * just answered and — once it is over — the one line. Null when the stored range does not
 * read (the session then shows like any other, never a crash).
 */
export async function drillViewOf(
  db: Db,
  session: { id: string; status: string; drill: unknown },
): Promise<DrillView | null> {
  const parsed = DrillSpec.safeParse(session.drill);
  if (!parsed.success) return null;
  const spec = parsed.data;
  const last = await db.maybeOne<{
    item_id: string;
    text: string;
    verdict: string | null;
    prompt: string;
    answer: string;
  }>(
    `select pt.item_id, pt.text, pt.verdict, i.prompt, i.answer
       from practice_turns pt join items i on i.id = pt.item_id
      where pt.session_id = $1 and pt.role = 'learner'
      order by pt.seq desc limit 1`,
    [session.id],
  );
  let summary: DrillView['summary'] = null;
  if (session.status === 'finished') {
    const rows = await db.query<{
      drill_fact: string | null;
      status: string;
      before: { last_outcome?: string | null } | null;
    }>(
      `select i.drill_fact, si.status, si.state_before as before
         from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 and si.status <> 'open'`,
      [session.id],
    );
    const tasks: ClosedTask[] = rows.flatMap((r) => {
      const fact = r.drill_fact ? factOf(r.drill_fact) : null;
      return fact
        ? [{ fact, correct: r.status === 'correct', before: r.before?.last_outcome ?? null }]
        : [];
    });
    summary = drillLine(tasks, spec);
  }
  return {
    spec,
    input: inputOf(spec),
    last: last
      ? {
          item_id: last.item_id,
          prompt: last.prompt,
          answer: last.answer,
          given: last.text,
          correct: last.verdict === 'correct',
        }
      : null,
    summary,
  };
}
