// Whether practice on a topic is going well enough for Buddy to offer a Probetest (issue #388,
// report „Hilfe und Fragen beim Üben" §3.5). Code decides it, never the model (CLAUDE.md rule 1).
// The evidence is Pan & Rickard 2018: transfer from a test works better the more accurate the
// learner already was in practice. Offered too early, a test is only a list of misses.
//
// It reads only what is already recorded, `session_items` of her practice runs. Nothing new is
// tracked. Her own choice is a different door: a test she asks for in her own words
// (`offers.ts`), or "Probetest" tapped in the app, is never held back by this.

import type { Db } from '../../lib/db.js';

/** How many of her latest closed practice questions on the topic are looked at. */
const READY_WINDOW = 10;
/** Fewer closed questions than this say nothing yet: she has hardly practised it. */
const READY_MIN_CLOSED = 5;
/** The share of those she got right (with or without help) that counts as "going well". */
const READY_SHARE = 0.7;

export type ReadyScope = {
  /** A planned test: the questions of the sheets she photographed for it. */
  goalId: string | null;
  /** Otherwise the topic in her words, matched against the questions' topics. */
  text: string;
};

/**
 * Practice on this scope is going well: of her last `READY_WINDOW` closed practice questions on
 * it, at least `READY_MIN_CLOSED` and at least `READY_SHARE` of them right. A question she took
 * out ("Frage passt nicht") or whose judgement she disputed says nothing and is left out.
 */
export async function practiceGoesWell(
  db: Db,
  learnerId: string,
  scope: ReadyScope,
): Promise<boolean> {
  const topic = scope.text.trim().toLowerCase();
  const rows = await db.query<{ status: string }>(
    `select si.status from session_items si
       join practice_sessions ps on ps.id = si.session_id
       join items i on i.id = si.item_id
       left join materials m on m.id = i.material_id
      where ps.learner_id = $1 and i.learner_id = $1 and ps.mode = 'practice'
        and si.status <> 'open' and si.flagged_at is null and si.disputed_at is null
        and si.closed_at is not null
        and (case when $2::uuid is not null then m.goal_id = $2
                  else i.topic is not null and btrim(i.topic) <> ''
                       and (strpos($3, lower(btrim(i.topic))) > 0
                            or strpos(lower(btrim(i.topic)), $3) > 0) end)
      order by si.closed_at desc
      limit $4`,
    [learnerId, scope.goalId, topic, READY_WINDOW],
  );
  if (rows.length < READY_MIN_CLOSED) return false;
  const right = rows.filter((r) => r.status === 'correct').length;
  return right / rows.length >= READY_SHARE;
}
