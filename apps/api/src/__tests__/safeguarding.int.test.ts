// Safeguarding for children (audit I-9: H-31 p2-T2, H-32 p2-blocked-disclosure-poisons-thread,
// M-9 p2-disclosures-become-memories, M-17 p2-T8). docs/architecture.md §Turns, D-10.
// requires live verification in Claude Code session (needs a running Postgres; the model is
// scripted — whether Vertex really blocks such messages needs a live run, see evals/buddy)

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LlmError, type LlmRequest } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-a000-${(++seq).toString(16).padStart(12, '0')}`;

async function send(l: Learner, text: string, id = uuid()) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: id,
    text,
  });
  return { ...res, id };
}

const DISCLOSURE = 'die in meiner klasse sagen ich soll mich umbringen';

describe.skipIf(!dbReady)('safeguarding', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
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

  it('a safety block gets the fixed caring reply, costs no budget, and never mutes Buddy', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    env.llm.script('buddy_turn', {
      error: new LlmError('blocked', 'finish reason SAFETY', null, 'SAFETY'),
    });
    const blocked = await send(l, DISCLOSURE);
    // Not a glitch to resend: answered, by code, with the helpline for her language.
    expect(blocked.body.status).toBe('done');
    expect(blocked.body.error_code).toBeNull();
    const thread = blocked.body.home.thread;
    const mine = thread.find((m) => m.role === 'learner');
    expect(mine).toMatchObject({ status: 'done', failure_code: 'blocked' });
    const reply = thread[thread.length - 1]!;
    expect(reply.role).toBe('buddy');
    expect(reply.text).toContain('116 111');
    // The block is on record with its finish reason, and her allowance is untouched.
    const calls = await env.db.query<{ error_code: string }>(
      `select error_code from llm_calls where learner_id = $1`,
      [l.learnerId],
    );
    expect(calls.map((c) => c.error_code)).toEqual(['blocked:SAFETY']);
    const usage = await env.db.maybeOne<{ calls: number }>(
      `select calls from usage_daily where learner_id = $1 and kind = 'buddy_turn'`,
      [l.learnerId],
    );
    expect(usage?.calls ?? 0).toBe(0);

    // The next message is answered normally: her blocked words are not sent again.
    let seen = '';
    env.llm.script('buddy_turn', (req: LlmRequest) => {
      seen = ScriptedGateway.textOf(req);
      return { concern: false, reply: 'Klar, lass uns Mathe üben.', options: null, actions: [] };
    });
    const next = await send(l, 'Wollen wir Mathe üben?');
    expect(next.body.status).toBe('done');
    expect(seen).not.toContain('umbringen');
    expect(seen).toContain('Schutzfilter');
    expect(seen).toContain('Wollen wir Mathe üben?');
  });

  it('a distress message gets the code-owned reply and is never remembered', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    const text = 'Mein Papa hat mich wieder geschlagen';
    env.llm.script(
      'buddy_turn',
      // The model flags the concern but also tries to remember it: refused by code …
      {
        json: {
          concern: true,
          reply: 'Oh nein.',
          options: null,
          actions: [
            {
              tool: 'remember',
              args: {
                kind: 'fact',
                statement: 'Wird zu Hause geschlagen',
                quote: 'geschlagen',
                until: null,
              },
            },
          ],
        },
      },
      // … so it answers again without it.
      {
        json: { concern: true, reply: 'Das tut mir leid.', options: ['Ok', 'Danke'], actions: [] },
      },
    );
    const res = await send(l, text);
    expect(res.body.status).toBe('done');
    const reply = res.body.home.thread[res.body.home.thread.length - 1]!;
    expect(reply.text).toContain('116 111');
    expect(reply.text).not.toContain('Das tut mir leid');
    expect(reply.options).toBeNull();
    const memories = await env.db.query(`select 1 from buddy_memories where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(memories).toHaveLength(0);
    const rejected = await env.db.query<{ errors: string[] }>(
      `select errors from buddy_decisions where learner_id = $1 and disposition = 'rejected'`,
      [l.learnerId],
    );
    expect(JSON.stringify(rejected)).toContain('concern');
  });

  it('adults get the variant without the children’s helpline', async () => {
    const l = await onboard(env);
    env.llm.script('buddy_turn', {
      json: { concern: true, reply: 'x', options: null, actions: [] },
    });
    const res = await send(l, 'Mir geht es richtig schlecht, ich will nicht mehr');
    const reply = res.body.home.thread[res.body.home.thread.length - 1]!;
    expect(reply.text).toContain('112');
    expect(reply.text).not.toContain('116 111');
  });

  it('a failed message says why, and resending clears it', async () => {
    const l = await onboard(env);
    env.llm.script('buddy_turn', { error: new LlmError('unavailable', 'down') });
    const failed = await send(l, 'Hallo Buddy');
    expect(failed.body).toMatchObject({ status: 'failed', error_code: 'model_unavailable' });
    expect(failed.body.home.thread[0]).toMatchObject({
      status: 'failed',
      failure_code: 'model_unavailable',
    });
    env.llm.script('buddy_turn', {
      json: { concern: false, reply: 'Hallo!', options: null, actions: [] },
    });
    const again = await send(l, 'Hallo Buddy', failed.id);
    expect(again.body.status).toBe('done');
    const home = await l.api.get<BuddyHome>('/buddy');
    expect(home.body.thread[0]).toMatchObject({ status: 'done', failure_code: null });
  });

  it('a sheet the safety filter refuses to read fails for good, with no retry offered', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    env.llm.script('extraction', {
      error: new LlmError('blocked', 'finish reason SAFETY', null, 'SAFETY'),
    });
    const created = await l.api.post<{
      material: { id: string };
      uploads: Array<{ path: string }>;
    }>('/materials', { client_request_id: uuid(), photo_mimes: ['image/jpeg'] });
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    // Buddy's reaction to the finished reading finds nothing to work with (no model call).
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();
    const id = created.body.material.id;
    const m = await l.api.get<{ status: string; failure_reason: string }>(`/materials/${id}`);
    expect(m.body).toMatchObject({ status: 'failed', failure_reason: 'blocked' });
    expect((await l.api.post(`/materials/${id}/retry`)).status).toBe(409);
    const home = await l.api.get<BuddyHome>('/buddy');
    expect(home.body.now).toMatchObject({ type: 'material_failed', retryable: false });
    const res = await env.app.request('/v1/internal/tick', {
      method: 'POST',
      headers: { 'x-tick-secret': TEST_TICK_SECRET },
    });
    expect(res.status).toBe(200);
    expect(env.llm.callsFor('extraction')).toHaveLength(1);
  });
});
