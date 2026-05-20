// Agent v2 route smoke tests.
//
// Covers the one-screen agent end-to-end through the fake LLM:
//   - POST /agent/sessions seeds the queue + the opener + first question
//   - POST /agent/sessions/:id/turn calls the LLM, persists the verdict,
//     and advances when the model says advance=true
//   - The hint counter is server-recorded, not LLM-supplied
//   - Idempotency: same client_turn_id replays the prior tutor reply

import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { FakeLlmGateway } from '../../test/fake-llm.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup(email = 'agent@example.com', llm = new FakeLlmGateway()) {
  const deps = createTestDeps({ llm });
  const app = createApp({ deps });
  const fake = getFake(deps);
  const signup = await app.request('/auth/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'super-secret-1', locale: 'de', country_code: 'DE' }),
  });
  const { user_id, account_id } = (await signup.json()) as { user_id: string; account_id: string };
  const token = fake.authenticate(user_id, email);
  const learnerRes = await app.request('/learners', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      display_name: 'Lena',
      birth_date: '2010-01-15',
      grade_level: 7,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'text',
    }),
  });
  const learner = (await learnerRes.json()) as { id: string };
  return { app, deps, fake, token, account_id, learnerId: learner.id };
}

function authed(s: Setup) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${s.token}`,
    'x-learner-id': s.learnerId,
  } as Record<string, string>;
}

function seedItem(s: Setup, opts: { question: string; expected: string; topic?: string }): string {
  const id = s.fake.nextId();
  const items = s.fake.tables.get('items') ?? [];
  items.push({
    id,
    learner_id: s.learnerId,
    material_id: s.fake.nextId(),
    question: opts.question,
    expected_answer: opts.expected,
    acceptable_answers: [],
    answer_kind: 'short',
    stimulus_kind: 'none',
    stimulus_data: {},
    difficulty: 2,
    language: 'de',
    topic: opts.topic ?? 'Addition',
    archived_at: null,
  });
  s.fake.tables.set('items', items);
  return id;
}

type SseEvent = { type: string; [k: string]: unknown };
function parseSse(text: string): SseEvent[] {
  return text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => JSON.parse(l.slice(5).trim()) as SseEvent);
}

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';

async function turn(
  s: Setup,
  sessionId: string,
  clientId: string,
  body: { text?: string },
): Promise<SseEvent[]> {
  const res = await s.app.request(`/agent/sessions/${sessionId}/turn`, {
    method: 'POST',
    headers: authed(s),
    body: JSON.stringify({ client_turn_id: clientId, ...body }),
  });
  return parseSse(await res.text());
}

describe('POST /agent/sessions', () => {
  it('seeds the session with opener + first question + queue', async () => {
    const s = await setup();
    seedItem(s, { question: 'Was ist 2 + 2?', expected: '4' });
    seedItem(s, { question: 'Was ist 3 + 5?', expected: '8' });

    const res = await s.app.request('/agent/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ max_items: 5 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      session_id: string;
      items: Array<{ id: string }>;
      opener: string;
      first_question: string;
    };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.opener).toMatch(/Lena/);
    expect(body.first_question).toBe('Was ist 2 + 2?');
    const turns = s.fake.tables.get('conversation_turns') ?? [];
    // Single seed tutor turn containing opener + first question
    // (Gemini convention: alternating user/model — no consecutive
    // model turns).
    expect(turns.length).toBe(1);
    expect(turns[0]?.intent).toBe('introduce_next');
    expect(String(turns[0]?.content)).toContain('Lena');
    expect(String(turns[0]?.content)).toContain('Was ist 2 + 2?');
  });
});

describe('POST /agent/sessions/:id/turn', () => {
  it('evaluates a correct answer and signals advance=true', async () => {
    const s = await setup();
    seedItem(s, { question: 'Was ist 2 + 2?', expected: '4' });
    seedItem(s, { question: 'Was ist 3 + 5?', expected: '8' });
    const createdRes = await s.app.request('/agent/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ max_items: 5 }),
    });
    const created = (await createdRes.json()) as { session_id: string };

    const events = await turn(s, created.session_id, C1, { text: '4' });
    const done = events.find((e) => e.type === 'done');
    expect(done?.verdict).toBe('correct');
    expect(done?.advance).toBe(true);
    expect(done?.hint_given).toBe(false);
    expect(events.some((e) => e.type === 'reply' && typeof e.text === 'string')).toBe(true);
  });

  it('on wrong answer: gives a hint and does NOT advance', async () => {
    const s = await setup();
    seedItem(s, { question: 'Was ist 2 + 2?', expected: '4' });
    const createdRes = await s.app.request('/agent/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ max_items: 5 }),
    });
    const created = (await createdRes.json()) as { session_id: string };

    const events = await turn(s, created.session_id, C1, { text: '5' });
    const done = events.find((e) => e.type === 'done');
    expect(done?.verdict).toBe('incorrect');
    expect(done?.advance).toBe(false);
    expect(done?.hint_given).toBe(true);
  });

  it('after two hints + wrong → reveal + advance', async () => {
    const s = await setup();
    seedItem(s, { question: 'Was ist 2 + 2?', expected: '4' });
    seedItem(s, { question: 'Was ist 3 + 5?', expected: '8' });
    const createdRes = await s.app.request('/agent/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ max_items: 5 }),
    });
    const created = (await createdRes.json()) as { session_id: string };

    await turn(s, created.session_id, C1, { text: '5' }); // hint 1
    await turn(s, created.session_id, C2, { text: '6' }); // hint 2
    const events = await turn(s, created.session_id, C3, { text: '7' }); // reveal
    const done = events.find((e) => e.type === 'done');
    expect(done?.reveal).toBe(true);
    expect(done?.advance).toBe(true);
    // Reveal must NOT be marked correct.
    expect(done?.verdict).not.toBe('correct');
    expect(done?.verdict).not.toBe('partially_correct');
  });

  it('idempotent replay: same client_turn_id returns the prior tutor reply, no second LLM call', async () => {
    const captured: number[] = [];
    class SpyLlm extends FakeLlmGateway {
      override async agentTurn(input: Parameters<FakeLlmGateway['agentTurn']>[0]) {
        captured.push(captured.length + 1);
        return super.agentTurn(input);
      }
    }
    const s = await setup('idem@example.com', new SpyLlm());
    seedItem(s, { question: 'Was ist 2 + 2?', expected: '4' });
    const createdRes = await s.app.request('/agent/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ max_items: 5 }),
    });
    const created = (await createdRes.json()) as { session_id: string };

    const first = await turn(s, created.session_id, C1, { text: '4' });
    const replay = await turn(s, created.session_id, C1, { text: '4' });
    expect(captured.length).toBe(1);
    const firstDone = first.find((e) => e.type === 'done');
    const replayDone = replay.find((e) => e.type === 'done');
    expect(replayDone?.replayed).toBe(true);
    expect(replayDone?.verdict).toBe(firstDone?.verdict);
  });

  it('give-up: "weiß nicht" produces verdict=skipped, no advance, hint counted', async () => {
    const s = await setup();
    seedItem(s, { question: 'Was ist 2 + 2?', expected: '4' });
    const createdRes = await s.app.request('/agent/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ max_items: 5 }),
    });
    const created = (await createdRes.json()) as { session_id: string };

    const events = await turn(s, created.session_id, C1, { text: 'weiß nicht' });
    const done = events.find((e) => e.type === 'done');
    expect(done?.verdict).toBe('skipped');
    expect(done?.advance).toBe(false);
    expect(done?.hint_given).toBe(true);
  });
});
