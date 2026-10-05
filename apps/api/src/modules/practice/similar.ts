// The end of the hint ladder (`ladder.ts`): a shown solution is followed straight away by a similar
// task (issue #388, report „Hilfe und Fragen beim Üben" §5.2 — Baker's "Scooter" and Shih's worked
// example: the solution is only worth something when she uses it at once, on a task of the same
// kind). Called where a practice question closes with its solution shown — the third miss or the
// end of the ladder (`answer.ts`) and "Lösung zeigen" (`setAside.ts`) — inside the same transaction.
//
// Code decides which task, never the model (CLAUDE.md rule 1): the same topic, the same form and the
// same subject, from her own questions. One already further down this run is brought forward;
// otherwise one of her other questions that is not in the run joins it, right behind. When there is
// none, the run stays as it is — nothing is written for it and nothing is claimed (rule 5).
//
// Not for every form: a word to know (another word is no "similar task", and the same pair the
// other way round would only repeat the answer just shown — vocabulary has its card pass), a
// sentence to say, a Diktat (her own runs, each) and a free text (it shows no solution, #197).

import type { Db } from '../../lib/db.js';
import { FREE_TEXT_KINDS } from './itemFields.js';

type Closed = {
  topic: string | null;
  kind: string;
  subject_id: string | null;
  prompt: string;
  position: number;
};

type Open = { item_id: string; position: number; topic: string | null; kind: string };

const sameTopic = (a: string | null, b: string) => a?.trim().toLowerCase() === b;

/** The forms a shown solution is not followed by a similar task on (see the header). */
const NO_SIMILAR = ['vocab', 'speak', 'spelling_dictation', ...FREE_TEXT_KINDS];

/**
 * Puts a task similar to the one just closed right after it, in a practice run. Returns the
 * question it put there, or null when the next one already is similar or there is none.
 */
export async function followWithSimilar(
  tx: Db,
  learnerId: string,
  sessionId: string,
  itemId: string,
): Promise<string | null> {
  const closed = await tx.maybeOne<Closed>(
    `select i.topic, i.kind, i.subject_id, i.prompt, si.position
       from session_items si join items i on i.id = si.item_id
      where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3`,
    [sessionId, itemId, learnerId],
  );
  const topic = closed?.topic?.trim().toLowerCase();
  if (!closed || !topic || NO_SIMILAR.includes(closed.kind)) return null;
  const open = await tx.query<Open>(
    `select si.item_id, si.position, i.topic, i.kind
       from session_items si join items i on i.id = si.item_id
      where si.session_id = $1 and si.status = 'open' and si.position > $2
      order by si.position`,
    [sessionId, closed.position],
  );
  const similar = (o: Open) => o.kind === closed.kind && sameTopic(o.topic, topic);
  if (open[0] && similar(open[0])) return null;
  const later = open.find(similar)?.item_id;
  const chosen = later ?? (await fromHerQuestions(tx, learnerId, sessionId, closed, topic));
  if (!chosen) return null;
  await placeNext(tx, sessionId, closed.position, chosen);
  return chosen;
}

/**
 * One of her questions not in this run, of the same topic, form and subject — never the same
 * words again, never a homework task (helped with, not drilled), a Kopfrechnen fact or a listening
 * question (each belongs to its own run), never an archived one. The one most due first, the order
 * the selection uses (`selection.ts`).
 */
async function fromHerQuestions(
  tx: Db,
  learnerId: string,
  sessionId: string,
  closed: Closed,
  topic: string,
): Promise<string | null> {
  const row = await tx.maybeOne<{ id: string }>(
    `select i.id from items i
       left join materials m on m.id = i.material_id
       left join item_states st on st.item_id = i.id
      where i.learner_id = $1 and i.archived_at is null and (m.id is null or m.archived_at is null)
        and lower(btrim(i.topic)) = $2 and i.kind = $3
        and i.subject_id is not distinct from $4::uuid
        and i.origin <> 'homework' and i.drill_fact is null and i.listen_task is null
        and lower(btrim(i.prompt)) <> lower(btrim($5))
        and not exists (select 1 from session_items si where si.session_id = $6 and si.item_id = i.id)
      order by st.due nulls first, i.created_at, i.seq
      limit 1`,
    [learnerId, topic, closed.kind, closed.subject_id, closed.prompt, sessionId],
  );
  return row?.id ?? null;
}

/**
 * The run's order with `itemId` right behind `after`. Positions are unique per run, so the ones
 * that move go out of the way first (negative), then take their new places.
 */
async function placeNext(tx: Db, sessionId: string, after: number, itemId: string): Promise<void> {
  const behind = await tx.query<{ item_id: string }>(
    `select item_id from session_items where session_id = $1 and position > $2 and item_id <> $3
      order by position`,
    [sessionId, after, itemId],
  );
  const inRun = await tx.maybeOne<{ item_id: string }>(
    `select item_id from session_items where session_id = $1 and item_id = $2`,
    [sessionId, itemId],
  );
  await tx.query(
    `update session_items set position = -position - 1 where session_id = $1 and position > $2`,
    [sessionId, after],
  );
  if (inRun) {
    await tx.query(
      `update session_items set position = $3 where session_id = $1 and item_id = $2`,
      [sessionId, itemId, after + 1],
    );
  } else {
    await tx.query(
      `insert into session_items (session_id, item_id, position) values ($1, $2, $3)`,
      [sessionId, itemId, after + 1],
    );
  }
  for (const [n, row] of behind.entries()) {
    await tx.query(
      `update session_items set position = $3 where session_id = $1 and item_id = $2`,
      [sessionId, row.item_id, after + 2 + n],
    );
  }
}
