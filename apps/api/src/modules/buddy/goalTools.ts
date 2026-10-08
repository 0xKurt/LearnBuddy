// Goal tools: her school level, an exam to plan for, a goal changed or closed.
// Split from tools.ts (#311); the rules every tool keeps are written there.

import { type ActionOf, schoolYearsOf } from './decision.js';
import { cancelGoalWakeups, findOrCreateSubject, scheduleExamWakeups } from './plan.js';
import {
  quotedGoal,
  requireQuote,
  resolveFutureDay,
  type ToolContext,
  type ToolOutcome,
  ToolRejection,
} from './toolKit.js';

export async function runSetLevel(
  action: ActionOf<'set_level'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  // Code converts her school's own label into years of schooling (audit M-39).
  const fromLabel = a.level === 'school' && a.school_year ? schoolYearsOf(a.school_year) : null;
  if (a.level === 'school' && a.school_year && fromLabel === null) {
    throw new ToolRejection('that school year does not exist in that school system');
  }
  const grade = a.level === 'school' ? (fromLabel ?? a.grade) : null;
  const before = await ctx.db.one<{ level: string; grade: number | null }>(
    `select level, grade from learners where id = $1 for update`,
    [ctx.learnerId],
  );
  await ctx.db.query(
    `update learners set level = $2, grade = $3, version = version + 1 where id = $1`,
    [ctx.learnerId, a.level, grade],
  );
  return {
    summary: { tool: 'set_level', level: a.level, grade },
    undo: {
      type: 'restore_level',
      level: before.level,
      grade: before.grade,
      expect_level: a.level,
      expect_grade: grade,
    },
  };
}

export async function runPlanExam(
  action: ActionOf<'plan_exam'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const due = resolveFutureDay(ctx, a.day, 'the test');
  const subject = await findOrCreateSubject(ctx.db, ctx.learnerId, a.subject, a.subject_kind);
  const duplicate = await ctx.db.maybeOne<{ id: string; title: string }>(
    `select id, title from buddy_goals
      where learner_id = $1 and kind = 'exam' and status = 'active' and subject_id = $2 and due_date = $3`,
    [ctx.learnerId, subject.id, due],
  );
  if (duplicate) {
    throw new ToolRejection(
      `an active test "${duplicate.title}" already exists for this subject on ${due}; use update_goal instead`,
    );
  }
  const goal = await ctx.db.one<{ id: string }>(
    `insert into buddy_goals (learner_id, kind, title, subject_id, due_date, topics)
     values ($1, 'exam', $2, $3, $4, $5) returning id`,
    [ctx.learnerId, a.title, subject.id, due, a.topics],
  );
  await scheduleExamWakeups(ctx.db, ctx.learnerId, goal.id, due, ctx.settings, ctx.now);
  ctx.created.goalId = goal.id;
  return {
    summary: {
      tool: 'plan_exam',
      goal_id: goal.id,
      title: a.title,
      due_date: due,
      subject_name: subject.name,
    },
    undo: { type: 'drop_goal', goal_id: goal.id },
  };
}

export async function runUpdateGoal(
  action: ActionOf<'update_goal'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  const g = await quotedGoal(ctx, a);
  if (g.status !== 'active') throw new ToolRejection(`goal ${a.goal} is not active`);
  const due = a.day ? resolveFutureDay(ctx, a.day, 'the new date') : g.due_date;
  const title = a.title ?? g.title;
  const topics = a.topics ?? g.topics;
  await ctx.db.query(
    `update buddy_goals set title = $2, due_date = $3, topics = $4, version = version + 1 where id = $1`,
    [g.id, title, due, topics],
  );
  if (due && due !== g.due_date && g.kind === 'exam') {
    await scheduleExamWakeups(ctx.db, ctx.learnerId, g.id, due, ctx.settings, ctx.now);
  }
  return {
    summary: { tool: 'update_goal', goal_id: g.id, title, due_date: due },
    undo: {
      type: 'restore_goal',
      goal_id: g.id,
      title: g.title,
      due_date: g.due_date,
      topics: g.topics,
      status: g.status,
      outcome: g.outcome,
      expect_version: g.version + 1,
    },
  };
}

export async function runCloseGoal(
  action: ActionOf<'close_goal'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  const g = await quotedGoal(ctx, a);
  if (g.status !== 'active')
    throw new ToolRejection(
      `goal ${a.goal} is already closed — leave this action out and just say so`,
    );
  await ctx.db.query(
    `update buddy_goals set status = $2, outcome = $3, closed_at = $4, version = version + 1 where id = $1`,
    [g.id, a.status, a.outcome, ctx.now],
  );
  const open = await ctx.db.query<{ id: string; state: string; version: number }>(
    `select id, state, version from buddy_steps
      where goal_id = $1 and state in ('planned','prepared') for update`,
    [g.id],
  );
  await ctx.db.query(
    `update buddy_steps set state = 'cancelled', version = version + 1, finished_at = $2
      where id = any($1::uuid[])`,
    [open.map((st) => st.id), ctx.now],
  );
  await cancelGoalWakeups(ctx.db, ctx.learnerId, g.id);
  return {
    summary: {
      tool: 'close_goal',
      goal_id: g.id,
      title: g.title,
      status: a.status,
      outcome: a.outcome,
    },
    undo: {
      type: 'restore_goal',
      goal_id: g.id,
      title: g.title,
      due_date: g.due_date,
      topics: g.topics,
      status: 'active',
      outcome: null,
      expect_version: g.version + 1,
      steps: open.map((st) => ({ id: st.id, state: st.state, expect_version: st.version + 1 })),
    },
  };
}
