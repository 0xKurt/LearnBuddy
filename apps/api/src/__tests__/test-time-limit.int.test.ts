// A practice test with a time limit, only when she asks for it in the chat (issue #241, „mit
// Zeit, wie in der Arbeit“; decided in #224: no switch, no setting). What is proven here is the
// part code owns (#224 Regel 0, CLAUDE.md rules 1, 2 and 7):
//   - the minutes are one of a fixed list, never a number the model made up, and only a test
//     carries them;
//   - a clock exists only on her wish: the words asking for it must be hers, from this message;
//   - the server keeps the deadline on the app clock, starting when she opens the test;
//   - an answer after the deadline (plus a small network allowance) is not graded, and what
//     stayed open counts as not answered — never as wrong;
//   - someone else's test stays someone else's (404).
// Whether the live model sets the minutes only when asked is an eval (evals/buddy/cases.ts,
// de_test_without_time_has_no_clock / de_test_with_time_has_its_minutes).
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LlmRequest } from '../llm/gateway.js';
import { closeIdleSessions } from '../modules/practice/lifecycle.js';
import { TIME_UP_GRACE_MS } from '../modules/practice/testClock.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const turn = (over: Record<string, unknown>) => ({
  lookups: [],
  concern: false,
  also_asked: false,
  actions: [],
  reply: 'Alles klar.',
  options: null,
  asks_permission: false,
  ...over,
});

const numeric = (prompt: string, answer: string) => ({
  kind: 'numeric',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Brüche',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

/** The practice test the generator writes: three questions the rules judge without a model. */
const testSet = () => ({
  usable: true,
  title: 'Brüche – Probetest',
  subject: { name: 'Mathe', kind: 'math' },
  items: [
    numeric('Wie viel ist $\\frac{1}{2} + \\frac{1}{4}$?', '0.75'),
    numeric('Wie viel ist $\\frac{1}{2} + \\frac{1}{2}$?', '1'),
    numeric('Wie viel ist $\\frac{1}{4} + \\frac{1}{4}$?', '0.5'),
  ],
});

async function say(l: Learner, text: string): Promise<SendMessageResponse> {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: randomUUID(),
    text,
  });
  expect(res.status).toBe(200);
  return res.body;
}

async function offers(env: TestEnv, l: Learner) {
  return env.db.query<{ id: string; result: { kind: string; minutes?: number | null } }>(
    `select id, result from buddy_actions where learner_id = $1 and tool = 'offer_learning'
      order by seq`,
    [l.learnerId],
  );
}

async function startTest(l: Learner, minutes: number | null, id: string = randomUUID()) {
  return l.api.post<SessionView>('/practice/topic', {
    client_request_id: id,
    kind: 'test',
    text: 'Brüche',
    ...(minutes === null ? {} : { minutes }),
  });
}

async function answer(l: Learner, sessionId: string, itemId: string, text: string) {
  return l.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });
}

describe.skipIf(!dbReady)('a practice test with time (issue #241)', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-02T14:00:00Z' });
  });
  afterAll(async () => {
    const report = { scriptErrors: [...env.llm.scriptErrors], pending: env.llm.pending() };
    await env?.close();
    expect(report).toEqual({ scriptErrors: [], pending: 0 });
  });

  it('starts a clock only when she asked, from the list, and only when she opens the test', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.script('buddy_turn', {
      json: turn({
        actions: [
          {
            tool: 'offer_learning',
            args: {
              kind: 'test',
              text: 'Brüche',
              goal: null,
              time_limit: { minutes: '45', quote: 'mit Zeit, wie in der Arbeit' },
            },
          },
        ],
        reply: 'Dein Probetest mit 45 Minuten ist bereit.',
      }),
    });
    env.llm.script('explain', { json: testSet() });
    await say(l, 'Mach mit mir einen Probetest zu Brüchen, mit Zeit, wie in der Arbeit');
    await env.flushBackground();

    const [offer] = await offers(env, l);
    expect(offer!.result).toMatchObject({ kind: 'test', minutes: 45 });
    // Prepared while she reads his reply (issue #48): the minutes are there, the clock is not.
    const prepared = await env.db.one<{
      id: string;
      time_limit_minutes: number;
      deadline_at: Date | null;
    }>(
      `select id, time_limit_minutes, deadline_at from practice_sessions where client_request_id = $1`,
      [offer!.id],
    );
    expect(prepared).toMatchObject({ time_limit_minutes: 45, deadline_at: null });

    // She reads for two minutes, then taps: those two minutes are not hers to lose.
    env.clock.minutes(2);
    const opened = await startTest(l, 45, offer!.id);
    expect(opened.status).toBe(201);
    expect(opened.body.id).toBe(prepared.id);
    expect(opened.body.timer).toEqual({ minutes: 45, remaining_ms: 45 * 60_000, ran_out: false });
    const row = await env.db.one<{ deadline_at: Date }>(
      `select deadline_at from practice_sessions where id = $1`,
      [prepared.id],
    );
    expect(row.deadline_at.toISOString()).toBe(
      new Date(env.clock.now().getTime() + 45 * 60_000).toISOString(),
    );

    // Opening it again later never moves the deadline.
    env.clock.minutes(10);
    const again = await l.api.get<SessionView>(`/practice/sessions/${prepared.id}`);
    expect(again.body.timer).toEqual({ minutes: 45, remaining_ms: 35 * 60_000, ran_out: false });
  });

  it('never sets a clock from words she did not write, nor on anything but a test', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-07-04' });
    const repairs: string[] = [];
    const refused = (req: LlmRequest) => {
      const m = /action 1 \(offer_learning\): ([^\n]+)/.exec(ScriptedGateway.textOf(req));
      repairs.push(m ? m[1]! : '');
    };
    // A clock she never asked for, justified with words she did not write.
    env.llm.script(
      'buddy_turn',
      {
        json: turn({
          actions: [
            {
              tool: 'offer_learning',
              args: {
                kind: 'test',
                text: 'Brüche',
                goal: null,
                time_limit: { minutes: '30', quote: 'wie in der Arbeit' },
              },
            },
          ],
        }),
      },
      (req) => {
        refused(req);
        return turn({
          actions: [{ tool: 'offer_learning', args: { kind: 'test', text: 'Brüche', goal: null } }],
          reply: 'Dein Probetest ist bereit.',
        });
      },
    );
    env.llm.script('explain', { json: testSet() });
    await say(l, 'Mach mit mir einen Probetest zu Brüchen');
    await env.flushBackground();
    expect(repairs[0]).toContain("is not the learner's exact words");

    // A clock on a practice run, with her words this time: a clock belongs to a test only.
    env.llm.script(
      'buddy_turn',
      {
        json: turn({
          actions: [
            {
              tool: 'offer_learning',
              args: {
                kind: 'practice',
                text: 'Brüche',
                goal: null,
                time_limit: { minutes: '30', quote: 'mit Zeit' },
              },
            },
          ],
        }),
      },
      (req) => {
        refused(req);
        return turn({ reply: 'Üben geht ohne Uhr – magst du lieber einen Probetest mit Zeit?' });
      },
    );
    await say(l, 'Lass uns Brüche üben, mit Zeit');
    expect(repairs[1]).toContain('only goes with a practice test');

    // What stands is a test without a clock: no wish, no timer.
    const all = await offers(env, l);
    expect(all).toHaveLength(1);
    expect(all[0]!.result).toMatchObject({ kind: 'test', minutes: null });
    const opened = await startTest(l, null, all[0]!.id);
    expect(opened.body.timer).toBeNull();
    const row = await env.db.one<{ time_limit_minutes: number | null; deadline_at: Date | null }>(
      `select time_limit_minutes, deadline_at from practice_sessions where id = $1`,
      [opened.body.id],
    );
    expect(row).toEqual({ time_limit_minutes: null, deadline_at: null });
  });

  it('refuses a duration that is not on the list, and a clock on anything but a test', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Ida', birthDate: '2013-01-02' });
    const calls = env.llm.callsFor('explain').length;
    for (const minutes of [25, 0, 120, 44.5]) {
      const res = await startTest(l, minutes);
      expect(res.status, `${minutes} minutes`).toBe(422);
    }
    const practice = await l.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Brüche',
      minutes: 30,
    });
    expect(practice.status).toBe(422);
    // Refused before any model call, and nothing was created.
    expect(env.llm.callsFor('explain')).toHaveLength(calls);
    expect(
      await env.db.query(`select 1 from practice_sessions where learner_id = $1`, [l.learnerId]),
    ).toEqual([]);
    // The database holds the list too, whatever a future code path might write.
    await expect(
      env.db.query(
        `insert into practice_sessions (learner_id, mode, started_at, last_activity_at, time_limit_minutes)
         values ($1, 'test', $2, $2, 25)`,
        [l.learnerId, env.clock.now()],
      ),
    ).rejects.toThrow();
    await expect(
      env.db.query(
        `insert into practice_sessions (learner_id, mode, started_at, last_activity_at, time_limit_minutes)
         values ($1, 'practice', $2, $2, 30)`,
        [l.learnerId, env.clock.now()],
      ),
    ).rejects.toThrow();
  });

  it('grades an answer in time, refuses one after it, and counts the rest as not answered', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Noa', birthDate: '2014-05-06' });
    env.llm.script('explain', { json: testSet() });
    const s = (await startTest(l, 10)).body;
    expect(s.timer).toEqual({ minutes: 10, remaining_ms: 10 * 60_000, ran_out: false });
    const [a, b, c] = s.items.map((i) => i.item.id) as [string, string, string];

    env.clock.minutes(3);
    const first = await answer(l, s.id, a, '0,75');
    expect(first.status).toBe(200);
    expect(first.body.session.timer?.remaining_ms).toBe(7 * 60_000);

    // Sent at the last second, arriving a few seconds late: still hers.
    env.clock.set(new Date(env.clock.now().getTime() + 7 * 60_000 + 5_000));
    const late = await answer(l, s.id, b, '2');
    expect(late.status).toBe(200);
    expect(late.body.session.items.find((i) => i.item.id === b)?.status).toBe('missed');
    expect(late.body.session.timer?.remaining_ms).toBe(0);

    // Past the network allowance: not graded — no rule, no turn — and the test is over.
    env.clock.advance(TIME_UP_GRACE_MS);
    const tooLate = await answer(l, s.id, c, '0,5');
    expect(tooLate.status).toBe(409);
    expect(tooLate.body).toMatchObject({ error: { details: { reason: 'time_up' } } });
    const turns = await env.db.query(
      `select 1 from practice_turns where session_id = $1 and item_id = $2`,
      [s.id, c],
    );
    expect(turns).toEqual([]);
    // Skipping it now changes nothing either.
    const skip = await l.api.post(`/practice/sessions/${s.id}/reveal`, { item_id: c });
    expect(skip.status).toBe(409);

    const view = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(view.status).toBe('finished');
    expect(view.timer).toEqual({ minutes: 10, remaining_ms: 0, ran_out: true });
    // How far she got: two answered; the third is open — not answered, never wrong — and its
    // solution is shown like every solution of a finished test.
    expect(view.items.map((i) => i.status)).toEqual(['correct', 'missed', 'open']);
    expect(view.items[2]!.answer).toBe('0.5');
    expect(view.summary).toMatchObject({ answered: 2, first_try: 1 });
    const closed = await env.db.one<{ status: string; first_try_correct: boolean | null }>(
      `select status, first_try_correct from session_items where session_id = $1 and item_id = $2`,
      [s.id, c],
    );
    expect(closed).toEqual({ status: 'open', first_try_correct: null });
  });

  it('a test handed in before the time is up did not run out', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2014-03-03' });
    env.llm.script('explain', { json: testSet() });
    const s = (await startTest(l, 20)).body;
    env.clock.minutes(4);
    const done = await l.api.post<SessionView>(`/practice/sessions/${s.id}/finish`);
    await env.flushBackground();
    expect(done.body.status).toBe('finished');
    expect(done.body.timer).toEqual({ minutes: 20, remaining_ms: 0, ran_out: false });
  });

  it('ends a test whose time is up even when she never comes back', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2014-09-09' });
    env.llm.script('explain', { json: testSet() });
    const s = (await startTest(l, 10)).body;
    await answer(l, s.id, s.items[0]!.item.id, '0,75');
    env.clock.minutes(10);
    // Within the allowance, the sweep leaves it alone.
    await closeIdleSessions(env.deps);
    expect(
      (
        await env.db.one<{ status: string }>(`select status from practice_sessions where id = $1`, [
          s.id,
        ])
      ).status,
    ).toBe('active');
    env.clock.advance(TIME_UP_GRACE_MS + 1_000);
    await closeIdleSessions(env.deps);
    const row = await env.db.one<{ status: string; finished_at: Date }>(
      `select status, finished_at from practice_sessions where id = $1`,
      [s.id],
    );
    expect(row.status).toBe('finished');
    const view = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(view.timer?.ran_out).toBe(true);
    expect(view.summary?.answered).toBe(1);
  });

  it("keeps another learner's test hers: 404, and her clock untouched", async () => {
    const owner = await onboard(env, { relation: 'child', name: 'Ela', birthDate: '2014-01-01' });
    const other = await onboard(env, { relation: 'child', name: 'Kai', birthDate: '2014-01-01' });
    env.llm.script('explain', { json: testSet() });
    const s = (await startTest(owner, 30)).body;
    const before = await env.db.one<{ deadline_at: Date }>(
      `select deadline_at from practice_sessions where id = $1`,
      [s.id],
    );
    env.clock.minutes(31);
    expect((await other.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    expect((await answer(other, s.id, s.items[0]!.item.id, '0,75')).status).toBe(404);
    expect(
      (await other.api.post(`/practice/sessions/${s.id}/reveal`, { item_id: s.items[0]!.item.id }))
        .status,
    ).toBe(404);
    // Her test was not ended by someone else's request.
    const after = await env.db.one<{ status: string; deadline_at: Date }>(
      `select status, deadline_at from practice_sessions where id = $1`,
      [s.id],
    );
    expect(after).toEqual({ status: 'active', deadline_at: before.deadline_at });
  });
});
