// What the background check does when no model can decide: the safe, fixed fallbacks.
// Split from check.ts (#311); docs/architecture.md §Proactivity.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { dayLabel, t } from '../../i18n/index.js';
import { daysBetween, localParts, weekdayOf } from '../../lib/time.js';
import type { LearnerRow } from '../identity/model.js';
import { finishJob } from '../scheduler/jobs.js';
import { type CheckLease, LeaseLost } from './checkLease.js';
import type { Trigger } from './checkTrigger.js';
import { type BodyTemplate, planOutreach } from './delivery.js';
import { fillPractice } from './occasions.js';
import { bumpContext } from './plan.js';
import { contextProvider } from './provider.js';
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

      // Whether this fallback wrote anything a decision could depend on (K1, #663): only then is
      // the context a version further. A fallback that waits wrote a decision row and nothing
      // else, and bumping for it made every chat turn running meanwhile stale for nothing.
      let changed = false;
      const prepared = async (
        goalId: string | null,
        subjectId: string | null,
        title: string,
        materialId: string | null = null,
      ) => {
        const p = await preparedPractice(
          tx,
          learner.id,
          { goalId, subjectId, materialId, title },
          today,
          now,
        );
        if (p?.created) changed = true;
        return p;
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
            changed = true;
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
        // The sheet as the domain knows it (provider.ts).
        const m = await contextProvider().readySheet(tx, learner.id, trig.materialId);
        if (m && m.questions > 0) {
          // Her sheet's own practice, never another sheet's (issue #721).
          const p = await prepared(
            m.goalId,
            m.subjectId,
            m.title ?? t(learner.locale, 'practice.untitled'),
            trig.materialId,
          );
          // The line names what its start opens (issue #840): the practice's title and size, not
          // the sheet's question total ("14 Stück" above a card of 4).
          // One made here carries the sheet's title, or the untitled line says it without one.
          const title = p && !p.created ? p.title : m.title;
          const count = p?.count ?? m.questions;
          proposal = {
            kind: 'result',
            // Her photos: the result always reaches her, like any answer (audit M-61).
            origin: 'learner',
            template: null,
            topic: `material:${trig.materialId}`,
            body: title
              ? t(learner.locale, 'material.ready', { title, count })
              : t(learner.locale, 'material.ready_untitled', { count }),
            relevance: 0.7,
            goalId: m.goalId,
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
        // A message to show or to send: Buddy's state names it. One kept only as suppressed
        // changes nothing a decision reads — the same rule as `applyDecision`.
        if (outreach.id && outreach.status !== 'suppressed') changed = true;
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
      if (changed) await bumpContext(tx, learner.id);
      return {
        outcome: proposal ? 'fallback_act' : 'fallback_wait',
        outreach: outreach?.status ?? null,
      };
    });
    await finishJob(deps.db, trig.job, deps.now(), { status: 'done', result: result });
  }
}

/**
 * The practice a fixed line or her sheet's answer points at (issue #721): for a sheet, a waiting
 * practice that holds only that sheet's questions (the domain says which, `sheetPractice`) or one
 * made now from its questions — never another sheet's or a review of something else; otherwise
 * the waiting practice of the goal, or one made now from its pool. Null when there is nothing to
 * practise.
 */
export async function preparedPractice(
  tx: Db,
  learnerId: string,
  scope: {
    goalId: string | null;
    subjectId: string | null;
    materialId?: string | null;
    title: string;
  },
  today: string,
  now: Date,
): Promise<{
  stepId: string;
  title: string;
  count: number;
  minutes: number;
  created: boolean;
} | null> {
  const sheet = scope.materialId ?? null;
  const waiting = await tx.query<{
    id: string;
    title: string;
    payload: { item_ids?: string[]; est_minutes?: number };
  }>(
    `select id, title, payload from buddy_steps
      where learner_id = $1 and kind = 'practice' and state = 'prepared'
        and ($2::boolean or goal_id is not distinct from $3)
      order by created_at desc, seq desc`,
    [learnerId, sheet !== null, scope.goalId],
  );
  const own = sheet
    ? (
        await contextProvider().sheetPractice(
          tx,
          learnerId,
          sheet,
          waiting.map((w) => w.id),
        )
      ).only
    : null;
  const existing = waiting.find(
    (w) => (own === null || own.has(w.id)) && (w.payload.item_ids?.length ?? 0) > 0,
  );
  if (existing) {
    return {
      stepId: existing.id,
      title: existing.title,
      count: existing.payload.item_ids?.length ?? 0,
      minutes: existing.payload.est_minutes ?? 10,
      created: false,
    };
  }
  const { itemIds: items, minutes } = await fillPractice(
    tx,
    learnerId,
    { goalId: scope.goalId, subjectId: scope.subjectId, materialId: sheet },
    [],
    now,
  );
  if (items.length === 0) return null;
  const step = await tx.one<{ id: string }>(
    `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload, prepared_at)
     values ($1, $2, 'practice', $3, 'prepared', $4, $5, $6) returning id`,
    [
      learnerId,
      scope.goalId,
      scope.title,
      today,
      { item_ids: items, est_minutes: minutes, focus_topics: [], subject_id: scope.subjectId },
      now,
    ],
  );
  return { stepId: step.id, title: scope.title, count: items.length, minutes, created: true };
}
