// The kind of picture she asks for reaches the run (#724). On the phone, "Ich will Brüche addieren
// mit Kreisbildern üben" gave a run without a single picture: the wish lived only in the offer's
// free text, and the form choice (#627, #700) ranked figures without it. Now Buddy's offer
// carries it as structured output — figure types from a closed list — and the run's choice takes
// those types first:
//   - an offer with pictures keeps them, and the prepared run's schema offers them even when the
//     choosing call ranks none, and its prompt says so (a principle, no sample question);
//   - when no choice can be made, the wished types still go out with the plain questions;
//   - pictures on a kind that writes no figure are refused.
// Whether the live model sets the field when she asks is an eval, not this test.
// requires live verification in Claude Code session (needs a running Postgres; the model is scripted)

import { randomUUID } from 'node:crypto';

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError, type LlmRequest } from '../llm/gateway.js';
import { offered } from '../modules/practice/formChoice.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const FRACTION = { type: 'fraction', shape: 'circle', fractions: [{ parts: 4, filled: 1 }] };

const turn = (over: Record<string, unknown>) => ({
  lookups: [],
  concern: false,
  also_asked: false,
  actions: [],
  reply: 'Deine Übung ist bereit.',
  options: null,
  asks_permission: false,
  ...over,
});

const SET = {
  usable: true,
  title: 'Brüche',
  subject: { name: 'Mathe', kind: 'math' },
  items: [
    {
      kind: 'short',
      prompt: 'Welcher Bruch ist gefärbt?',
      answer: '1/4',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Brüche',
      difficulty: 2,
      source_excerpt: null,
      figure: FRACTION,
    },
  ],
};

const offer = (args: Record<string, unknown>) => ({
  tool: 'offer_learning',
  args: { kind: 'practice', text: 'Brüche addieren', goal: null, ...args },
});

describe.skipIf(!dbReady)('the picture she asks for (#724)', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-14T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(() => env.closeChecked());

  const say = async (text: string) => {
    const res = await l.api.post('/buddy/messages', { client_message_id: randomUUID(), text });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  };
  const offers = () =>
    env.db.query<{ id: string; result: { figures?: string[] } }>(
      `select id, result from buddy_actions where learner_id = $1 and tool = 'offer_learning'
        order by seq`,
      [l.learnerId],
    );

  it('carries her wish from the offer into the run, before anything the choice ranks', async () => {
    env.llm.script('buddy_turn', {
      json: turn({
        actions: [offer({ pictures: ['fraction'] })],
      }),
    });
    // The choosing call ranks no figure at all: the wish is not the choice's to drop.
    env.llm.scriptChoice({ json: { forms: [], figures: [] } });
    env.llm.script('explain', { json: SET });
    await say('Ich will Brüche addieren mit Kreisbildern üben');
    await env.flushBackground();

    const [o] = await offers();
    expect(o!.result.figures).toEqual(['fraction']);
    const [main] = env.llm.callsFor('explain');
    expect(offered(main!.schema).figures).toEqual(['fraction']);
    expect(ScriptedGateway.textOf(main!)).toContain('PICTURES: she asked to see fraction.');
    const row = await env.db.one<{ figure: { type: string } | null }>(
      `select figure from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(row.figure?.type).toBe('fraction');
  });

  it('says on the card whether the prepared run has a picture, from the set itself (#842)', async () => {
    // Device 16.10. and the probe of 17.10.: Buddy wrote "mit Abbildungen" in 4 of 5 replies, and
    // one run then held none. The words are the model's; the card's line is code's, read from
    // the questions the offer prepared — so a claim the set does not keep never stands alone.
    const card = async () =>
      (
        await l.api.get<{
          thread: Array<{ actions: Array<{ summary: Record<string, unknown> }> }>;
        }>('/buddy')
      ).body.thread
        .flatMap((m) => m.actions)
        .find((a) => a.summary.tool === 'offer_learning')!.summary;
    env.llm.script('buddy_turn', { json: turn({ actions: [offer({ pictures: ['fraction'] })] }) });
    env.llm.scriptChoice({ json: { forms: [], figures: [] } });
    env.llm.script('explain', {
      json: {
        ...SET,
        items: [{ ...SET.items[0]!, figure: null, prompt: 'Was ist 1/4 + 1/4?', answer: '1/2' }],
      },
    });
    await say('Ich will Brüche addieren mit Kreisbildern üben');
    await env.flushBackground();
    expect(await card()).toMatchObject({ figures: ['fraction'], pictures_shown: false });

    env.llm.script('buddy_turn', {
      json: turn({ actions: [offer({ text: 'Brüche kürzen', pictures: ['fraction'] })] }),
    });
    env.llm.scriptChoice({ json: { forms: [], figures: [] } });
    env.llm.script('explain', { json: SET });
    await say('Und Brüche kürzen, auch mit Kreisbildern');
    await env.flushBackground();
    const both = (
      await l.api.get<{ thread: Array<{ actions: Array<{ summary: Record<string, unknown> }> }> }>(
        '/buddy',
      )
    ).body.thread
      .flatMap((m) => m.actions)
      .filter((a) => a.summary.tool === 'offer_learning')
      .map((a) => a.summary.pictures_shown);
    expect(both).toEqual([false, true]);
  });

  it('keeps the home asking while the offer is prepared, so its picture line arrives (#859)', async () => {
    // Device 17.10.: "Mit Bild" stood only after her first tap — the run was ready in the
    // background, but nothing was in progress for the home, so it was not asked again.
    const poll = async () =>
      (await l.api.get<{ poll_after_ms: number | null }>('/buddy')).body.poll_after_ms;
    env.holdBackground();
    env.llm.script('buddy_turn', { json: turn({ actions: [offer({ pictures: ['fraction'] })] }) });
    env.llm.scriptChoice({ json: { forms: [], figures: [] } });
    env.llm.script('explain', { json: SET });
    await say('Ich will Brüche addieren mit Kreisbildern üben');
    // Being prepared: asked again soon.
    expect(await poll()).toBe(3000);
    await env.flushBackground();
    // Prepared: the line is there, nothing left to wait for.
    expect(await poll()).toBeNull();
  });

  it('stops asking for an offer whose preparation never came (#859)', async () => {
    env.holdBackground();
    env.llm.script('buddy_turn', { json: turn({ actions: [offer({ pictures: ['fraction'] })] }) });
    // It runs only once the test ends: until then it never came.
    env.llm.scriptChoice({ json: { forms: [], figures: [] } });
    env.llm.script('explain', { json: SET });
    await say('Ich will Brüche addieren mit Kreisbildern üben');
    env.clock.advance(3 * 60_000);
    expect(
      (await l.api.get<{ poll_after_ms: number | null }>('/buddy')).body.poll_after_ms,
    ).toBeNull();
  });

  it('keeps the wished types when no choice can be made', async () => {
    env.llm.scriptChoice({ error: new LlmError('unavailable', 'provider down') });
    env.llm.script('explain', { json: SET });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Brüche addieren',
      figures: ['fraction'],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [main] = env.llm.callsFor('explain');
    expect(offered(main!.schema).figures).toEqual(['fraction']);
  });

  it('never takes a wish on a kind that writes no figure', async () => {
    const repairs: string[] = [];
    const refused = (req: LlmRequest) => {
      const m = /action 1 \(offer_learning\): ([^\n]+)/.exec(ScriptedGateway.textOf(req));
      repairs.push(m ? m[1]! : '');
    };
    // Vocabulary writes no figure.
    const vocab = (pictures: string[] | null) =>
      turn({
        actions: [
          {
            tool: 'offer_learning',
            args: { kind: 'vocab', text: 'chien – Hund', goal: null, pictures },
          },
        ],
      });
    env.llm.script('buddy_turn', { json: vocab(['fraction']) }, (req) => {
      refused(req);
      return vocab(null);
    });
    env.llm.script('explain', {
      json: { usable: true, title: 'Vokabeln', subject: null, items: [] },
    });
    await say('Frag mich chien – Hund ab, mit Bildern');
    await env.flushBackground();
    expect(repairs[0]).toContain('pictures only go with practice or a practice test');
    for (const o of await offers()) expect(o.result.figures).toEqual([]);
  });
});
