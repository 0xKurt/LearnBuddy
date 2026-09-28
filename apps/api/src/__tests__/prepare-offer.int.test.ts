// Buddy prepares what he offers while she reads his reply (issue #48): tapping the offer
// opens the session without a second model call, and a preparation that fails stays silent
// until she asks for it.
// requires live verification in Claude Code session (needs a running Postgres)

import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
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
    intro: null,
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

describe.skipIf(!dbReady)('an offer is prepared in the background', () => {
  let env: TestEnv;
  let l: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('is ready when she taps, and the tap asks the model nothing', async () => {
    env.llm.script('buddy_turn', offer('Brüche üben'));
    env.llm.script('explain', generated('Brüche'));
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Ich will Brüche üben',
    });
    expect(sent.status).toBe(200);
    // Offers live on Buddy's message, not in `done` (home.ts keeps them out of there).
    const action = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(action).toBeDefined();
    // The preparation runs in the background the route started.
    await env.flushBackground();
    expect(env.llm.callsFor('explain')).toHaveLength(1);

    // Her tap sends the offer's action id as the request id: the session is already there.
    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: action!.id,
      kind: 'practice',
      text: 'Brüche üben',
    });
    expect(tapped.status === 200 || tapped.status === 201).toBe(true);
    expect(tapped.body.items).toHaveLength(1);
    expect(env.llm.callsFor('explain')).toHaveLength(1); // still one: nothing was asked twice
  });

  it('stays silent when the preparation fails — her tap prepares it as before', async () => {
    env.llm.script('buddy_turn', offer('Dreisatz üben'));
    env.llm.script('explain', { error: new LlmError('unavailable', 'model down') });
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Und Dreisatz?',
    });
    const action = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning' && a.summary.text === 'Dreisatz üben');
    expect(action).toBeDefined();
    await env.flushBackground();
    expect(sent.body.status).toBe('done');
    const sessions = await env.db.query(
      `select 1 from practice_sessions where learner_id = $1 and client_request_id = $2`,
      [l.learnerId, action!.id],
    );
    expect(sessions).toHaveLength(0);

    env.llm.script('explain', generated('Dreisatz'));
    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: action!.id,
      kind: 'practice',
      text: 'Dreisatz üben',
    });
    expect(tapped.status === 200 || tapped.status === 201).toBe(true);
    expect(tapped.body.items).toHaveLength(1);
  });
});
