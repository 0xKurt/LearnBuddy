// Answers the key learnt from a tutor's judgement, and taking them back (KI-Audit F16, #675).
//
// A model's `correct` on a short answer the rules did not know is added to `accepted_answers`
// (answerApply.ts) — after that the rules accept it without a model, on every later try. Each
// such answer has a row in `learned_answers`: the turn it was judged in and the tutor's prompt
// version, status provisional. When she says a judgement of the question was wrong, its key is
// suspect: the answers it learnt from a model go out of it again, the rows stay as `retracted`
// (nothing is deleted, rule 5).

import type { Db } from '../../lib/db.js';

/** Takes the answers the key of `itemId` learnt from a model back out of it; how many went. */
export async function retractLearned(
  tx: Db,
  learnerId: string,
  itemId: string,
  now: Date,
): Promise<number> {
  const gone = await tx.query<{ answer: string }>(
    `update learned_answers set status = 'retracted', retracted_at = $3
      where learner_id = $1 and item_id = $2 and status = 'provisional'
      returning answer`,
    [learnerId, itemId, now],
  );
  if (gone.length === 0) return 0;
  await tx.query(
    `update items set accepted_answers = array(
       select a from unnest(accepted_answers) a where not (a = any($3::text[])))
      where id = $1 and learner_id = $2`,
    [itemId, learnerId, gone.map((g) => g.answer)],
  );
  return gone.length;
}
