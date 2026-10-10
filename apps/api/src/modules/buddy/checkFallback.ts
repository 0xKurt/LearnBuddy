// What the background check does when no model can decide: the safe, fixed fallbacks.
// Split from check.ts (#311); docs/architecture.md §Proactivity.

import type { Deps } from '../../deps.js';
import { dayLabel, t } from '../../i18n/index.js';
import { daysBetween, localParts, weekdayOf } from '../../lib/time.js';
import type { LearnerRow } from '../identity/model.js';
import { finishJob } from '../scheduler/jobs.js';
import { type CheckLease, LeaseLost } from './checkLease.js';
import type { Trigger } from './checkTrigger.js';
import { type BodyTemplate, planOutreach } from './delivery.js';
import { fillPractice } from './occasions.js';
import { bumpContext } from './plan.js';
import type { SettingsRow } from './state.js';

export async function fallback(
  deps: Deps,
  learner: LearnerRow,
  triggers: Trigger[],
  why: string,
  lease: CheckLease,
): Promise<void> {
  const now = deps.now();
  for (const trig of triggers) {
    const result = await deps.db.tx(async (tx) => {
      const settings = await tx.one<SettingsRow>(
        `select * from buddy_settings where learner_id = $1 for update`,
        [learner.id],
      );
      // Only while this worker still holds the learner: never a second fallback message.
      if (settings.check_lease_token !== lease.token) throw new LeaseLost();
      const tz = settings.timezone;
      const today = localParts(now, tz).date;
      const goal = trig.goalId
        ? await tx.maybeOne<{
            id: string;
            title: string;
            status: string;
            due_date: string | null;
            subject_id: string | null;
          }>(
            `select id, title, status, due_date, subject_id from buddy_goals where id = $1 and learner_id = $2`,
            [trig.goalId, learner.id],
          )
        : null;

      const prepared = async (goalId: string | null, subjectId: string | null, title: string) => {
        const existing = await tx.maybeOne<{
          id: string;
          payload: { item_ids?: string[]; est_minutes?: number };
        }>(
          `select id, payload from buddy_steps
            where learner_id = $1 and kind = 'practice' and state = 'prepared'
              and goal_id is not distinct from $2
            order by created_at desc, seq desc limit 1`,
          [learner.id, goalId],
        );
        if (existing?.payload.item_ids?.length) {
          return {
            stepId: existing.id,
            count: existing.payload.item_ids.length,
            minutes: existing.payload.est_minutes ?? 10,
          };
        }
        const { itemIds: items, minutes } = await fillPractice(
          tx,
          learner.id,
          { goalId, subjectId },
          [],
          now,
        );
        if (items.length === 0) return null;
        const step = await tx.one<{ id: string }>(
          `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload, prepared_at)
           values ($1, $2, 'practice', $3, 'prepared', $4, $5, $6) returning id`,
          [
            learner.id,
            goalId,
            title,
            today,
            { item_ids: items, est_minutes: minutes, focus_topics: [], subject_id: subjectId },
            now,
          ],
        );
        return { stepId: step.id, count: items.length, minutes };
      };

      let proposal: {
        kind: 'idea' | 'checkin' | 'result';
        origin: 'buddy' | 'learner';
        topic: string;
        body: string;
        template: BodyTemplate | null;
        relevance: number;
        goalId: string | null;
        stepId: string | null;
      } | null = null;
      if (trig.reason === 'exam_countdown' && goal?.status === 'active' && goal.due_date) {
        const inDays = daysBetween(today, goal.due_date);
        const day = dayLabel(learner.locale, weekdayOf(goal.due_date), inDays);
        const p = await prepared(goal.id, goal.subject_id, goal.title);
        if (p) {
          const params = { exam: goal.title, count: p.count, minutes: p.minutes };
          proposal = {
            kind: 'idea',
            origin: 'buddy',
            topic: `exam:${goal.id}:prep`,
            body: t(learner.locale, 'exam.prepared', { day, ...params }),
            // "Morgen" is rendered on the day it is read (audit M-60).
            template: { key: 'exam.prepared', params, due_date: goal.due_date },
            relevance: inDays <= 1 ? 0.85 : 0.7,
            goalId: goal.id,
            stepId: p.stepId,
          };
        } else {
          const open = await tx.maybeOne(
            `select 1 from buddy_steps where learner_id = $1 and kind = 'capture' and state = 'planned' and goal_id = $2`,
            [learner.id, goal.id],
          );
          if (!open) {
            await tx.query(
              `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date)
               values ($1, $2, 'capture', $3, 'planned', $4)`,
              [learner.id, goal.id, goal.title, today],
            );
          }
          proposal = {
            kind: 'idea',
            origin: 'buddy',
            topic: `exam:${goal.id}:material`,
            body: t(learner.locale, 'exam.need_material', { day, exam: goal.title }),
            template: {
              key: 'exam.need_material',
              params: { exam: goal.title },
              due_date: goal.due_date,
            },
            relevance: 0.7,
            goalId: goal.id,
            stepId: null,
          };
        }
      } else if (trig.reason === 'exam_followup' && goal?.status === 'active') {
        proposal = {
          kind: 'checkin',
          origin: 'buddy',
          topic: `exam:${goal.id}:followup`,
          body: t(learner.locale, 'exam.followup', { exam: goal.title }),
          template: null,
          relevance: 0.7,
          goalId: goal.id,
          stepId: null,
        };
      } else if (trig.reason === 'material_ready' && trig.materialId) {
        const m = await tx.maybeOne<{
          id: string;
          title: string | null;
          goal_id: string | null;
          subject_id: string | null;
          n: number;
        }>(
          `select m.id, m.title, m.goal_id, m.subject_id,
                  (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as n
             from materials m where m.id = $1 and m.learner_id = $2 and m.status = 'ready'
              and m.archived_at is null`,
          [trig.materialId, learner.id],
        );
        if (m && m.n > 0) {
          const p = await prepared(
            m.goal_id,
            m.subject_id,
            m.title ?? t(learner.locale, 'practice.untitled'),
          );
          proposal = {
            kind: 'result',
            // Her photos: the result always reaches her, like any answer (audit M-61).
            origin: 'learner',
            template: null,
            topic: `material:${m.id}`,
            body: m.title
              ? t(learner.locale, 'material.ready', { title: m.title, count: m.n })
              : t(learner.locale, 'material.ready_untitled', { count: m.n }),
            relevance: 0.7,
            goalId: m.goal_id,
            stepId: p?.stepId ?? null,
          };
        }
      } else if (trig.reason === 'checkin_requested') {
        // Buddy said "ich schaue nochmal vorbei": without the model it still keeps its word,
        // honestly (audit p2-F-journey-checkin-promise-dropped).
        proposal = {
          kind: 'checkin',
          origin: 'buddy',
          topic: `checkin:${trig.job.id}`,
          body: t(learner.locale, 'reminder.checkin_unavailable'),
          template: null,
          relevance: 0.7,
          goalId: null,
          stepId: null,
        };
      }

      let outreach = null;
      if (proposal) {
        outreach = await planOutreach(tx, {
          learnerId: learner.id,
          settings,
          now,
          decisionId: null,
          origin: proposal.origin,
          kind: proposal.kind,
          topicKey: proposal.topic,
          dedupeKey: `fallback:${proposal.topic}:${trig.job.id}`,
          title: t(learner.locale, 'title.buddy'),
          body: proposal.body,
          why: null,
          relevance: proposal.relevance,
          earliest: now,
          expiresAt: new Date(now.getTime() + 24 * 3_600_000),
          goalId: proposal.goalId,
          stepId: proposal.stepId,
          template: proposal.template,
        });
      }
      await tx.query(
        `insert into buddy_decisions (learner_id, mode, triggers, context_version, disposition, reason,
                                      prompt_version, created_at)
         values ($1, 'check', $2, $3, $4, $5, 'fallback.1', $6)`,
        [
          learner.id,
          JSON.stringify([{ reason: trig.reason, goal_id: trig.goalId }]),
          settings.context_version,
          proposal ? 'applied' : 'wait',
          `fallback (${why})`,
          now,
        ],
      );
      await bumpContext(tx, learner.id);
      return {
        outcome: proposal ? 'fallback_act' : 'fallback_wait',
        outreach: outreach?.status ?? null,
      };
    });
    await finishJob(deps.db, trig.job, deps.now(), { status: 'done', result: result });
  }
}
