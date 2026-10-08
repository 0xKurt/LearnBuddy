// Settings tools: contact outside the app (only ever reduced), Buddy's voice, a check later.
// Split from tools.ts (#311); the rules every tool keeps are written there.

import {
  VOICE_NAMES,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  type VoiceName,
} from '@learnbuddy/shared-types/contracts';
import { inWindow, minutesOf, resolveLocalDateTime, zonedToInstant } from '../../lib/time.js';
import { enqueueJob } from '../scheduler/jobs.js';
import type { ActionOf } from './decision.js';
import {
  requireQuote,
  resolveEnd,
  resolveFutureDay,
  type ToolContext,
  type ToolOutcome,
  ToolRejection,
} from './toolKit.js';

export async function runSetContact(
  action: ActionOf<'set_contact'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const s = ctx.settings;
  const quietStart = a.quiet_start ?? s.quiet_start;
  // The morning end moves too (issue #114): "mornings not before nine" is LESS contact, and
  // ADR 0006 lets Buddy do that. Which end moved does not matter — the rule is the same for
  // both: every minute that was quiet stays quiet.
  const quietEnd = a.quiet_end ?? s.quiet_end;
  for (let m = 0; m < 1440; m++) {
    if (inWindow(m, s.quiet_start, s.quiet_end) && !inWindow(m, quietStart, quietEnd)) {
      throw new ToolRejection(
        `quiet hours can only grow (now ${s.quiet_start}–${s.quiet_end}): a later start or an earlier end means more contact`,
      );
    }
  }
  let preferredStart = a.preferred_start ?? s.preferred_start;
  let preferredEnd = a.preferred_end ?? s.preferred_end;
  // The preferred window starts where the quiet hours end.
  if (minutesOf(preferredStart) < minutesOf(quietEnd)) preferredStart = quietEnd;
  // The preferred window ends where the quiet hours begin.
  if (
    minutesOf(quietStart) > minutesOf(quietEnd) &&
    minutesOf(preferredEnd) > minutesOf(quietStart)
  ) {
    preferredEnd = quietStart;
  }
  if (minutesOf(preferredStart) >= minutesOf(preferredEnd)) {
    throw new ToolRejection('the preferred window must start before it ends');
  }
  const avoid = a.avoid_weekdays ? [...new Set(a.avoid_weekdays)].sort() : s.avoid_weekdays;
  if (s.avoid_weekdays.some((d) => !avoid.includes(d))) {
    throw new ToolRejection(
      'removing days without messages means more contact — only the learner or an adult can do that in the settings',
    );
  }
  let pausedUntil = s.paused_until;
  if (a.pause) {
    const until = resolveEnd(ctx, a.pause, 'the pause');
    if (!pausedUntil || until.getTime() > pausedUntil.getTime()) pausedUntil = until;
  }
  await ctx.db.query(
    `update buddy_settings
        set preferred_start = $2, preferred_end = $3, avoid_weekdays = $4, paused_until = $5,
            quiet_start = $6, quiet_end = $7, version = version + 1
      where learner_id = $1`,
    [ctx.learnerId, preferredStart, preferredEnd, avoid, pausedUntil, quietStart, quietEnd],
  );
  if (pausedUntil && pausedUntil.getTime() > ctx.now.getTime()) {
    // Nothing Buddy queued on its own during a pause is sent afterwards (no backlog); an
    // agreed reminder stays and waits in the app at its time (D-13).
    await ctx.db.query(
      `update buddy_outreach set status = 'cancelled', status_reason = 'paused'
        where learner_id = $1 and status = 'scheduled' and origin = 'buddy'`,
      [ctx.learnerId],
    );
  }
  return {
    summary: {
      tool: 'set_contact',
      preferred_start: preferredStart,
      preferred_end: preferredEnd,
      avoid_weekdays: avoid,
      paused_until: pausedUntil ? pausedUntil.toISOString() : null,
      quiet_start: quietStart,
      quiet_end: quietEnd,
    },
    undo: {
      type: 'restore_settings',
      quiet_start: s.quiet_start,
      quiet_end: s.quiet_end,
      preferred_start: s.preferred_start,
      preferred_end: s.preferred_end,
      avoid_weekdays: s.avoid_weekdays,
      paused_until: s.paused_until ? s.paused_until.toISOString() : null,
      expect_version: s.version + 1,
    },
  };
}

/**
 * Buddy's voice as she asked for it (ADR 0008). Code decides the step: "slower" is one step
 * down from where it is, "other" the next voice of the curated set; the limits are enforced
 * here, and a request that changes nothing is sent back to the model to say so.
 */
export async function runSetVoice(
  action: ActionOf<'set_voice'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  if (a.speed === null && a.voice === null) {
    throw new ToolRejection('set_voice needs speed or voice');
  }
  const s = ctx.settings;
  let speed = s.voice_speed;
  if (a.speed === 'slower') {
    if (speed <= VOICE_SPEED_MIN)
      throw new ToolRejection(
        'the voice is already as slow as it goes — tell her so, change nothing',
      );
    speed -= 1;
  } else if (a.speed === 'faster') {
    if (speed >= VOICE_SPEED_MAX)
      throw new ToolRejection(
        'the voice is already as fast as it goes — tell her so, change nothing',
      );
    speed += 1;
  } else if (a.speed === 'normal') {
    speed = 0;
  }
  let voice: VoiceName = s.voice;
  if (a.voice === 'other') {
    voice = VOICE_NAMES[(VOICE_NAMES.indexOf(s.voice) + 1) % VOICE_NAMES.length]!;
  } else if (a.voice !== null) {
    voice = a.voice;
  }
  if (voice === s.voice && speed === s.voice_speed) {
    throw new ToolRejection('that is already how you sound — change nothing and say so');
  }
  await ctx.db.query(
    `update buddy_settings set voice = $2, voice_speed = $3, version = version + 1
      where learner_id = $1`,
    [ctx.learnerId, voice, speed],
  );
  return {
    summary: { tool: 'set_voice', voice, speed },
    undo: {
      type: 'restore_voice',
      voice: s.voice,
      speed: s.voice_speed,
      expect_version: s.version + 1,
    },
  };
}

export async function runScheduleCheck(
  action: ActionOf<'schedule_check'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  const date = resolveFutureDay(ctx, a.day, 'the check');
  // A time the model named is rejected on a clock change, never guessed (CLAUDE.md rule 2,
  // audit schedule-check-compatible-dst); the preferred start is the system's own choice.
  let at: Date;
  if (a.time) {
    const r = resolveLocalDateTime(date, a.time, ctx.settings.timezone, 'reject');
    if (!r.ok) {
      throw new ToolRejection(
        `${date} ${a.time} ${r.error === 'nonexistent_time' ? 'does not exist' : 'exists twice'} (clock change) — pick another time`,
      );
    }
    at = r.instant;
  } else {
    at = zonedToInstant(date, ctx.settings.preferred_start, ctx.settings.timezone);
  }
  const minAt = ctx.now.getTime() + 3_600_000;
  const maxAt = ctx.now.getTime() + 21 * 86_400_000;
  if (at.getTime() < minAt || at.getTime() > maxAt) {
    throw new ToolRejection('a check must be between 1 hour and 21 days from now');
  }
  const pending = await ctx.db.one<{ n: number }>(
    `select count(*)::int as n from jobs
      where learner_id = $1 and kind = 'buddy_check' and status = 'queued'
        and payload ->> 'reason' = 'checkin_requested'`,
    [ctx.learnerId],
  );
  if (pending.n >= 3)
    throw new ToolRejection(
      'there are already 3 checks planned — leave this action out; one of them will come anyway',
    );
  const id = await enqueueJob(ctx.db, {
    learnerId: ctx.learnerId,
    kind: 'buddy_check',
    runAt: at,
    dedupeKey: `check:${ctx.learnerId}:${at.toISOString()}`,
    payload: { reason: 'checkin_requested', note: a.reason },
  });
  return {
    summary: { tool: 'schedule_check', at: at.toISOString() },
    undo: id ? { type: 'cancel_check', job_id: id } : null,
  };
}
