// Talk tools (issue #264): a talk planned as a goal with its steps, and the card that records a
// rehearsal or a read-aloud. The rules every tool keeps are written in tools.ts.

import { READ_ALOUD_WORDS, TalkStage } from '@learnbuddy/shared-types/contracts';

import { t } from '../../i18n/index.js';
import { daysBetween } from '../../lib/time.js';
import type { ActionOf } from './decision.js';
import { findOrCreateSubject } from './plan.js';
import { wordsOf } from './talkMeasure.js';
import {
  goalOf,
  requireQuote,
  resolveFutureDay,
  today,
  type ToolContext,
  type ToolOutcome,
  ToolRejection,
} from './toolKit.js';

/**
 * A talk with a day and the steps before it. The model names the stages and their days; code
 * resolves the days in her zone (rule 2) and refuses a plan that cannot be kept: a stage twice or
 * out of order, a step on or after the day of the talk, a later stage due before an earlier one.
 * The steps' titles are the app's own words, never the model's, so a plan reads the same in every
 * conversation. Reminders stay what they always are: opt-in (rule 6) — a step has a day, no time.
 */
export async function runPlanTalk(
  action: ActionOf<'plan_talk'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const due = resolveFutureDay(ctx, a.day, 'the talk');
  if (daysBetween(today(ctx), due) < 1) {
    throw new ToolRejection(
      'the talk is today, so there are no days left for steps — leave plan_talk out and offer a rehearsal (offer_rehearsal kind talk) instead',
    );
  }
  const order = TalkStage.options;
  let last = -1;
  let lastDate: string | null = null;
  const steps: Array<{ stage: TalkStage; date: string }> = [];
  for (const st of a.steps) {
    const at = order.indexOf(st.stage);
    if (at <= last) {
      throw new ToolRejection(
        `steps must be in the order ${order.join(' → ')}, each at most once — "${st.stage}" breaks it`,
      );
    }
    const date = resolveFutureDay(ctx, st.day, `the step "${st.stage}"`);
    if (daysBetween(date, due) < 1) {
      throw new ToolRejection(
        `the step "${st.stage}" would be on ${date}, but the talk is on ${due} — every step comes before the day of the talk`,
      );
    }
    if (lastDate && daysBetween(lastDate, date) < 0) {
      throw new ToolRejection(
        `the step "${st.stage}" would be on ${date}, before the step before it (${lastDate}) — each step comes on or after the one before`,
      );
    }
    last = at;
    lastDate = date;
    steps.push({ stage: st.stage, date });
  }
  const subject = await findOrCreateSubject(ctx.db, ctx.learnerId, a.subject, a.subject_kind);
  const duplicate = await ctx.db.maybeOne<{ title: string }>(
    `select title from buddy_goals
      where learner_id = $1 and kind = 'talk' and status = 'active' and subject_id = $2 and due_date = $3`,
    [ctx.learnerId, subject.id, due],
  );
  if (duplicate) {
    throw new ToolRejection(
      `an active talk "${duplicate.title}" already exists for this subject on ${due}; use update_goal instead`,
    );
  }
  const goal = await ctx.db.one<{ id: string }>(
    `insert into buddy_goals (learner_id, kind, title, subject_id, due_date, talk_minutes)
     values ($1, 'talk', $2, $3, $4, $5) returning id`,
    [ctx.learnerId, a.title, subject.id, due, a.minutes],
  );
  for (const st of steps) {
    await ctx.db.query(
      `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload)
       values ($1, $2, 'task', $3, 'planned', $4, $5)`,
      [
        ctx.learnerId,
        goal.id,
        t(ctx.locale, `talk.stage.${st.stage}`),
        st.date,
        { stage: st.stage },
      ],
    );
  }
  ctx.created.goalId = goal.id;
  return {
    summary: {
      tool: 'plan_talk',
      goal_id: goal.id,
      title: a.title,
      format: a.format,
      due_date: due,
      minutes: a.minutes,
      steps,
    },
    undo: { type: 'drop_goal', goal_id: goal.id },
  };
}

/**
 * The card that records her. It changes nothing: what she records is measured by
 * `POST /buddy/rehearsals`, which reads this action back — the passage to read and the talk it
 * belongs to come from here, never from the app.
 */
export async function runOfferRehearsal(
  action: ActionOf<'offer_rehearsal'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  if (a.kind === 'talk') {
    const goal = a.goal ? goalOf(ctx, a.goal) : null;
    if (goal && (goal.kind !== 'talk' || goal.status !== 'active')) {
      throw new ToolRejection(
        `${a.goal} is not a planned talk — a rehearsal belongs to a talk planned with plan_talk; use goal null for a talk that has no plan`,
      );
    }
    return {
      summary: {
        tool: 'offer_rehearsal',
        kind: 'talk',
        title: goal?.title ?? t(ctx.locale, 'talk.stage.rehearsal'),
        text: null,
        minutes: goal?.talk_minutes ?? null,
        goal_id: goal?.id ?? null,
      },
      undo: null,
    };
  }
  // Reading aloud needs a text to compare with, and one that fits two minutes.
  const text = (a.text ?? '').trim();
  const words = wordsOf(text);
  if (words.length < READ_ALOUD_WORDS.min || words.length > READ_ALOUD_WORDS.max) {
    throw new ToolRejection(
      `a text to read aloud must be the text itself, ${READ_ALOUD_WORDS.min}–${READ_ALOUD_WORDS.max} words — this one has ${words.length}. Put the passage itself in "text" (shorten it, or take a part of it).`,
    );
  }
  return {
    summary: {
      tool: 'offer_rehearsal',
      kind: 'read_aloud',
      title: `${words.slice(0, 6).join(' ')}${words.length > 6 ? ' …' : ''}`,
      text,
      minutes: null,
      goal_id: null,
    },
    undo: null,
  };
}
