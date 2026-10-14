// Her own sheet is always answered (issue #721; docs/architecture.md §Material, §Proactivity).
//
// The check her sheet's reading wakes is the model's to decide — and on the phone it decided to
// wait: "Ich mache aus deinem Blatt gerade Übungen …" for half a minute, then nothing, while the
// sheet lay in her library with seven tasks. Another time only the fixed line came, with no way to
// start. Whether she hears back about her photo is not a choice (CLAUDE.md rules 1 and 5): after
// the check, code looks, sheet by sheet, at what it said about that sheet and closes the gap —
//
//   · nothing was said about it (it waited, prepared practice without a word, spoke of something
//     else, or what it said was held back): the fixed answer for that sheet (`fallback`, the line
//     with practice from that sheet);
//   · something was said about it but without a start of that sheet's practice: the sheet's
//     practice (waiting, or made now from its questions) becomes the start of that line.
//
// What was said is read from the rows the check wrote, never from its words: an outreach of
// origin `learner` since the check began that names the sheet in its topic (`material:<id>` from
// the fallback, the model's sheet alias resolved by `canonicalTopicKey`), or whose start — its
// step, or practice its decision prepared — holds the sheet's questions (the domain says which).

import type { Deps } from '../../deps.js';
import { t } from '../../i18n/index.js';
import { localParts } from '../../lib/time.js';
import type { LearnerRow } from '../identity/model.js';
import { fallback, preparedPractice } from './checkFallback.js';
import { type CheckLease, LeaseLost } from './checkLease.js';
import type { Trigger } from './checkTrigger.js';
import { bumpContext } from './plan.js';
import { contextProvider } from './provider.js';

type Outcome = 'answered' | 'fallback' | 'start_attached';

type Said = { id: string; topic_key: string; starts: string[] };

/** After the check: every sheet of hers it was woken for has a line, and the line its start. */
export async function answerHerSheets(
  deps: Deps,
  learner: LearnerRow,
  triggers: readonly Trigger[],
  lease: CheckLease,
  since: Date,
): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const trig of triggers) {
    if (trig.reason !== 'material_ready' || !trig.materialId) continue;
    out.push(await answerSheet(deps, learner, trig, trig.materialId, lease, since));
  }
  return out;
}

async function answerSheet(
  deps: Deps,
  learner: LearnerRow,
  trig: Trigger,
  materialId: string,
  lease: CheckLease,
  since: Date,
): Promise<Outcome> {
  // What the check said in answer to her since it began, each with the practice it starts.
  const said = await deps.db.query<Said>(
    `select o.id, o.topic_key,
            array_remove(array[o.step_id] || coalesce(array(
              select (a.result ->> 'step_id')::uuid from buddy_actions a
               where a.learner_id = $1 and a.decision_id = o.decision_id
                 and a.tool = 'prepare_practice' and a.status = 'applied'), '{}'), null)::text[]
              as starts
       from buddy_outreach o
      where o.learner_id = $1 and o.origin = 'learner' and o.status <> 'suppressed'
        and o.created_at >= $2
      order by o.created_at desc, o.seq desc`,
    [learner.id, since],
  );
  const own = await contextProvider().sheetPractice(
    deps.db,
    learner.id,
    materialId,
    said.flatMap((s) => s.starts),
  );
  const started = said.find((s) => s.starts.some((id) => own.some.has(id)));
  if (started) return 'answered';
  const named = said.find((s) => s.topic_key.includes(materialId));
  if (!named) {
    await fallback(deps, learner, [trig], 'unanswered', lease);
    return 'fallback';
  }
  const attached = await deps.db.tx(async (tx) => {
    const settings = await tx.one<{ check_lease_token: string | null; timezone: string }>(
      `select check_lease_token, timezone from buddy_settings where learner_id = $1 for update`,
      [learner.id],
    );
    if (settings.check_lease_token !== lease.token) throw new LeaseLost();
    const now = deps.now();
    const sheet = await contextProvider().readySheet(tx, learner.id, materialId);
    if (!sheet || sheet.questions === 0) return false;
    const p = await preparedPractice(
      tx,
      learner.id,
      {
        goalId: sheet.goalId,
        subjectId: sheet.subjectId,
        materialId,
        title: sheet.title ?? t(learner.locale, 'practice.untitled'),
      },
      localParts(now, settings.timezone).date,
      now,
    );
    if (!p) return false;
    await tx.query(`update buddy_outreach set step_id = $2 where id = $1`, [named.id, p.stepId]);
    // A prepared practice is something the next decision sees (CLAUDE.md rule 4).
    await bumpContext(tx, learner.id);
    return true;
  });
  return attached ? 'start_attached' : 'answered';
}
