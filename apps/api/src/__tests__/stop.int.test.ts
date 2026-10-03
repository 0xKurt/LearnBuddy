// "Stopp" while Buddy writes (docs/architecture.md §Turns): a stopped turn is
// honest — her message stays, marked stopped, and nothing of the reply is
// stored or applied, even when the model's answer arrives afterwards. A turn
// that already finished stays finished. Only her own messages can be stopped.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, '0')}`;

const remember = (statement: string, quote: string) => ({
  lookups: [],
  actions: [
    { tool: 'remember', args: { about: 'everyday', kind: 'fact', statement, quote, until: null } },
  ],
  reply: `Cool – ${statement} merke ich mir.`,
  options: null,
  asks_permission: false,
});

/** A model answer that waits until the test lets it go (Buddy is still "writing"). */
type Gate = {
  release: () => void;
  wait: Promise<void>;
  called: Promise<void>;
  markCalled: () => void;
};
function gate(): Gate {
  const g = {} as Gate;
  g.wait = new Promise<void>((r) => (g.release = r));
  g.called = new Promise<void>((r) => (g.markCalled = r));
  return g;
}

async function send(env: TestEnv, l: Learner, id: string, text: string): Promise<Response> {
  return env.app.request('/v1/buddy/messages', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${l.token}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({ client_message_id: id, text }),
  });
}

async function stop(env: TestEnv, l: Learner, id: string) {
  return l.api.post<SendMessageResponse>(`/buddy/messages/${id}/stop`, {});
}

/** The `done` result of a stream. */
async function doneOf(res: Response): Promise<SendMessageResponse | null> {
  for (const block of (await res.text()).split('\n\n')) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (event === 'done' && data) return JSON.parse(data) as SendMessageResponse;
  }
  return null;
}

describe.skipIf(!dbReady)('stopping a reply', () => {
  let env: TestEnv;
  let lena: Learner;
  let tom: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    lena = await onboard(env, { relation: 'self', name: 'Lena', birthDate: '2000-02-10' });
    tom = await onboard(env, { relation: 'self', name: 'Tom', birthDate: '1999-05-01' });
  });
  afterEach(() => env.checkScript({ reset: true }));
  afterAll(async () => {
    await env?.close();
  });

  it('stops a reply being written: her message stays stopped, the late answer is not applied', async () => {
    const g = gate();
    env.llm.script('buddy_turn', async () => {
      g.markCalled();
      await g.wait;
      return remember('Spielt Handball', 'Ich spiele Handball');
    });
    const id = uuid();
    const streaming = send(env, lena, id, 'Ich spiele Handball');
    await g.called;

    const stopped = await stop(env, lena, id);
    expect(stopped.status).toBe(200);
    expect(stopped.body).toMatchObject({ status: 'failed', error_code: 'stopped' });
    const mine = stopped.body.home.thread.find((m) => m.client_message_id === id);
    expect(mine).toMatchObject({ status: 'failed', failure_code: 'stopped' });

    // The model's answer arrives after the stop: nothing of it is stored or applied.
    g.release();
    const done = await doneOf(await streaming);
    expect(done?.status).toBe('failed');
    const home = await lena.api.get<BuddyHome>('/buddy');
    expect(home.body.thread.filter((m) => m.role === 'buddy')).toEqual([]);
    expect(home.body.thread.find((m) => m.client_message_id === id)).toMatchObject({
      status: 'failed',
      failure_code: 'stopped',
    });
    const memory = await env.db.query(
      `select 1 from buddy_memories where learner_id = $1 and status = 'active'`,
      [lena.learnerId],
    );
    expect(memory).toHaveLength(0);
    // The decision the late answer carried was never applied.
    const applied = await env.db.query(
      `select 1 from buddy_decisions where learner_id = $1 and disposition = 'applied'`,
      [lena.learnerId],
    );
    expect(applied).toHaveLength(0);

    // Stopping again changes nothing.
    const again = await stop(env, lena, id);
    expect(again.body).toMatchObject({ status: 'failed', error_code: 'stopped' });
  });

  it('a turn stopped while Buddy looks something up asks the model nothing more', async () => {
    const g = gate();
    env.llm.script('buddy_turn', async () => {
      g.markCalled();
      await g.wait;
      return {
        lookups: [{ tool: 'practice_history', args: { topic: null } }],
        actions: [],
        reply: '',
        options: null,
        asks_permission: false,
      };
    });
    const id = uuid();
    const streaming = send(env, lena, id, 'wie lief es letzte woche');
    await g.called;
    await stop(env, lena, id);
    g.release();
    const done = await doneOf(await streaming);
    expect(done?.status).toBe('failed');
    // One model call only: the round after the lookup never started (afterEach: no unscripted call).
    expect(env.llm.callsFor('buddy_turn')).toHaveLength(1);
  });

  it('"Nochmal senden" after a stop answers it (same message, run again)', async () => {
    const g = gate();
    env.llm.script('buddy_turn', async () => {
      g.markCalled();
      await g.wait;
      return remember('Mag Katzen', 'ich mag Katzen');
    });
    const id = uuid();
    const streaming = send(env, lena, id, 'ich mag Katzen');
    await g.called;
    await stop(env, lena, id);
    g.release();
    await streaming;

    env.llm.script('buddy_turn', { json: remember('Mag Katzen', 'ich mag Katzen') });
    const again = await doneOf(await send(env, lena, id, 'ich mag Katzen'));
    expect(again?.error_code ?? null).toBeNull();
    expect(again?.status).toBe('done');
    const mine = again?.home.thread.find((m) => m.client_message_id === id);
    expect(mine).toMatchObject({ status: 'done', failure_code: null });
    const reply = again?.home.thread.at(-1);
    expect(reply).toMatchObject({ role: 'buddy', text: 'Cool – Mag Katzen merke ich mir.' });
  });

  it('a reply that is already there stays: stopping late says "done"', async () => {
    env.llm.script('buddy_turn', { json: remember('Liest gern', 'ich lese gern') });
    const id = uuid();
    const done = await doneOf(await send(env, lena, id, 'ich lese gern'));
    expect(done?.status).toBe('done');
    const late = await stop(env, lena, id);
    expect(late.body.status).toBe('done');
    expect(late.body.error_code).toBeNull();
    expect(late.body.home.thread.at(-1)).toMatchObject({
      role: 'buddy',
      text: 'Cool – Liest gern merke ich mir.',
    });
  });

  it("cannot stop another learner's message, or one that does not exist", async () => {
    const g = gate();
    env.llm.script('buddy_turn', async () => {
      g.markCalled();
      await g.wait;
      return remember('Spielt Schach', 'ich spiele Schach');
    });
    const id = uuid();
    const streaming = send(env, lena, id, 'ich spiele Schach');
    await g.called;

    const foreign = await stop(env, tom, id);
    expect(foreign.status).toBe(404);
    const unknown = await stop(env, lena, uuid());
    expect(unknown.status).toBe(404);
    const bad = await lena.api.post('/buddy/messages/not-a-uuid/stop', {});
    expect(bad.status).toBe(422);

    // Lena's turn went on and was answered.
    g.release();
    const done = await doneOf(await streaming);
    expect(done?.status).toBe('done');
  });
});
