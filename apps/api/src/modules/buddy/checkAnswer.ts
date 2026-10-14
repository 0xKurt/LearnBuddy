// Her own sheet is always answered (issue #721; docs/architecture.md §Material, §Proactivity).
//
// The check her sheet's reading wakes is the model's to decide — and on the phone it decided to
// wait: "Ich mache aus deinem Blatt gerade Übungen …" for half a minute, then nothing, while the
// sheet lay in her library with seven tasks. Another time only the fixed line came, with no way to
// start. Whether she hears back about her photo is not a choice (CLAUDE.md rules 1 and 5): after
// the check, code looks at what it said in answer to her and closes the gap —
//
//   · nothing was said (it waited, prepared practice without a word, or what it said was held
//     back): the fixed answer for her sheet (`fallback`, the line with the practice it prepares);
//   · something was said but it has no start: the practice waiting for her (or made now) becomes
//     the start of that line, so the words have the card they announce.
//
// What was said is read from the rows the check wrote, never from its words.

import type { Deps } from '../../deps.js';
import { t } from '../../i18n/index.js';
import { localParts } from '../../lib/time.js';
import type { LearnerRow } from '../identity/model.js';
import { fallback, preparedPractice } from './checkFallback.js';
import { type CheckLease, LeaseLost } from './checkLease.js';
import type { Trigger } from './checkTrigger.js';
import { bumpContext } from './plan.js';
import { contextProvider } from './provider.js';

/** After the check: every sheet of hers it was woken for has a line, and the line its start. */
export async function answerHerSheets(
  deps: Deps,
  learner: LearnerRow,
  triggers: readonly Trigger[],
  lease: CheckLease,
  since: Date,
): Promise<'answered' | 'fallback' | 'start_attached' | 'none'> {
  const sheets = triggers.filter((t) => t.reason === 'material_ready' && t.materialId);
  if (sheets.length === 0) return 'none';
  // What the check said in answer to her since it began (her own action's answer: origin learner).
  const said = await deps.db.maybeOne<{ id: string; has_start: boolean }>(
    `select o.id,
            (exists (select 1 from buddy_steps s
                      where s.id = o.step_id and s.learner_id = $1
                        and s.kind = 'practice' and s.state = 'prepared')
             or exists (select 1 from buddy_actions a
                          join buddy_steps s on s.id = (a.result ->> 'step_id')::uuid
                         where a.learner_id = $1 and a.decision_id = o.decision_id
                           and a.tool = 'prepare_practice' and a.status = 'applied'
                           and s.kind = 'practice' and s.state = 'prepared')) as has_start
       from buddy_outreach o
      where o.learner_id = $1 and o.origin = 'learner' and o.status <> 'suppressed'
        and o.created_at >= $2
      order by o.created_at desc, o.seq desc
      limit 1`,
    [learner.id, since],
  );
  if (!said) {
    await fallback(deps, learner, sheets, 'unanswered', lease);
    return 'fallback';
  }
  if (said.has_start) return 'answered';
  const attached = await deps.db.tx(async (tx) => {
    const settings = await tx.one<{ check_lease_token: string | null; timezone: string }>(
      `select check_lease_token, timezone from buddy_settings where learner_id = $1 for update`,
      [learner.id],
    );
    if (settings.check_lease_token !== lease.token) throw new LeaseLost();
    const now = deps.now();
    const sheet = await contextProvider().readySheet(tx, learner.id, sheets[0]!.materialId!);
    if (!sheet || sheet.questions === 0) return false;
    const p = await preparedPractice(
      tx,
      learner.id,
      {
        goalId: sheet.goalId,
        subjectId: sheet.subjectId,
        title: sheet.title ?? t(learner.locale, 'practice.untitled'),
      },
      localParts(now, settings.timezone).date,
      now,
    );
    if (!p) return false;
    await tx.query(`update buddy_outreach set step_id = $2 where id = $1 and step_id is null`, [
      said.id,
      p.stepId,
    ]);
    // A prepared practice is something the next decision sees (CLAUDE.md rule 4).
    await bumpContext(tx, learner.id);
    return true;
  });
  return attached ? 'start_attached' : 'answered';
}
