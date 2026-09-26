// Buddy's reply streamed while it is written (docs/architecture.md §Speed):
// a reply that changes nothing may be shown and spoken at once; one whose
// answer changes something is only marked speakable never, and shows once it
// is applied. Failures end the stream honestly.
// requires live verification in Claude Code session (needs a running Postgres)

import type { ReplyStreamEvent, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, '0')}`;

/** An answer in the order the model writes it: lookups, actions, reply, … */
const answer = (reply: string, actions: unknown[] = []) => ({
  json: { lookups: [], actions, reply, options: null, asks_permission: false },
});

type Streamed = {
  status: number;
  type: string | null;
  replies: ReplyStreamEvent[];
  done: SendMessageResponse | null;
  error: { code: string } | null;
};

async function stream(env: TestEnv, l: Learner, text: string, id = uuid()): Promise<Streamed> {
  const res = await env.app.request('/v1/buddy/messages', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${l.token}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({ client_message_id: id, text }),
  });
  const out: Streamed = {
    status: res.status,
    type: res.headers.get('content-type'),
    replies: [],
    done: null,
    error: null,
  };
  for (const block of (await res.text()).split('\n\n')) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (!event || !data) continue;
    if (event === 'reply') out.replies.push(JSON.parse(data) as ReplyStreamEvent);
    if (event === 'done') out.done = JSON.parse(data) as SendMessageResponse;
    if (event === 'error') out.error = JSON.parse(data) as { code: string };
  }
  return out;
}

describe.skipIf(!dbReady)('streamed replies', () => {
  let env: TestEnv;
  let l: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    env.llm.reset();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('streams a reply that changes nothing as speakable, then the stored result', async () => {
    env.llm.script('buddy_turn', answer('Ein Nenner ist die Zahl unter dem Bruchstrich.'));
    const s = await stream(env, l, 'was ist ein nenner');
    expect(s.status).toBe(200);
    expect(s.type).toContain('text/event-stream');
    expect(s.replies.length).toBeGreaterThan(0);
    expect(s.replies.every((r) => r.round === 1 && r.speakable)).toBe(true);
    // Only ever growing, and complete at the end.
    for (let i = 1; i < s.replies.length; i++)
      expect(s.replies[i]!.text.startsWith(s.replies[i - 1]!.text)).toBe(true);
    expect(s.replies.at(-1)).toMatchObject({
      text: 'Ein Nenner ist die Zahl unter dem Bruchstrich.',
      done: true,
    });
    expect(s.done?.status).toBe('done');
    expect(s.done?.home.thread.at(-1)).toMatchObject({
      role: 'buddy',
      text: 'Ein Nenner ist die Zahl unter dem Bruchstrich.',
    });
  });

  it('never marks a reply speakable whose answer changes something', async () => {
    env.llm.script(
      'buddy_turn',
      answer('Notiert – Handball!', [
        {
          tool: 'remember',
          args: {
            kind: 'fact',
            statement: 'Spielt Handball',
            quote: 'Ich spiele Handball',
            until: null,
          },
        },
      ]),
    );
    const s = await stream(env, l, 'Ich spiele Handball');
    expect(s.replies.length).toBeGreaterThan(0);
    expect(s.replies.some((r) => r.speakable)).toBe(false);
    expect(s.done?.status).toBe('done');
    expect(s.done?.home.thread.at(-1)?.actions[0]?.summary.tool).toBe('remember');
  });

  it('starts a new round when an answer is rejected and repaired', async () => {
    const bad = {
      json: { lookups: [], actions: [], reply: '', options: null, asks_permission: false },
    };
    env.llm.script('buddy_turn', bad, answer('Klar, frag mich!'));
    const s = await stream(env, l, 'hilf mir');
    expect(s.replies.at(-1)).toMatchObject({ round: 2, text: 'Klar, frag mich!', speakable: true });
    expect(s.done?.home.thread.at(-1)?.text).toBe('Klar, frag mich!');
  });

  it('ends with the failure when the model is down, and replays a finished turn without a reply stream', async () => {
    env.llm.script('buddy_turn', { error: new LlmError('unavailable', 'provider down') });
    const down = await stream(env, l, 'Hallo?');
    expect(down.replies).toEqual([]);
    expect(down.done).toMatchObject({ status: 'failed', error_code: 'model_unavailable' });

    const id = uuid();
    env.llm.script('buddy_turn', answer('Hallo Lena!'));
    expect((await stream(env, l, 'Hallo', id)).done?.status).toBe('done');
    const again = await stream(env, l, 'Hallo', id);
    expect(again.replies).toEqual([]);
    expect(again.done?.status).toBe('done');
  });

  it('refuses a stream without a valid learner or body before streaming', async () => {
    const res = await env.app.request('/v1/buddy/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ client_message_id: uuid(), text: 'x' }),
    });
    expect(res.status).toBe(401);
    const bad = await env.app.request('/v1/buddy/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${l.token}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({ client_message_id: 'nope', text: '' }),
    });
    expect(bad.status).toBe(422);
    expect(bad.headers.get('content-type')).toContain('application/json');
  });
});
