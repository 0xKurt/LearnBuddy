// Background work and delivery under real-world failures: agreed reminders,
// uncertain / rejected / rate-limited pushes, a crash mid-send, the learner
// being in the app, concurrent scheduler runs, and no model at all.
// docs/architecture.md §Delivery, §Background work. ADR 0004 §Reliability.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  bumpContext,
  findOrCreateSubject,
  scheduleExamWakeups,
  scheduleStepReminder,
} from '../modules/buddy/plan.js';
import { loadSettings } from '../modules/buddy/state.js';
import { runTick } from '../modules/scheduler/tick.js';
import { PushRejectedError, PushUncertainError } from '../push/transport.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  enableContact,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

// Monday 2026-09-28, 10:00 in Berlin.
const START = '2026-09-28T08:00:00Z';

async function tick(env: TestEnv): Promise<{ errors: string[] }> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  const stats = (await res.json()) as { errors: string[] };
  expect(stats.errors).toEqual([]);
  return stats;
}

/** A test with ready material, planned through the real planning code (no model involved). */
async function seedExam(
  env: TestEnv,
  learnerId: string,
  opts: { title: string; due: string; questions: number },
) {
  return env.db.tx(async (tx) => {
    const subject = await findOrCreateSubject(tx, learnerId, 'Mathe', 'math');
    const goal = await tx.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, subject_id, due_date) values ($1, 'exam', $2, $3, $4) returning id`,
      [learnerId, opts.title, subject.id, opts.due],
    );
    if (opts.questions > 0) {
      const material = await tx.one<{ id: string }>(
        `insert into materials (learner_id, client_request_id, goal_id, subject_id, status, photo_count, title, created_at)
         values ($1, gen_random_uuid(), $2, $3, 'ready', 1, 'Arbeitsblatt', $4) returning id`,
        [learnerId, goal.id, subject.id, env.clock.now()],
      );
      for (let i = 0; i < opts.questions; i++) {
        await tx.query(
          `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
           values ($1, $2, $3, 'short', $4, $5, 'Brüche')`,
          [learnerId, material.id, subject.id, `Frage ${i + 1}`, `Antwort ${i + 1}`],
        );
      }
    }
    const settings = await loadSettings(tx, learnerId);
    await scheduleExamWakeups(tx, learnerId, goal.id, opts.due, settings, env.clock.now());
    await bumpContext(tx, learnerId);
    return goal.id;
  });
}

async function seedAgreedStep(
  env: TestEnv,
  learnerId: string,
  opts: { title: string; date: string; time: string; at: string },
) {
  return env.db.tx(async (tx) => {
    const step = await tx.one<{ id: string; version: number }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date, planned_time, agreed)
       values ($1, 'practice', $2, 'planned', $3, $4, true) returning id, version`,
      [learnerId, opts.title, opts.date, opts.time],
    );
    await scheduleStepReminder(tx, learnerId, step, new Date(opts.at));
    return step.id;
  });
}

const checkAnswer = (title: string, body: string, relevance = 0.9) => ({
  json: {
    disposition: 'act',
    reason: 'test is close; practice is ready',
    actions: [],
    outreach: {
      kind: 'idea',
      topic_key: 'exam:g1:prep',
      title,
      body,
      why: 'Die Arbeit ist bald.',
      relevance,
      expires_in_hours: 12,
      goal: 'g1',
      step: null,
    },
  },
});

async function outreachOf(env: TestEnv, learnerId: string) {
  return env.db.query<{
    id: string;
    status: string;
    status_reason: string | null;
    send_at: Date | null;
    sent_at: Date | null;
    origin: string;
  }>(
    `select id, status, status_reason, send_at, sent_at, origin from buddy_outreach where learner_id = $1 order by created_at`,
    [learnerId],
  );
}

describe.skipIf(!dbReady)('background work and delivery', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: START });
    l = await onboard(env);
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.length,
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: 0, pending: 0 });
  });

  async function withPhone() {
    await enableContact(env, l.learnerId);
    await l.api.post('/buddy/push-tokens', {
      token: 'ExponentPushToken[device-0001]',
      platform: 'android',
    });
    // The learner has left the app.
    env.clock.minutes(10);
  }

  it('keeps an agreed reminder in the app when contact outside the app is off', async () => {
    await seedAgreedStep(env, l.learnerId, {
      title: 'Geschichte wiederholen',
      date: '2026-09-28',
      time: '17:00',
      at: '2026-09-28T15:00:00Z',
    });
    env.clock.set('2026-09-28T15:00:00Z');
    await tick(env);
    const [out] = await outreachOf(env, l.learnerId);
    expect(out).toMatchObject({
      status: 'in_app',
      status_reason: 'contact_disabled',
      origin: 'agreed',
    });
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.thread.at(-1)).toMatchObject({
      role: 'buddy',
      text: 'Wie verabredet: Geschichte wiederholen.',
    });
    expect(env.push.attempts).toEqual([]);
    // Deterministic: no model call for an agreed reminder.
    expect(env.llm.calls).toEqual([]);
  });

  it("sends an agreed reminder at the agreed minute even when Buddy already used today's limit", async () => {
    await withPhone();
    const goalId = await seedExam(env, l.learnerId, {
      title: 'Mathearbeit',
      due: '2026-10-01',
      questions: 6,
    });
    await seedAgreedStep(env, l.learnerId, {
      title: 'Brüche üben',
      date: '2026-09-28',
      time: '17:30',
      at: '2026-09-28T15:30:00Z',
    });

    // 15:00: the exam wake-up (3 days before) — Buddy's own initiative uses the 1/day limit.
    env.clock.set('2026-09-28T13:00:00Z');
    env.llm.script(
      'buddy_check',
      checkAnswer('Übung für Donnerstag', 'Ich habe eine kurze Übung vorbereitet.'),
    );
    await tick(env);
    expect(env.push.sent.map((m) => m.title)).toEqual(['Übung für Donnerstag']);

    // 17:30: the agreed reminder goes out anyway, with the text Buddy promised.
    env.clock.set('2026-09-28T15:30:00Z');
    await tick(env);
    // The reminder also prepared the practice it talks about.
    expect(env.push.sent.map((m) => m.body)).toEqual([
      'Ich habe eine kurze Übung vorbereitet.',
      'Wie verabredet: Brüche üben. 6 Aufgaben liegen bereit, ca. 5 Minuten.',
    ]);
    const outs = await outreachOf(env, l.learnerId);
    expect(outs.map((o) => [o.origin, o.status])).toEqual([
      ['buddy', 'accepted'],
      ['agreed', 'accepted'],
    ]);
    expect(goalId).toBeTruthy();
  });

  it('never resends a push whose outcome is unknown, but keeps the text in the app', async () => {
    await withPhone();
    await seedExam(env, l.learnerId, { title: 'Mathearbeit', due: '2026-10-01', questions: 6 });
    env.clock.set('2026-09-28T13:00:00Z');
    env.push.nextSend(new PushUncertainError('timeout'));
    env.llm.script(
      'buddy_check',
      checkAnswer('Übung ist bereit', 'Eine kurze Runde für Donnerstag liegt bereit.'),
    );
    await tick(env);
    env.clock.minutes(5);
    await tick(env);
    expect(env.push.attempts).toHaveLength(1);
    const [out] = await outreachOf(env, l.learnerId);
    expect(out).toMatchObject({ status: 'send_uncertain', status_reason: 'no_answer' });
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.thread.at(-1)?.outreach?.status).toBe('send_uncertain');
  });

  it('marks a device as gone when the provider says so, and falls back to the app', async () => {
    await withPhone();
    await seedExam(env, l.learnerId, { title: 'Mathearbeit', due: '2026-10-01', questions: 6 });
    env.clock.set('2026-09-28T13:00:00Z');
    env.push.nextSend({ status: 'error', error: 'DeviceNotRegistered', message: 'not registered' });
    env.llm.script(
      'buddy_check',
      checkAnswer('Übung ist bereit', 'Eine kurze Runde für Donnerstag liegt bereit.'),
    );
    await tick(env);
    const [out] = await outreachOf(env, l.learnerId);
    expect(out).toMatchObject({ status: 'send_failed', status_reason: 'DeviceNotRegistered' });
    const token = await env.db.one<{ status: string }>(
      `select status from push_tokens where learner_id = $1`,
      [l.learnerId],
    );
    expect(token.status).toBe('invalid');
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.system.push).toBe('invalid');
  });

  it('waits for the provider after a rate limit instead of dropping or hammering', async () => {
    await withPhone();
    await seedExam(env, l.learnerId, { title: 'Mathearbeit', due: '2026-10-01', questions: 6 });
    env.clock.set('2026-09-28T13:00:00Z');
    env.push.nextSend(new PushRejectedError('rate limit', 120));
    env.llm.script(
      'buddy_check',
      checkAnswer('Übung ist bereit', 'Eine kurze Runde für Donnerstag liegt bereit.'),
    );
    await tick(env);
    let [out] = await outreachOf(env, l.learnerId);
    expect(out).toMatchObject({ status: 'scheduled', status_reason: 'provider_busy' });
    expect(out!.send_at!.toISOString()).toBe('2026-09-28T13:02:00.000Z');
    env.clock.minutes(1);
    await tick(env);
    expect(env.push.sent).toHaveLength(0);
    env.clock.minutes(2);
    await tick(env);
    [out] = await outreachOf(env, l.learnerId);
    expect(out!.status).toBe('accepted');
    expect(env.push.sent).toHaveLength(1);
  });

  it('treats a send that crashed midway as uncertain — it is never sent twice', async () => {
    await withPhone();
    const row = await env.db.one<{ id: string }>(
      `insert into buddy_outreach (learner_id, kind, origin, topic_key, dedupe_key, title, body, status, send_at,
                                   expires_at, lease_until, created_at)
       values ($1, 'idea', 'buddy', 't', 'd', 'Titel', 'Text', 'sending', $2, $3, $4, $2) returning id`,
      [
        l.learnerId,
        env.clock.now(),
        new Date(env.clock.now().getTime() + 3_600_000),
        new Date(env.clock.now().getTime() + 60_000),
      ],
    );
    env.clock.minutes(3);
    await tick(env);
    const out = await env.db.one<{ status: string; status_reason: string }>(
      `select status, status_reason from buddy_outreach where id = $1`,
      [row.id],
    );
    expect(out).toEqual({ status: 'send_uncertain', status_reason: 'lease_expired' });
    expect(env.push.attempts).toEqual([]);
  });

  it('shows the message in the app instead of pushing while the learner is using it', async () => {
    await withPhone();
    await seedAgreedStep(env, l.learnerId, {
      title: 'Vokabeln',
      date: '2026-09-28',
      time: '17:00',
      at: '2026-09-28T15:00:00Z',
    });
    env.clock.set('2026-09-28T14:59:00Z');
    await l.api.get('/buddy'); // the learner is in the app
    env.clock.set('2026-09-28T15:00:00Z');
    await tick(env);
    const [out] = await outreachOf(env, l.learnerId);
    expect(out).toMatchObject({ status: 'in_app', status_reason: 'learner_in_app' });
    expect(env.push.attempts).toEqual([]);
  });

  it('does not start something unasked while the learner is in the app, but does after they left', async () => {
    await withPhone();
    await seedExam(env, l.learnerId, { title: 'Mathearbeit', due: '2026-10-01', questions: 6 });
    env.clock.set('2026-09-28T12:59:00Z');
    await l.api.get('/buddy'); // using the app at 14:59
    env.clock.set('2026-09-28T13:00:00Z');
    await tick(env);
    expect(env.llm.callsFor('buddy_check')).toHaveLength(0);
    const job = await env.db.one<{ status: string; run_at: Date; attempts: number }>(
      `select status, run_at, attempts from jobs where learner_id = $1 and payload ->> 'days_before' = '3'`,
      [l.learnerId],
    );
    // Deferred without using up an attempt.
    expect(job).toEqual({
      status: 'queued',
      run_at: new Date('2026-09-28T13:20:00Z'),
      attempts: 0,
    });
    env.clock.set('2026-09-28T13:20:00Z');
    env.llm.script(
      'buddy_check',
      checkAnswer('Übung ist bereit', 'Eine kurze Runde für Donnerstag liegt bereit.'),
    );
    await tick(env);
    expect(env.push.sent).toHaveLength(1);
  });

  it('does the work once when two scheduler runs overlap', async () => {
    await withPhone();
    await seedExam(env, l.learnerId, { title: 'Mathearbeit', due: '2026-10-01', questions: 6 });
    env.clock.set('2026-09-28T13:00:00Z');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    env.llm.script('buddy_check', async () => {
      await gate; // hold the first run inside the model call while the second starts
      return checkAnswer('Übung ist bereit', 'Eine kurze Runde für Donnerstag liegt bereit.').json;
    });
    const first = runTick(env.deps);
    await new Promise((r) => setTimeout(r, 50));
    const second = await runTick(env.deps);
    release();
    const firstStats = await first;
    expect([...firstStats.errors, ...second.errors]).toEqual([]);
    // The second run could deliver nothing yet; one more run after the first finished.
    await runTick(env.deps);
    expect(env.llm.callsFor('buddy_check')).toHaveLength(1);
    expect(env.push.sent).toHaveLength(1);
    expect(await outreachOf(env, l.learnerId)).toHaveLength(1);
  });

  it('holds and cancels planned messages when the learner pauses, without a backlog afterwards', async () => {
    await withPhone();
    await seedExam(env, l.learnerId, { title: 'Mathearbeit', due: '2026-10-01', questions: 6 });
    // 10:10 local: Buddy's idea is planned for the preferred window (15:00).
    env.clock.set('2026-09-28T08:10:00Z');
    await env.db.query(
      `update jobs set run_at = $2 where learner_id = $1 and payload ->> 'days_before' = '3'`,
      [l.learnerId, env.clock.now()],
    );
    env.llm.script(
      'buddy_check',
      checkAnswer('Übung ist bereit', 'Eine kurze Runde für Donnerstag liegt bereit.'),
    );
    await tick(env);
    let [out] = await outreachOf(env, l.learnerId);
    expect(out).toMatchObject({ status: 'scheduled' });
    expect(out!.send_at!.toISOString()).toBe('2026-09-28T13:00:00.000Z');

    const s = await l.api.get<{ version: number }>('/buddy/settings');
    await l.api.patch('/buddy/settings', {
      paused_until: '2026-09-29T22:00:00Z',
      version: s.body.version,
    });
    [out] = await outreachOf(env, l.learnerId);
    expect(out).toMatchObject({ status: 'cancelled', status_reason: 'paused' });
    // During the pause the daily routine look is skipped without asking the model.
    env.clock.set('2026-09-29T13:00:00Z');
    await tick(env);
    // After the pause nothing from before is sent in bulk.
    env.clock.set('2026-09-30T08:00:00Z');
    await tick(env);
    expect(env.push.attempts).toEqual([]);
    expect((await outreachOf(env, l.learnerId)).map((o) => o.status)).toEqual(['cancelled']);
    expect(env.llm.callsFor('buddy_check')).toHaveLength(1);
  });

  it('upgrades delivery status only from provider receipts, and handles a rejected receipt', async () => {
    await withPhone();
    await seedExam(env, l.learnerId, { title: 'Mathearbeit', due: '2026-10-01', questions: 6 });
    env.clock.set('2026-09-28T13:00:00Z');
    env.llm.script(
      'buddy_check',
      checkAnswer('Übung ist bereit', 'Eine kurze Runde für Donnerstag liegt bereit.'),
    );
    await tick(env);
    const [sent] = await env.db.query<{ ticket_id: string }>(
      `select ticket_id from buddy_outreach where learner_id = $1`,
      [l.learnerId],
    );
    // Too early for receipts: nothing is asked or claimed.
    env.clock.minutes(5);
    await tick(env);
    expect((await outreachOf(env, l.learnerId))[0]!.status).toBe('accepted');
    env.push.receipt(sent!.ticket_id, { status: 'error', error: 'DeviceNotRegistered' });
    env.clock.minutes(15);
    await tick(env);
    const [out] = await outreachOf(env, l.learnerId);
    expect(out).toMatchObject({
      status: 'provider_rejected',
      status_reason: 'DeviceNotRegistered',
    });
    const token = await env.db.one<{ status: string }>(
      `select status from push_tokens where learner_id = $1`,
      [l.learnerId],
    );
    expect(token.status).toBe('invalid');
  });
});

describe.skipIf(!dbReady)('without any model configured', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: START, model: 'disabled' });
    l = await onboard(env);
  });
  afterEach(async () => {
    await env.close();
  });

  it('says so honestly in conversation, and still prepares practice before a test', async () => {
    const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: '00000000-0000-4000-8000-00000000aa01',
      text: 'Hallo Buddy',
    });
    expect(res.body).toMatchObject({ status: 'failed', error_code: 'model_unavailable' });
    expect(res.body.home.system.model).toBe(false);

    await enableContact(env, l.learnerId);
    await l.api.post('/buddy/push-tokens', {
      token: 'ExponentPushToken[device-0002]',
      platform: 'ios',
    });
    await seedExam(env, l.learnerId, { title: 'Mathearbeit', due: '2026-10-01', questions: 6 });
    env.clock.set('2026-09-28T13:00:00Z');
    await tick(env);
    // A fixed template, in the learner's language, with a real prepared practice behind it.
    expect(env.push.sent.map((m) => m.body)).toEqual([
      'Donnerstag ist „Mathearbeit“. 6 Aufgaben liegen bereit, ca. 5 Minuten.',
    ]);
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'practice_ready', question_count: 6 });
    const decision = await env.db.one<{ reason: string; prompt_version: string }>(
      `select reason, prompt_version from buddy_decisions where learner_id = $1 and mode = 'check'`,
      [l.learnerId],
    );
    expect(decision).toEqual({ reason: 'fallback (model_disabled)', prompt_version: 'fallback.1' });
    expect(ScriptedGateway.textOf).toBeTypeOf('function');
  });
});
