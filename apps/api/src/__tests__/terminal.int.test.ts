// Honest outage and failure states (audit N-7, S-5): every job kind has a visible terminal
// state, /health reports a failing or dead scheduler and parked work, the home says when Buddy
// cannot answer, and a turn that throws anywhere ends as failed.
// docs/architecture.md §Background work, §Turns.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DAILY_LIMITS } from '../config.js';
import { findOrCreateSubject } from '../modules/buddy/plan.js';
import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type Health = {
  ok: boolean;
  scheduler: {
    state: string;
    last_error: string | null;
    parked: Record<string, { count: number }>;
  };
};

async function health(env: TestEnv): Promise<{ status: number; body: Health }> {
  const res = await env.app.request('/v1/health');
  return { status: res.status, body: (await res.json()) as Health };
}

/** A job whose worker died on its last attempt (lease long gone). */
async function dyingJob(
  env: TestEnv,
  job: { learnerId: string | null; kind: string; key: string; payload: Record<string, unknown> },
) {
  await env.db.query(
    `insert into jobs (learner_id, kind, run_at, dedupe_key, payload, status, attempts, max_attempts,
                       lease_token, lease_until)
     values ($1, $2, $3, $4, $5, 'running', 3, 3, gen_random_uuid(), $3)`,
    [
      job.learnerId,
      job.kind,
      new Date(env.clock.now().getTime() - 3_600_000),
      job.key,
      job.payload,
    ],
  );
}

describe.skipIf(!dbReady)('terminal states and honest outages', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T13:00:00Z', model: 'disabled' });
  });
  afterEach(async () => {
    await env.close();
  });

  it('a parked job of every kind has its defined effect', async () => {
    const l = await onboard(env);
    // A countdown check the day before a test.
    const goalId = await env.db.tx(async (tx) => {
      const subject = await findOrCreateSubject(tx, l.learnerId, 'Mathe', 'math');
      const goal = await tx.one<{ id: string }>(
        `insert into buddy_goals (learner_id, kind, title, subject_id, due_date)
         values ($1, 'exam', 'Mathearbeit', $2, '2026-09-29') returning id`,
        [l.learnerId, subject.id],
      );
      const material = await tx.one<{ id: string }>(
        `insert into materials (learner_id, client_request_id, goal_id, subject_id, status, photo_count, created_at)
         values ($1, gen_random_uuid(), $2, $3, 'ready', 1, $4) returning id`,
        [l.learnerId, goal.id, subject.id, env.clock.now()],
      );
      await tx.query(
        `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
         values ($1, $2, $3, 'short', 'Frage', 'x', 'Brüche')`,
        [l.learnerId, material.id, subject.id],
      );
      return goal.id;
    });
    await dyingJob(env, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      key: `exam:${goalId}:d1`,
      payload: { reason: 'exam_countdown', goal_id: goalId, days_before: 1 },
    });
    // An interrupted turn whose recovery died too.
    const msg = await env.db.one<{ id: string }>(
      `insert into buddy_messages (learner_id, role, text, status, created_at)
       values ($1, 'learner', 'Hallo', 'processing', $2) returning id`,
      [l.learnerId, env.clock.now()],
    );
    await dyingJob(env, {
      learnerId: l.learnerId,
      kind: 'buddy_turn',
      key: `turn:${msg.id}:x`,
      payload: { message_id: msg.id },
    });
    await dyingJob(env, { learnerId: null, kind: 'purge_photos', key: 'purge:x', payload: {} });

    const stats = await runTick(env.deps);
    expect(stats.errors).toEqual([]);

    // The countdown still happened, model-free: practice prepared for the test.
    const decision = await env.db.one<{ reason: string }>(
      `select reason from buddy_decisions where learner_id = $1 and mode = 'check'`,
      [l.learnerId],
    );
    expect(decision.reason).toBe('fallback (parked)');
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'practice_ready' });
    // Her message says it failed instead of "processing" forever.
    expect(home.thread.find((m) => m.id === msg.id)).toMatchObject({
      status: 'failed',
      failure_code: 'internal',
    });
    // Each parked job is handled once, and the operator sees them.
    const handled = await env.db.query<{ kind: string; terminal: string }>(
      `select kind, result ->> 'terminal' as terminal from jobs where status = 'failed' order by kind`,
    );
    expect(handled).toEqual([
      { kind: 'buddy_check', terminal: 'fallback_queued' },
      { kind: 'buddy_turn', terminal: 'message_failed' },
      { kind: 'purge_photos', terminal: 'reported' },
    ]);
    const h = await health(env);
    expect(h.body.scheduler.parked).toMatchObject({
      buddy_check: { count: 1 },
      buddy_turn: { count: 1 },
      purge_photos: { count: 1 },
    });
  });

  it('/health is not ok when the last run failed, or when due work waits with no heartbeat', async () => {
    const l = await onboard(env);
    // Never ran (a mistyped tick secret): nothing waiting yet.
    expect((await health(env)).status).toBe(503);
    await env.db.query(
      `insert into jobs (learner_id, kind, run_at, dedupe_key, payload)
       values ($1, 'buddy_check', $2, 'check:old', '{"reason":"routine"}')`,
      [l.learnerId, new Date(env.clock.now().getTime() - 30 * 60_000)],
    );
    // Her work waits: the home says so instead of "unknown".
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.system.scheduler).toBe('stale');

    // A run that finished with errors is not healthy.
    await env.db.query(
      `insert into system_heartbeats (name, last_started_at, last_finished_at, last_error)
       values ('tick', $1, $1, 'buddy: boom')
       on conflict (name) do update set last_finished_at = $1, last_error = 'buddy: boom'`,
      [env.clock.now()],
    );
    await env.db.query(`delete from jobs`);
    const failing = await health(env);
    expect(failing.status).toBe(503);
    expect(failing.body.scheduler).toMatchObject({ state: 'failing', last_error: 'buddy: boom' });

    const stats = await runTick(env.deps);
    expect(stats.errors).toEqual([]);
    const fine = await health(env);
    expect(fine.status).toBe(200);
    expect((await l.api.get<BuddyHome>('/buddy')).body.system.scheduler).toBe('ok');
  });

  it('the home says Buddy cannot answer once today’s allowance is used up', async () => {
    await env.close();
    env = await createTestEnv({ start: '2026-09-28T13:00:00Z' });
    const l = await onboard(env);
    expect((await l.api.get<BuddyHome>('/buddy')).body.system.model).toBe(true);
    await env.db.query(
      `insert into usage_daily (learner_id, day, kind, calls) values ($1, '2026-09-28', 'buddy_turn', $2)`,
      [l.learnerId, DAILY_LIMITS.buddy_turn],
    );
    expect((await l.api.get<BuddyHome>('/buddy')).body.system.model).toBe(false);
  });

  it('a turn that throws outside the model call ends as failed, not "processing" (M-46)', async () => {
    await env.close();
    env = await createTestEnv({ start: '2026-09-28T13:00:00Z' });
    const l = await onboard(env);
    env.llm.script('buddy_turn', async () => {
      // The database refuses the decision record (stands in for any database error in apply).
      await env.db.query(
        `alter table buddy_decisions add constraint test_refuse check (false) not valid`,
      );
      return { concern: false, reply: 'Hallo!', options: null, actions: [] };
    });
    const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: '00000000-0000-4000-d000-000000000001',
      text: 'Hallo',
    });
    await env.db.query(`alter table buddy_decisions drop constraint test_refuse`);
    expect(res.body).toMatchObject({ status: 'failed', error_code: 'internal' });
    const msg = await env.db.one<{ status: string; failure_code: string }>(
      `select status, failure_code from buddy_messages where learner_id = $1 and role = 'learner'`,
      [l.learnerId],
    );
    expect(msg).toEqual({ status: 'failed', failure_code: 'internal' });
  });
});
