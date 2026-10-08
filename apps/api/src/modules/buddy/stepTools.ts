// Step tools: a practice step planned, moved or marked done, with its reminder.
// Split from tools.ts (#311); the rules every tool keeps are written there.

import {
  addDays,
  inWindow,
  localParts,
  minutesOf,
  resolveLocalDateTime,
  weekdayOf,
  zonedToInstant,
} from '../../lib/time.js';
import type { ActionOf } from './decision.js';
import { rollRepeatingStep, scheduleStepReminder } from './plan.js';
import {
  currentStep,
  requireQuote,
  resolveEnd,
  resolveFutureDay,
  subjectOf,
  targetGoal,
  type ToolContext,
  type ToolOutcome,
  ToolRejection,
  type UndoSpec,
} from './toolKit.js';

/**
 * The first day a rhythm should run when she named none (issue #112): today if its time is
 * still ahead and the day fits the rhythm, otherwise the next day that does. "weekly" without
 * a named weekday starts on the first day that works and keeps that weekday from then on.
 */
function firstDayOfRhythm(
  ctx: ToolContext,
  repeat: 'daily' | 'weekdays' | 'weekly',
  time: string,
): string {
  const now = localParts(ctx.now, ctx.settings.timezone);
  const fits = (date: string) => repeat !== 'weekdays' || ![6, 7].includes(weekdayOf(date));
  let date = now.date;
  if (minutesOf(time) <= minutesOf(now.time)) date = addDays(date, 1);
  // At most a week: every rhythm here has a day inside any seven.
  for (let i = 0; i < 7 && !fits(date); i++) date = addDays(date, 1);
  return date;
}

export async function runPlanStep(
  action: ActionOf<'plan_step'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  if (a.agreed) requireQuote(ctx, a.quote);
  if (a.agreed && ctx.mode !== 'turn') throw new ToolRejection('agreed reminders need the learner');
  const goal = a.goal ? await targetGoal(ctx, a.goal) : null;
  // "In an hour": the server does the arithmetic against its own clock, so a miscounted
  // HH:MM can no longer reach the learner as an agreed time (issue #112, rule 2). The day
  // comes out of the same calculation — an hour before midnight lands tomorrow.
  const relative = a.in_minutes ? new Date(ctx.now.getTime() + a.in_minutes * 60_000) : null;
  if (relative && a.time) {
    throw new ToolRejection('use either in_minutes or a time, not both');
  }
  const local = relative ? localParts(relative, ctx.settings.timezone) : null;
  // A rhythm usually comes without a first day — "immer an Schultagen um halb vier" says when
  // it repeats, not when it starts. The server works that day out (rule 2: the model never
  // writes dates), instead of rejecting the action and leaving the learner with an error
  // (issue #112, seen live in buddy.35).
  const rhythmStart =
    !local && a.repeat && a.repeat !== 'never' && a.day.kind === 'unknown' && a.time
      ? firstDayOfRhythm(ctx, a.repeat, a.time)
      : null;
  const date = local ? local.date : (rhythmStart ?? resolveFutureDay(ctx, a.day, 'this step'));
  let at: Date | null = relative;
  if (local && inWindow(minutesOf(local.time), ctx.settings.quiet_start, ctx.settings.quiet_end)) {
    throw new ToolRejection(
      `in ${a.in_minutes} minutes falls into the quiet hours (${ctx.settings.quiet_start}–${ctx.settings.quiet_end}); suggest another time`,
    );
  }
  if (a.time) {
    const r = resolveLocalDateTime(date, a.time, ctx.settings.timezone, 'reject');
    if (!r.ok) {
      throw new ToolRejection(
        `${date} ${a.time} ${r.error === 'nonexistent_time' ? 'does not exist' : 'exists twice'} (clock change) — ask for another time`,
      );
    }
    at = r.instant;
    if (at.getTime() <= ctx.now.getTime())
      throw new ToolRejection(`${date} ${a.time} is already over`);
    if (inWindow(minutesOf(a.time), ctx.settings.quiet_start, ctx.settings.quiet_end)) {
      throw new ToolRejection(
        `${a.time} is inside the quiet hours (${ctx.settings.quiet_start}–${ctx.settings.quiet_end}); suggest another time`,
      );
    }
  }
  // What the practice is about, as she named it (audit H-30): the reminder prepares
  // questions from this subject (or the goal's material) and nothing else.
  const subjectId = subjectOf(ctx, a.subject);
  // An agreed reminder is always scheduled, never silently dropped (audit M-58): without a
  // time it goes at her preferred start — unless that is already over today.
  const when = a.agreed
    ? (at ?? zonedToInstant(date, ctx.settings.preferred_start, ctx.settings.timezone))
    : null;
  if (when && when.getTime() <= ctx.now.getTime()) {
    throw new ToolRejection(
      `the usual reminder time (${ctx.settings.preferred_start}) is already over on ${date} — ask the learner for a time`,
    );
  }
  // A standing arrangement, not a suggestion repeated behind her back (issue #112).
  const repeat = a.repeat === 'never' ? null : a.repeat;
  const plannedTime = a.time ?? local?.time ?? null;
  if (repeat && !(a.agreed && plannedTime)) {
    throw new ToolRejection(
      'a repeating reminder needs her agreement and a time — ask her when it should come',
    );
  }
  // resolveUntil returns the exclusive bound (midnight after the last day), so the last day
  // it may still fire is the day before it — otherwise "bis Freitag" would run through Saturday.
  const repeatUntil =
    repeat && a.repeat_until
      ? addDays(
          localParts(resolveEnd(ctx, a.repeat_until, 'the repetition'), ctx.settings.timezone).date,
          -1,
        )
      : null;
  if (repeatUntil && repeatUntil < date) {
    throw new ToolRejection(`the repetition would end (${repeatUntil}) before its first day`);
  }
  const step = await ctx.db.one<{ id: string; version: number }>(
    `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, planned_time, agreed,
                              payload, repeat, repeat_until)
     values ($1, $2, $3, $4, 'planned', $5, $6, $7, $8, $9, $10) returning id, version`,
    [
      ctx.learnerId,
      goal?.id ?? null,
      a.kind,
      a.title,
      date,
      // A relative wish has its clock time too — the server just worked it out (#112).
      plannedTime,
      a.agreed,
      { subject_id: subjectId, focus_topics: a.focus_topics ?? [] },
      repeat,
      repeatUntil,
    ],
  );
  ctx.created.stepId = step.id;
  if (when) await scheduleStepReminder(ctx.db, ctx.learnerId, step, when);
  return {
    summary: {
      tool: 'plan_step',
      step_id: step.id,
      title: a.title,
      date,
      // The resolved time, so the card shows what was really agreed — not null because
      // she said it relative (issue #112).
      time: plannedTime,
      agreed: a.agreed,
      repeat,
      repeat_until: repeatUntil,
    },
    undo: { type: 'cancel_step', step_id: step.id },
  };
}

export async function runUpdateStep(
  action: ActionOf<'update_step'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const s = await currentStep(ctx, a.step);
  if (!['planned', 'prepared'].includes(s.state)) {
    throw new ToolRejection(
      `step ${a.step} is ${s.state} and cannot be changed — leave this action out and tell her how it stands`,
    );
  }
  let undo: UndoSpec = {
    type: 'restore_step',
    step_id: s.id,
    state: s.state,
    planned_date: s.planned_date,
    planned_time: s.planned_time,
    done_source: s.done_source,
    expect_version: s.version + 1,
  };
  if (a.state && (a.day || a.time)) {
    // Never report a move that was not made (update-step-state-drops-move).
    throw new ToolRejection(
      `a ${a.state} step is not moved — change either its state or its day/time`,
    );
  }
  // "nicht mehr jeden Tag" (issue #112). Ending a repetition leaves the next one standing —
  // she asked for fewer reminders, not for the one tomorrow to vanish unannounced.
  const changesRepeat = a.repeat !== null && a.repeat !== undefined;
  // The undo of a combined change has to put the rhythm back too, not only the day
  // (external audit F7, issue #152).
  if (changesRepeat) undo = { ...undo, repeat: s.repeat, repeat_until: s.repeat_until };
  if (changesRepeat) {
    const repeat = a.repeat === 'never' ? null : a.repeat;
    if (repeat && !(s.agreed && (a.time ?? s.planned_time))) {
      throw new ToolRejection(
        'a repeating reminder needs her agreement and a time — ask her when it should come',
      );
    }
    // Exactly ONE version bump per mutation (issue #152): the undo below expects
    // `version + 1`, and a repeat-only change used not to bump at all — so an undo right
    // after it answered 409 `changed_since`. When the day or the state changes in the same
    // action, their own statement carries the single bump.
    const onlyRepeat = !a.state && !a.day && !a.time;
    await ctx.db.query(
      `update buddy_steps set repeat = $2,
                              repeat_until = case when $2::text is null then null else repeat_until end,
                              version = case when $4 then version + 1 else version end
        where id = $1 and learner_id = $3`,
      [s.id, repeat, ctx.learnerId, onlyRepeat],
    );
    if (onlyRepeat) {
      return {
        summary: {
          tool: 'update_step',
          step_id: s.id,
          title: s.title,
          date: s.planned_date,
          time: s.planned_time,
          state: s.state,
        },
        undo,
      };
    }
  }
  if (a.state) {
    await ctx.db.query(
      `update buddy_steps set state = $2, version = version + 1, finished_at = $3 where id = $1`,
      [s.id, a.state, ctx.now],
    );
    await ctx.db.query(
      `update jobs set status = 'cancelled'
        where learner_id = $1 and kind = 'buddy_check' and status = 'queued' and payload ->> 'step_id' = $2`,
      [ctx.learnerId, s.id],
    );
    return {
      summary: {
        tool: 'update_step',
        step_id: s.id,
        title: s.title,
        date: s.planned_date,
        time: s.planned_time,
        state: a.state,
      },
      undo,
    };
  }
  const date = a.day ? resolveFutureDay(ctx, a.day, 'the step') : s.planned_date;
  const time = a.time ?? s.planned_time;
  if (!date) throw new ToolRejection('nothing to change: give a day, a time or a state');
  let at: Date | null = null;
  if (time) {
    const r = resolveLocalDateTime(date, time, ctx.settings.timezone, 'reject');
    if (!r.ok)
      throw new ToolRejection(
        `${date} ${time} is ambiguous or missing on the clock change — ask again`,
      );
    at = r.instant;
    if (inWindow(minutesOf(time), ctx.settings.quiet_start, ctx.settings.quiet_end)) {
      throw new ToolRejection(`${time} is inside the quiet hours; suggest another time`);
    }
  }
  const updated = await ctx.db.one<{ id: string; version: number }>(
    `update buddy_steps set planned_date = $2, planned_time = $3, version = version + 1
      where id = $1 returning id, version`,
    [s.id, date, time],
  );
  if (s.agreed) {
    const when = at ?? zonedToInstant(date, ctx.settings.preferred_start, ctx.settings.timezone);
    // Moving an agreed reminder into the past would drop it silently (audit M-58).
    if (when.getTime() <= ctx.now.getTime())
      throw new ToolRejection(
        `${date} ${time ?? ctx.settings.preferred_start} is already over — ask for a time`,
      );
    await scheduleStepReminder(ctx.db, ctx.learnerId, updated, when);
  }
  return {
    summary: { tool: 'update_step', step_id: s.id, title: s.title, date, time, state: s.state },
    undo,
  };
}

export async function runMarkStepDone(
  action: ActionOf<'mark_step_done'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const s = await currentStep(ctx, a.step);
  if (!['planned', 'prepared', 'in_progress'].includes(s.state)) {
    throw new ToolRejection(
      `step ${a.step} is already ${s.state} — leave this action out and just say so`,
    );
  }
  await ctx.db.query(
    `update buddy_steps set state = 'done', done_source = 'learner_reported', finished_at = $2,
                            version = version + 1 where id = $1`,
    [s.id, ctx.now],
  );
  await ctx.db.query(
    `update jobs set status = 'cancelled'
      where learner_id = $1 and kind = 'buddy_check' and status = 'queued' and payload ->> 'step_id' = $2`,
    [ctx.learnerId, s.id],
  );
  // On a standing arrangement "done" means done for today: the next one is set up again, so
  // saying she practised never quietly ends the repetition (issue #112).
  await rollRepeatingStep(ctx.db, ctx.learnerId, s, ctx.settings, ctx.now);
  return {
    summary: { tool: 'mark_step_done', step_id: s.id, title: s.title },
    undo: {
      type: 'restore_step',
      step_id: s.id,
      state: s.state,
      planned_date: s.planned_date,
      planned_time: s.planned_time,
      done_source: s.done_source,
      expect_version: s.version + 1,
    },
  };
}
