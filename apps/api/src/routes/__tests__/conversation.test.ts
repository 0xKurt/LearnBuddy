// Conversational turn route tests. Doc 06 §P3 / Doc 05 §session.
//
// The core money + pedagogy path. Covers: a real multi-turn exchange,
// proof that the FULL prior transcript reaches the tutor (the bug this
// whole rebuild fixes), a validation failure, an auth failure, credits
// exhausted mid-conversation, and idempotent retry (no double charge).

import { describe, it, expect } from 'vitest';

import { createApp } from '../../app.js';
import { FakeLlmGateway } from '../../test/fake-llm.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';
import type { ConverseTurnInput } from '../../lib/llm/gateway.js';

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup(email = 'parent@example.com', llm = new FakeLlmGateway()) {
  const deps = createTestDeps({ llm });
  const app = createApp({ deps });
  const fake = getFake(deps);
  const signup = await app.request('/auth/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'super-secret-1', locale: 'de', country_code: 'DE' }),
  });
  const { user_id, account_id } = (await signup.json()) as {
    user_id: string;
    account_id: string;
  };
  const token = fake.authenticate(user_id, email);
  const learnerRes = await app.request('/learners', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      display_name: 'Anna',
      birth_date: '2010-01-15',
      grade_level: 7,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'text',
    }),
  });
  const learner = (await learnerRes.json()) as { id: string };
  return { app, deps, fake, token, accountId: account_id, learnerId: learner.id };
}

function authed(s: Setup) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${s.token}`,
    'x-learner-id': s.learnerId,
  } as Record<string, string>;
}

function seedSession(s: Setup): string {
  const id = s.fake.nextId();
  const sessions = s.fake.tables.get('sessions') ?? [];
  sessions.push({
    id,
    learner_id: s.learnerId,
    subject_id: null,
    test_mode: false,
    started_at: '2026-05-16T10:00:00Z',
    ended_at: null,
    attempts_count: 0,
    correct_count: 0,
    picked_item_ids: [],
    pinned_topic: null,
  });
  s.fake.tables.set('sessions', sessions);
  return id;
}

function seedItem(s: Setup): string {
  const id = s.fake.nextId();
  const items = s.fake.tables.get('items') ?? [];
  items.push({
    id,
    learner_id: s.learnerId,
    material_id: s.fake.nextId(),
    question: 'Was ist 2 + 2?',
    expected_answer: '4',
    acceptable_answers: [],
    answer_kind: 'short',
    stimulus_kind: 'none',
    stimulus_data: {},
    difficulty: 1,
    language: 'de',
    topic: 'Addition',
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

async function turn(
  s: Setup,
  sessionId: string,
  itemId: string,
  clientTurnId: string,
  body: Record<string, unknown>,
): Promise<SseEvent[]> {
  const res = await s.app.request(`/sessions/${sessionId}/turn`, {
    method: 'POST',
    headers: authed(s),
    body: JSON.stringify({
      client_turn_id: clientTurnId,
      item_id: itemId,
      mode: 'text',
      ...body,
    }),
  });
  return parseSse(await res.text());
}

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';

describe('POST /sessions/:id/turn', () => {
  it('runs a real multi-turn exchange (wrong → hinted, then correct)', async () => {
    const s = await setup();
    const session = seedSession(s);
    const item = seedItem(s);

    const t1 = await turn(s, session, item, C1, { text: '5' });
    expect(t1.find((e) => e.type === 'verdict')?.verdict).toBe('incorrect');
    expect(t1.some((e) => e.type === 'token')).toBe(true);
    const done1 = t1.find((e) => e.type === 'done');
    expect(done1?.credits_used as number).toBeGreaterThanOrEqual(1);

    const t2 = await turn(s, session, item, C2, { text: '4' });
    expect(t2.find((e) => e.type === 'verdict')?.verdict).toBe('correct');

    // Four turns persisted: learner,tutor,learner,tutor.
    expect(s.fake.tables.get('conversation_turns')).toHaveLength(4);
    expect(s.fake.tables.get('attempts')).toHaveLength(2);
  });

  it('gives the tutor the FULL prior transcript on every turn', async () => {
    const captured: ConverseTurnInput[] = [];
    class SpyLlm extends FakeLlmGateway {
      override async converseTurn(
        input: ConverseTurnInput,
        onToken?: (d: string) => void,
      ): ReturnType<FakeLlmGateway['converseTurn']> {
        captured.push(input);
        return super.converseTurn(input, onToken);
      }
    }
    const s = await setup('hist@example.com', new SpyLlm());
    const session = seedSession(s);
    const item = seedItem(s);

    await turn(s, session, item, C1, { text: 'erste falsche Antwort' });
    await turn(s, session, item, C2, { text: 'zweite falsche Antwort' });
    await turn(s, session, item, C3, { text: '4' });

    // Third call must see both prior learner answers AND both tutor replies.
    const third = captured[2]!;
    expect(third.history).toHaveLength(4);
    expect(third.history[0]).toEqual({ role: 'learner', content: 'erste falsche Antwort' });
    expect(third.history[1]?.role).toBe('tutor');
    expect(third.history[2]).toEqual({ role: 'learner', content: 'zweite falsche Antwort' });
    expect(third.hintsGivenForItem).toBe(2);
  });

  it('records a local-correct turn with no model call and no charge', async () => {
    const s = await setup();
    const session = seedSession(s);
    const item = seedItem(s);
    const before = s.fake.tables.get('credit_buckets')?.find((b) => b.account_id === s.accountId)
      ?.current_balance as number;

    const ev = await turn(s, session, item, C1, { text: '4', client_local_verdict: 'correct' });
    expect(ev.find((e) => e.type === 'verdict')?.verdict).toBe('correct');
    expect(ev.find((e) => e.type === 'done')?.credits_used).toBe(0);

    const after = s.fake.tables.get('credit_buckets')?.find((b) => b.account_id === s.accountId)
      ?.current_balance as number;
    expect(after).toBe(before);
  });

  it('400s when neither text nor audio is provided', async () => {
    const s = await setup();
    const session = seedSession(s);
    const item = seedItem(s);
    const res = await s.app.request(`/sessions/${session}/turn`, {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ client_turn_id: C1, item_id: item, mode: 'text' }),
    });
    expect(res.status).toBe(400);
  });

  it('401s without a bearer token', async () => {
    const s = await setup();
    const session = seedSession(s);
    const item = seedItem(s);
    const res = await s.app.request(`/sessions/${session}/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-learner-id': s.learnerId },
      body: JSON.stringify({ client_turn_id: C1, item_id: item, mode: 'text', text: '4' }),
    });
    expect(res.status).toBe(401);
  });

  it('streams a graceful error when credits are exhausted', async () => {
    const s = await setup();
    const session = seedSession(s);
    const item = seedItem(s);
    const buckets = s.fake.tables.get('credit_buckets') ?? [];
    const b = buckets.find((x) => x.account_id === s.accountId);
    if (b) b.current_balance = 0;

    const ev = await turn(s, session, item, C1, { text: '5' });
    const err = ev.find((e) => e.type === 'error');
    expect(err?.code).toBe('insufficient_credits');
    expect(s.fake.tables.get('conversation_turns') ?? []).toHaveLength(0);
  });

  it('replays the original reply on an idempotent retry (no double charge)', async () => {
    const s = await setup();
    const session = seedSession(s);
    const item = seedItem(s);

    const first = await turn(s, session, item, C1, { text: '5' });
    const firstCredits = first.find((e) => e.type === 'done')?.credits_used as number;
    expect(firstCredits).toBeGreaterThanOrEqual(1);

    const retry = await turn(s, session, item, C1, { text: '5' });
    expect(retry.find((e) => e.type === 'done')?.credits_used).toBe(0);
    // No extra turns / attempts from the replay.
    expect(s.fake.tables.get('conversation_turns')).toHaveLength(2);
    expect(s.fake.tables.get('attempts')).toHaveLength(1);
  });

  it('transcribes a voice turn server-side and feeds the transcript to the tutor', async () => {
    const s = await setup();
    const session = seedSession(s);
    const item = seedItem(s);

    // No text — only audio. The server must call transcribeAudio, surface
    // the transcript, then evaluate it as a normal turn.
    const ev = await turn(s, session, item, C1, {
      mode: 'voice',
      audio_base64: 'QUJD',
      audio_mime: 'audio/m4a',
    });
    const transcript = ev.find((e) => e.type === 'transcript');
    expect(transcript?.text).toBe('gesprochene Antwort'); // FakeLlm transcribeAudio
    expect(ev.find((e) => e.type === 'verdict')).toBeDefined();
    expect(ev.find((e) => e.type === 'done')).toBeDefined();
    // The learner turn was persisted with the transcribed content.
    const turns = s.fake.tables.get('conversation_turns') ?? [];
    expect(turns.some((tn) => tn.role === 'learner' && tn.content === 'gesprochene Antwort')).toBe(
      true,
    );
  });
});
