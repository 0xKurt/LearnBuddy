// What `llm_calls` says about a call beyond its purpose (issue #652, migration 0107): the
// decision it was a round of, which round, which schema variant went out, whether it streamed and
// when its first text came, how often the gateway sent it and the whole wait. Only the model is
// scripted; a gateway's retries are stood in for by the attempts it reports (`llm/retry.ts`).
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type Traced = {
  purpose: string;
  decision_id: string | null;
  round: number | null;
  schema_variant: string | null;
  streamed: boolean;
  first_token_ms: number | null;
  attempts: number;
  total_ms: number | null;
  outcome: string;
  error_code: string | null;
};

const traced = (env: TestEnv, l: Learner) =>
  env.db.query<Traced>(
    `select purpose, decision_id, round, schema_variant, streamed, first_token_ms, attempts,
            total_ms, outcome, error_code
       from llm_calls where learner_id = $1 order by round nulls last, created_at`,
    [l.learnerId],
  );

const lookup = {
  lookups: [{ tool: 'practice_history', args: { topic: null } }],
  reply: '…',
  options: null,
  actions: [],
};
const answer = {
  lookups: [],
  reply: 'Noch nichts geübt – wollen wir anfangen?',
  options: null,
  actions: [],
};

describe.skipIf(!dbReady)('the trace of a model call (#652)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-15T08:00:00Z' });
    lena = await onboard(env, { name: 'Lena' });
  });
  afterEach(() => env.closeChecked());

  it('names the decision and the round of every call of a streamed turn', async () => {
    env.llm.script('buddy_turn', { json: lookup }, { json: lookup }, { json: answer });
    const res = await env.app.request('/v1/buddy/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${lena.token}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({ client_message_id: randomUUID(), text: 'Wie lief mein Üben?' }),
    });
    expect(await res.text()).toContain('event: done');
    const decision = await env.db.one<{ id: string }>(
      `select id from buddy_decisions where learner_id = $1 and disposition = 'applied'`,
      [lena.learnerId],
    );
    const calls = await traced(env, lena);
    expect(calls.map((c) => [c.decision_id, c.round, c.schema_variant])).toEqual([
      // A new learner: nothing in STATE to correct, close, tick off or rename (#668).
      [decision.id, 1, 'step, no memories,goals,steps,materials'],
      [decision.id, 2, 'step, no memories,goals,steps,materials'],
      // After two lookup rounds the schema without lookups goes out (MAX_LOOKUP_STEPS).
      [decision.id, 3, 'final, no memories,goals,steps,materials'],
    ]);
    for (const c of calls) {
      expect(c).toMatchObject({ streamed: true, attempts: 1, outcome: 'ok' });
      expect(c.first_token_ms).not.toBeNull();
      expect(c.total_ms).toBeGreaterThanOrEqual(c.first_token_ms!);
    }
  });

  it('keeps how often a throttled call was sent, on the failed decision it belonged to', async () => {
    const throttled = new LlmError('rate_limited', 'provider rate limit');
    throttled.attempts = 3;
    env.llm.script('buddy_turn', { error: throttled });
    const res = await lena.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Hallo',
    });
    expect(res.body.status).toBe('failed');
    const [call] = await traced(env, lena);
    expect(call).toMatchObject({
      purpose: 'buddy_turn',
      streamed: false,
      first_token_ms: null,
      attempts: 3,
      outcome: 'error',
      error_code: 'rate_limited',
      round: 1,
    });
    const decision = await env.db.one<{ id: string; disposition: string }>(
      `select id, disposition from buddy_decisions where learner_id = $1`,
      [lena.learnerId],
    );
    expect(decision.disposition).toBe('failed');
    expect(call!.decision_id).toBe(decision.id);
  });

  it('says which schema a practice run went out with', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Brüche',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          {
            kind: 'short',
            prompt: 'Wie heißt die Zahl unter dem Bruchstrich?',
            answer: 'Nenner',
            accepted_answers: [],
            unit: null,
            choices: null,
            correct_choice: null,
            topic: 'Brüche',
            difficulty: 1,
            source_excerpt: null,
          },
        ],
        structured: [],
      },
    });
    // A test: no hints are written for it.
    const res = await lena.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'test',
      text: 'Brüche',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    const [run] = (await traced(env, lena)).filter((c) => c.purpose === 'explain');
    // The whole test schema is past what Vertex serves, so a choice was made first (#627); plain
    // questions need no form or figure, so the minimal set went out.
    expect(run?.schema_variant).toBe('minimal');
    expect(run?.decision_id).toBeNull();
  });
});
