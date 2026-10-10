// A reminder she agreed to, sent by code at the agreed time: no model decides it.
// Split from check.ts (#311); docs/architecture.md §Proactivity.

import type { Deps } from '../../deps.js';
import { t } from '../../i18n/index.js';
import type { LearnerRow } from '../identity/model.js';
import { finishJob } from '../scheduler/jobs.js';
import type { Trigger } from './checkTrigger.js';
import { planOutreach } from './delivery.js';
import { fillPractice } from './occasions.js';
import { bumpContext, rollRepeatingStep } from './plan.js';
import type { SettingsRow } from './state.js';

export async function sendAgreedReminder(
  deps: Deps,
  learner: LearnerRow,
  trig: Trigger,
): Promise<void> {
  const now = deps.now();
  const result = await deps.db.tx(async (tx) => {
    const settings = await tx.one<SettingsRow>(
      `select * from buddy_settings where learner_id = $1 for update`,
      [learner.id],
    );
    const step = trig.stepId
      ? await tx.maybeOne<{
          id: string;
          kind: 'practice' | 'capture';
          title: string;
          state: string;
          agreed: boolean;
          goal_id: string | null;
          version: number;
          planned_date: string | null;
          planned_time: string | null;
          repeat: 'daily' | 'weekdays' | 'weekly' | null;
          repeat_until: string | null;
          payload: {
            item_ids?: string[];
            est_minutes?: number;
            subject_id?: string | null;
            focus_topics?: string[];
          };
        }>(`select * from buddy_steps where id = $1 and learner_id = $2 for update`, [
          trig.stepId,
          learner.id,
        ])
      : null;
    if (!step || !step.agreed || !['planned', 'prepared'].includes(step.state)) {
      return { outcome: 'obsolete' };
    }
    let count = step.payload.item_ids?.length ?? 0;
    let minutes = step.payload.est_minutes ?? 0;
    // Practice for what she named — the test's material or the subject — and nothing else:
    // without either, the reminder only reminds (audit H-30), never "6 Aufgaben" from any subject.
    const subjectId = step.payload.subject_id ?? null;
    if (step.kind === 'practice' && count === 0 && (step.goal_id || subjectId)) {
      const filled = await fillPractice(
        tx,
        learner.id,
        { goalId: step.goal_id, subjectId },
        step.payload.focus_topics ?? [],
        now,
      );
      const items = filled.itemIds;
      if (items.length > 0) {
        count = items.length;
        minutes = filled.minutes;
        await tx.query(
          `update buddy_steps set state = 'prepared', prepared_at = $2, payload = payload || $3, version = version + 1
            where id = $1`,
          [step.id, now, { item_ids: items, est_minutes: minutes }],
        );
      }
    }
    const key =
      step.kind === 'capture'
        ? ('reminder.capture' as const)
        : count > 0
          ? ('reminder.practice_ready' as const)
          : ('reminder.practice' as const);
    const params = { title: step.title, count, minutes };
    const body = t(learner.locale, key, params);
    const plan = await planOutreach(tx, {
      learnerId: learner.id,
      settings,
      now,
      decisionId: null,
      origin: 'agreed',
      kind: 'reminder',
      topicKey: `step:${step.id}`,
      // Keyed by the reminder job (step and version when it was planned), not by the version
      // this handler bumps itself: a re-run never sends it twice (agreed-reminder-duplicate-on-rerun).
      dedupeKey: trig.job.dedupe_key.startsWith('step:')
        ? trig.job.dedupe_key
        : `step:${step.id}:v${step.version}`,
      title: t(learner.locale, 'title.buddy'),
      body,
      why: null,
      relevance: null,
      earliest: trig.job.run_at,
      expiresAt: new Date(trig.job.run_at.getTime() + 6 * 3_600_000),
      goalId: step.goal_id,
      stepId: step.id,
      // Rendered when shown: a reminder that arrives late says so (D-13).
      template: { key, params, agreed_at: trig.job.run_at.toISOString() },
    });
    // A standing arrangement moves on the moment its reminder has gone out, not when she
    // reacts (issue #112) — a day she ignores must not end the repetition silently.
    const nextDate = await rollRepeatingStep(tx, learner.id, step, settings, now);
    await bumpContext(tx, learner.id);
    return { outcome: plan.status, reason: plan.reason, next: nextDate };
  });
  await finishJob(deps.db, trig.job, now, { status: 'done', result: result });
}
