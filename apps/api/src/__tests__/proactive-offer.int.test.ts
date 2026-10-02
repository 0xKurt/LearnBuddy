// Proactive, measured and capped (issue #59): what Buddy prepares before she asks is a row — her
// tap on another instance waits for it instead of paying twice, the app can ask whether it stands
// there yet (and is never told "ready" while it runs), and preparing ahead stops while her offers
// go untapped.
// requires live verification in Claude Code session (needs a running Postgres)

import type {
  OfferReadiness,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exportAccount } from '../modules/identity/privacy.js';
import { purgeSpeculations, SPECULATION } from '../modules/practice/speculation.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const offer = (text: string) => ({
  json: {
    lookups: [],
    concern: false,
    actions: [{ tool: 'offer_learning', args: { kind: 'practice', text, goal: null } }],
    reply: 'Ich bereite dir eine Übung vor.',
    options: null,
    asks_permission: false,
  },
});

const generated = (title: string) => ({
  json: {
    usable: true,
    title,
    subject: { name: 'Mathe', kind: 'math' },
    items: [
      {
        kind: 'short',
        prompt: 'Was ist 3/4 von 20?',
        answer: '15',
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
      },
    ],
  },
});

describe.skipIf(!dbReady)('preparing ahead (issue #59)', () => {
  let env: TestEnv;
  let l: Learner;
  let other: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    other = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
  });
  afterAll(async () => {
    await env?.close();
  });

  /** Buddy offers `text`; returns the offer's action id (what her tap sends). */
  async function offered(who: Learner, text: string): Promise<string> {
    env.llm.script('buddy_turn', offer(text));
    const sent = await who.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: `Ich will ${text}`,
    });
    expect(sent.status).toBe(200);
    const action = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning' && a.summary.text === text);
    expect(action).toBeDefined();
    return action!.id;
  }

  const row = (learnerId: string, requestId: string) =>
    env.db.maybeOne<{ outcome: string | null; used_at: Date | null; session_id: string | null }>(
      `select outcome, used_at, session_id from speculative_preparations
        where learner_id = $1 and client_request_id = $2`,
      [learnerId, requestId],
    );

  it('says ready only once the session stands there, and her tap is recorded as using it', async () => {
    env.llm.script('explain', generated('Brüche'));
    const id = await offered(l, 'Brüche üben');
    await env.flushBackground();
    expect((await row(l.learnerId, id))?.outcome).toBe('ready');

    const ready = await l.api.get<OfferReadiness>(`/practice/offers/${id}`);
    expect(ready.status).toBe(200);
    expect(ready.body.state).toBe('ready');
    if (ready.body.state !== 'ready') return;
    expect(ready.body.session.items).toHaveLength(1);
    // Asking is not using.
    expect((await row(l.learnerId, id))?.used_at).toBeNull();

    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: id,
      kind: 'practice',
      text: 'Brüche üben',
    });
    expect(tapped.status).toBe(201);
    expect(tapped.body.id).toBe(ready.body.session.id);
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    expect((await row(l.learnerId, id))?.used_at).not.toBeNull();
  });

  it("says nothing about another learner's offer, or one nobody prepares", async () => {
    const [mine] = await env.db.query<{ client_request_id: string }>(
      `select client_request_id from speculative_preparations where learner_id = $1 limit 1`,
      [l.learnerId],
    );
    const theirs = await other.api.get<OfferReadiness>(
      `/practice/offers/${mine!.client_request_id}`,
    );
    expect(theirs.body).toEqual({ state: 'none' });
    const unknown = await l.api.get<OfferReadiness>(`/practice/offers/${randomUUID()}`);
    expect(unknown.body).toEqual({ state: 'none' });
    const bad = await l.api.get('/practice/offers/not-an-id');
    expect(bad.status).toBe(422);
  });

  it('her tap on another instance waits for the running preparation instead of asking twice', async () => {
    const requestId = randomUUID();
    // Another instance claimed it a moment ago and is writing the questions.
    await env.db.query(
      `insert into speculative_preparations (learner_id, client_request_id, kind, started_at)
       values ($1, $2, 'offer', $3)`,
      [l.learnerId, requestId, env.clock.now()],
    );
    const asked = await l.api.get<OfferReadiness>(`/practice/offers/${requestId}`);
    expect(asked.body).toEqual({ state: 'preparing' });

    const calls = env.llm.callsFor('explain').length;
    const tap = l.api.post<SessionView>('/practice/topic', {
      client_request_id: requestId,
      kind: 'practice',
      text: 'Prozente üben',
    });
    await new Promise((r) => setTimeout(r, 400));
    // … and the other instance stores its first questions.
    const made = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, started_at, last_activity_at, client_request_id)
       values ($1, $2, $2, $3) returning id`,
      [l.learnerId, env.clock.now(), requestId],
    );
    const tapped = await tap;
    expect(tapped.status).toBe(201);
    expect(tapped.body.id).toBe(made.id);
    expect(env.llm.callsFor('explain')).toHaveLength(calls); // nothing asked a second time
  });

  it('a preparation that found nothing to learn answers her tap without another call', async () => {
    const requestId = randomUUID();
    await env.db.query(
      `insert into speculative_preparations
         (learner_id, client_request_id, kind, started_at, finished_at, outcome)
       values ($1, $2, 'offer', $3, $3, 'refused')`,
      [l.learnerId, requestId, env.clock.now()],
    );
    const calls = env.llm.callsFor('explain').length;
    const tapped = await l.api.post<{ error: { details?: { reason?: string } } }>(
      '/practice/topic',
      { client_request_id: requestId, kind: 'practice', text: 'asdf qwer' },
    );
    expect(tapped.status).toBe(422);
    expect(tapped.body.error.details?.reason).toBe('not_usable');
    expect(env.llm.callsFor('explain')).toHaveLength(calls);
  });

  it('a failed or dead preparation lets her tap prepare it as before', async () => {
    const failed = randomUUID();
    await env.db.query(
      `insert into speculative_preparations
         (learner_id, client_request_id, kind, started_at, finished_at, outcome)
       values ($1, $2, 'offer', $3, $3, 'failed')`,
      [l.learnerId, failed, env.clock.now()],
    );
    env.llm.script('explain', generated('Dreisatz'));
    const a = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: failed,
      kind: 'practice',
      text: 'Dreisatz üben',
    });
    expect(a.status).toBe(201);

    // Claimed long ago and never finished: the instance died with it.
    const dead = randomUUID();
    await env.db.query(
      `insert into speculative_preparations (learner_id, client_request_id, kind, started_at)
       values ($1, $2, 'offer', $3)`,
      [l.learnerId, dead, new Date(env.clock.now().getTime() - 3 * 60_000)],
    );
    expect((await l.api.get<OfferReadiness>(`/practice/offers/${dead}`)).body).toEqual({
      state: 'none',
    });
    env.llm.script('explain', generated('Zinsen'));
    const b = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: dead,
      kind: 'practice',
      text: 'Zinsen üben',
    });
    expect(b.status).toBe(201);
  });

  it('stops preparing ahead while her offers go untapped, and starts again once she taps', async () => {
    const tom = other;
    const ids: string[] = [];
    for (let i = 0; i < SPECULATION.window; i++) {
      env.llm.script('explain', generated(`Runde ${i}`));
      ids.push(await offered(tom, `Thema ${i} üben`));
      await env.flushBackground();
    }
    // Half an hour later none of them was tapped.
    env.clock.minutes(SPECULATION.settleMinutes + 1);
    let calls = env.llm.callsFor('explain').length;
    const braked = await offered(tom, 'Noch ein Thema üben');
    await env.flushBackground();
    expect(env.llm.callsFor('explain')).toHaveLength(calls); // no call ahead
    expect(await row(tom.learnerId, braked)).toBeNull();
    expect((await tom.api.get<OfferReadiness>(`/practice/offers/${braked}`)).body).toEqual({
      state: 'none',
    });
    // Her tap still works — it prepares, as before #48.
    env.llm.script('explain', generated('Noch eins'));
    const tapped = await tom.api.post<SessionView>('/practice/topic', {
      client_request_id: braked,
      kind: 'practice',
      text: 'Noch ein Thema üben',
    });
    expect(tapped.status).toBe(201);

    // She taps two of the older ones: the brake lifts.
    for (const id of ids.slice(-2)) {
      await tom.api.post('/practice/topic', {
        client_request_id: id,
        kind: 'practice',
        text: 'egal',
      });
    }
    env.clock.minutes(SPECULATION.settleMinutes + 1);
    calls = env.llm.callsFor('explain').length;
    env.llm.script('explain', generated('Wieder'));
    const again = await offered(tom, 'Wieder ein Thema üben');
    await env.flushBackground();
    expect(env.llm.callsFor('explain')).toHaveLength(calls + 1);
    expect((await row(tom.learnerId, again))?.outcome).toBe('ready');
  });

  it(`prepares at most ${SPECULATION.perDay} offers ahead a day`, async () => {
    const fresh = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-03-01' });
    for (let i = 0; i < SPECULATION.perDay; i++) {
      await env.db.query(
        `insert into speculative_preparations
           (learner_id, client_request_id, kind, started_at, finished_at, outcome, used_at)
         values ($1, $2, 'offer', $3, $3, 'ready', $3)`,
        [fresh.learnerId, randomUUID(), env.clock.now()],
      );
    }
    const calls = env.llm.callsFor('explain').length;
    const id = await offered(fresh, 'Vokabeln üben');
    await env.flushBackground();
    expect(env.llm.callsFor('explain')).toHaveLength(calls);
    expect(await row(fresh.learnerId, id)).toBeNull();
  });

  it('is in her export', async () => {
    const { account_id } = await env.db.one<{ account_id: string }>(
      `select account_id from learners where id = $1`,
      [l.learnerId],
    );
    const exported = await exportAccount(env.db, account_id);
    expect((exported.speculative_preparations as unknown[]).length).toBeGreaterThan(0);
  });

  it('forgets what was prepared ahead after 30 days', async () => {
    const before = await env.db.one<{ n: number }>(
      `select count(*)::int as n from speculative_preparations`,
    );
    expect(before.n).toBeGreaterThan(0);
    env.clock.minutes(31 * 24 * 60);
    await purgeSpeculations(env.deps);
    const after = await env.db.one<{ n: number }>(
      `select count(*)::int as n from speculative_preparations`,
    );
    expect(after.n).toBe(0);
  });
});
