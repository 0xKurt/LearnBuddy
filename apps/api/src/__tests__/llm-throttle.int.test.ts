// A throttling model provider: survived where it can be, recorded with its own code where it
// cannot, and alarmed on when it keeps happening (issue #206).
// docs/architecture.md §Model calls.
//
// requires live verification in Claude Code session (needs a running Postgres; the 429 itself
// is scripted — a real Vertex RESOURCE_EXHAUSTED cannot be produced on demand, so what is
// proven here is the app's path after a 429, not that Vertex sends one. The retry schedule
// inside a single call is proven in src/llm/__tests__/retry.test.ts, also against a fake.)

import type { SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { runTick } from '../modules/scheduler/tick.js';
import {
  modelThrottle,
  THROTTLE_ALARM_PERCENT,
  THROTTLE_MIN_CALLS,
  THROTTLE_WINDOW_MINUTES,
} from '../modules/scheduler/throttle.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type Health = {
  ok: boolean;
  scheduler: {
    state: string;
    last_error: string | null;
    model_throttle: {
      calls: number;
      rate_limited: number;
      percent: number;
      window_minutes: number;
      alarming: boolean;
    };
  };
};

let seq = 0;
const uuid = () => `00000000-0000-4000-b000-${(++seq).toString(16).padStart(12, '0')}`;

async function send(l: Learner, text: string) {
  return l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: uuid(),
    text,
  });
}

async function health(env: TestEnv): Promise<{ status: number; body: Health }> {
  const res = await env.app.request('/v1/health');
  return { status: res.status, body: (await res.json()) as Health };
}

/** Call-log rows as a past hour would have left them, dated from the app clock. */
async function logCalls(
  env: TestEnv,
  learnerId: string,
  spec: { ok?: number; limited?: number; otherError?: number; minutesAgo?: number },
) {
  const at = new Date(env.clock.now().getTime() - (spec.minutesAgo ?? 1) * 60_000);
  const rows: Array<[string, string | null]> = [
    ...Array.from({ length: spec.ok ?? 0 }, () => ['ok', null] as [string, string | null]),
    ...Array.from(
      { length: spec.limited ?? 0 },
      () => ['error', 'rate_limited'] as [string, string | null],
    ),
    ...Array.from(
      { length: spec.otherError ?? 0 },
      () => ['error', 'unavailable'] as [string, string | null],
    ),
  ];
  for (const [outcome, code] of rows) {
    await env.db.query(
      `insert into llm_calls (learner_id, purpose, model, prompt_version, outcome, error_code, created_at)
       values ($1, 'buddy_turn', 'scripted', 'v1', $2, $3, $4)`,
      [learnerId, outcome, code, at],
    );
  }
}

describe.skipIf(!dbReady)('a throttled model provider', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
  });
  afterEach(async () => {
    try {
      await env.checkScript({ reset: true });
    } finally {
      await env.db.query(`delete from llm_calls`);
    }
  });
  afterAll(async () => {
    await env?.close();
  });

  it('records a 429 with its own code, apart from every other failure, and spends no allowance', async () => {
    const l = await onboard(env);
    env.llm.script('buddy_turn', {
      error: new LlmError('rate_limited', 'provider rate limit'),
    });
    const throttled = await send(l, 'Erklär mir Bruchrechnen');
    // She reads the honest "couldn't answer just now" — a throttle is not her fault and not
    // a broken app, and the app never claims to know more than it does (rule 5).
    expect(throttled.body).toMatchObject({ status: 'failed', error_code: 'model_unavailable' });

    env.llm.script('buddy_turn', { error: new LlmError('unavailable', 'provider error 503') });
    const down = await send(l, 'Und nochmal');
    expect(down.body).toMatchObject({ status: 'failed', error_code: 'model_unavailable' });

    // Same learner-facing code, two different facts in the log: that is what makes the rate
    // countable afterwards. No migration was needed — `error_code` already carries the kind.
    const calls = await env.db.query<{ outcome: string; error_code: string; created_at: Date }>(
      `select outcome, error_code, created_at from llm_calls
        where learner_id = $1 and purpose = 'buddy_turn' order by created_at, error_code`,
      [l.learnerId],
    );
    expect(calls.map((c) => `${c.outcome}/${c.error_code}`)).toEqual([
      'error/rate_limited',
      'error/unavailable',
    ]);
    // The row's own timestamp comes from the app clock, not the database's now() (rule 7):
    // the alarm's window is measured against it.
    for (const c of calls) expect(c.created_at.toISOString()).toBe(env.clock.now().toISOString());

    // Nothing usable came back, so her daily allowance is untouched.
    const usage = await env.db.maybeOne<{ calls: number }>(
      `select calls from usage_daily where learner_id = $1 and kind = 'buddy_turn'`,
      [l.learnerId],
    );
    expect(usage?.calls ?? 0).toBe(0);
  });

  it('measures the rate over the app clock’s last hour and ignores what fell out of it', async () => {
    const l = await onboard(env);
    await logCalls(env, l.learnerId, { ok: 15, limited: 5, minutesAgo: 10 });
    // Older than the window, and bad enough to swing the rate if it were counted.
    await logCalls(env, l.learnerId, { limited: 40, minutesAgo: THROTTLE_WINDOW_MINUTES + 5 });

    const now = await modelThrottle(env.db, env.clock.now());
    expect(now).toEqual({
      calls: 20,
      rate_limited: 5,
      percent: 25,
      window_minutes: THROTTLE_WINDOW_MINUTES,
      alarming: true,
    });

    // An hour later the same rows have left the window: the alarm follows the throttle
    // instead of outliving it.
    const later = await modelThrottle(
      env.db,
      new Date(env.clock.now().getTime() + (THROTTLE_WINDOW_MINUTES + 1) * 60_000),
    );
    expect(later).toMatchObject({ calls: 0, rate_limited: 0, percent: 0, alarming: false });
  });

  it('does not cry wolf on a handful of calls, however bad they look', async () => {
    const l = await onboard(env);
    // Everything refused — but far too few calls for a share to say anything about Vertex.
    await logCalls(env, l.learnerId, { limited: THROTTLE_MIN_CALLS - 1 });
    const quiet = await modelThrottle(env.db, env.clock.now());
    expect(quiet).toMatchObject({ calls: THROTTLE_MIN_CALLS - 1, percent: 100, alarming: false });

    // One more call over the threshold and the same rate is worth waking someone for.
    await logCalls(env, l.learnerId, { ok: 1 });
    expect((await modelThrottle(env.db, env.clock.now())).alarming).toBe(true);
  });

  it('stays quiet just below the alarm share and fires at it', async () => {
    const l = await onboard(env);
    // 9 of 100 refused: under the threshold, so no alarm.
    await logCalls(env, l.learnerId, { ok: 91, limited: 9 });
    const below = await modelThrottle(env.db, env.clock.now());
    expect(below).toMatchObject({ calls: 100, percent: 9, alarming: false });
    expect(below.percent).toBeLessThan(THROTTLE_ALARM_PERCENT);

    // One more refusal in place of one that worked: 10 of 100 is exactly the threshold, and
    // the alarm fires at it, not only above it.
    await env.db.query(
      `delete from llm_calls where id in (select id from llm_calls where error_code is null limit 1)`,
    );
    await logCalls(env, l.learnerId, { limited: 1 });
    const at = await modelThrottle(env.db, env.clock.now());
    expect(at).toMatchObject({
      calls: 100,
      rate_limited: 10,
      percent: THROTTLE_ALARM_PERCENT,
      alarming: true,
    });
  });

  it('a 429 and another error are told apart: only the throttle counts towards the alarm', async () => {
    const l = await onboard(env);
    await logCalls(env, l.learnerId, { otherError: 30 });
    expect(await modelThrottle(env.db, env.clock.now())).toMatchObject({
      calls: 30,
      rate_limited: 0,
      percent: 0,
      alarming: false,
    });
  });

  it('the tick alarms with the measured rate and window, /health shows it, and a clean run clears it', async () => {
    const l = await onboard(env);
    await logCalls(env, l.learnerId, { ok: 60, limited: 40 });

    const stats = await runTick(env.deps);
    expect(stats.throttle).toMatchObject({ calls: 100, rate_limited: 40, percent: 40 });
    // The alarm names the numbers it was raised on and what to look at — never "something
    // seems slow".
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]).toContain('40 of 100');
    expect(stats.errors[0]).toContain(`${THROTTLE_WINDOW_MINUTES} min`);
    expect(stats.errors[0]).toContain('40 %');
    expect(stats.errors[0]).toContain('Vertex quota');

    const alarmed = await health(env);
    expect(alarmed.status).toBe(503);
    expect(alarmed.body.ok).toBe(false);
    expect(alarmed.body.scheduler.state).toBe('failing');
    expect(alarmed.body.scheduler.last_error).toBe(stats.errors[0]);
    // The number is on /health whether or not it is the error that got to last_error.
    expect(alarmed.body.scheduler.model_throttle).toMatchObject({
      calls: 100,
      rate_limited: 40,
      percent: 40,
      window_minutes: THROTTLE_WINDOW_MINUTES,
      alarming: true,
    });

    // The throttle stops; the next run says so instead of leaving the alarm standing.
    await env.db.query(`delete from llm_calls`);
    const clean = await runTick(env.deps);
    expect(clean.errors).toEqual([]);
    expect(clean.throttle).toMatchObject({ calls: 0, rate_limited: 0, alarming: false });
    const fine = await health(env);
    expect(fine.status).toBe(200);
    expect(fine.body.scheduler.state).toBe('ok');
    expect(fine.body.scheduler.model_throttle.alarming).toBe(false);
    expect(l.learnerId).toBeTruthy();
  });
});
