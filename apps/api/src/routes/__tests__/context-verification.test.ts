// VERIFICATION (round 2): prove the tutor receives full conversational
// context on every turn. These tests capture the exact ConverseTurnInput
// the route hands the LLM gateway and assert the whole prior transcript is
// present, ordered, oldest-first — across 3 scenarios where a correct reply
// is only possible WITH that context.
//
// Note: this proves the server ASSEMBLES + PASSES full context. Live-model
// answer quality requires a real Vertex call and is out of scope here.

import { describe, it, expect } from 'vitest';

import { createApp } from '../../app.js';
import { FakeLlmGateway } from '../../test/fake-llm.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';
import type { ConverseTurnInput } from '../../lib/llm/gateway.js';

const captured: ConverseTurnInput[] = [];
class SpyLlm extends FakeLlmGateway {
  override async converseTurn(
    input: ConverseTurnInput,
    onToken?: (d: string) => void,
  ): ReturnType<FakeLlmGateway['converseTurn']> {
    captured.push(structuredClone(input));
    return super.converseTurn(input, onToken);
  }
}

type Setup = Awaited<ReturnType<typeof setup>>;
async function setup(email: string) {
  const deps = createTestDeps({ llm: new SpyLlm() });
  const app = createApp({ deps });
  const fake = getFake(deps);
  const signup = await app.request('/auth/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'super-secret-1', locale: 'de', country_code: 'DE' }),
  });
  const { user_id } = (await signup.json()) as { user_id: string };
  const token = fake.authenticate(user_id, email);
  const learnerRes = await app.request('/learners', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      display_name: 'Mara',
      birth_date: '2010-01-15',
      grade_level: 7,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'text',
    }),
  });
  const learnerId = ((await learnerRes.json()) as { id: string }).id;
  return { app, fake, token, learnerId };
}
function authed(s: Setup) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${s.token}`,
    'x-learner-id': s.learnerId,
  };
}
function seedSession(s: Setup): string {
  const id = s.fake.nextId();
  const rows = s.fake.tables.get('sessions') ?? [];
  rows.push({
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
  s.fake.tables.set('sessions', rows);
  return id;
}
function seedItem(s: Setup, q: string, expected: string, topic: string): string {
  const id = s.fake.nextId();
  const rows = s.fake.tables.get('items') ?? [];
  rows.push({
    id,
    learner_id: s.learnerId,
    material_id: s.fake.nextId(),
    question: q,
    expected_answer: expected,
    acceptable_answers: [],
    answer_kind: 'short',
    stimulus_kind: 'none',
    stimulus_data: {},
    difficulty: 1,
    language: 'de',
    topic,
    archived_at: null,
  });
  s.fake.tables.set('items', rows);
  return id;
}
async function turn(s: Setup, sid: string, item: string, cid: string, text: string) {
  const res = await s.app.request(`/sessions/${sid}/turn`, {
    method: 'POST',
    headers: authed(s),
    body: JSON.stringify({ client_turn_id: cid, item_id: item, mode: 'text', text }),
  });
  // Drain the SSE stream so the turn fully completes (persist + capture)
  // before the next turn starts — otherwise turns race.
  await res.text();
}
const U = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

describe('VERIFY: full conversational context reaches the tutor every turn', () => {
  it('case 1 — cumulative misses: turn 3 sees both prior Q/A pairs in order', async () => {
    captured.length = 0;
    const s = await setup('v1@example.com');
    const sid = seedSession(s);
    const it = seedItem(s, 'Hauptstadt von Frankreich?', 'Paris', 'Geo');
    // Three wrong answers → every turn hits the tutor (no local fast-path).
    await turn(s, sid, it, U(1), 'London');
    await turn(s, sid, it, U(2), 'Madrid');
    await turn(s, sid, it, U(3), 'Rom');

    expect(captured).toHaveLength(3);
    const third = captured[2]!;
    expect(third.history.map((m) => `${m.role}:${m.content}`)).toEqual([
      'learner:London',
      `tutor:${third.history[1]!.content}`,
      'learner:Madrid',
      `tutor:${third.history[3]!.content}`,
    ]);
    expect(third.learnerMessage).toBe('Rom');
    expect(third.hintsGivenForItem).toBe(2);
  });

  it('case 2 — cross-item memory: a later item still carries earlier items in the thread', async () => {
    captured.length = 0;
    const s = await setup('v2@example.com');
    const sid = seedSession(s);
    const a = seedItem(s, 'Was ist 2+2?', '4', 'Mathe');
    const b = seedItem(s, 'Was ist 3+3?', '6', 'Mathe');
    // Wrong answers so both turns reach the tutor and are captured.
    await turn(s, sid, a, U(1), 'fünf');
    await turn(s, sid, b, U(2), 'sieben');

    const second = captured.find((c) => c.item.question === 'Was ist 3+3?');
    // Even though we're now on item B, the thread still contains item A's
    // exchange — the agent has the WHOLE session, not just the current item.
    expect(second).toBeDefined();
    expect(second!.history.some((m) => m.role === 'learner' && m.content === 'fünf')).toBe(true);
  });

  it('case 3 — back-reference: a terse follow-up is appended after the full prior thread', async () => {
    captured.length = 0;
    const s = await setup('v3@example.com');
    const sid = seedSession(s);
    const it = seedItem(s, 'Nenne einen Planeten.', 'Mars', 'Astro');
    await turn(s, sid, it, U(1), 'Ein roter Planet, der mit M anfängt?');
    await turn(s, sid, it, U(2), 'der zweite den du meintest');

    const last = captured[1]!;
    // The terse message is only resolvable WITH the prior turn present.
    expect(last.history[0]).toEqual({
      role: 'learner',
      content: 'Ein roter Planet, der mit M anfängt?',
    });
    expect(last.history[1]!.role).toBe('tutor');
    expect(last.learnerMessage).toBe('der zweite den du meintest');
    expect(last.history.length).toBeGreaterThanOrEqual(2);
  });

  it('case 4 — long session: the current item’s whole exchange survives the history window', async () => {
    captured.length = 0;
    const s = await setup('v4@example.com');
    const sid = seedSession(s);
    const it = seedItem(s, 'Wie heißt der größte Planet?', 'Jupiter', 'Astro');
    // 14 wrong answers → 28 messages, well past MAX_HISTORY_MESSAGES (24).
    for (let n = 1; n <= 14; n++) {
      await turn(s, sid, it, U(n), `falsche Antwort Nummer ${n}`);
    }
    const lastCall = captured[captured.length - 1]!;
    // The very first answer is older than the recent window, but because it
    // belongs to the CURRENT item it must still be in context (coherent
    // hint staircase regardless of session length).
    expect(
      lastCall.history.some(
        (m) => m.role === 'learner' && m.content === 'falsche Antwort Nummer 1',
      ),
    ).toBe(true);
    // hint accounting still counts every prior miss on this item.
    expect(lastCall.hintsGivenForItem).toBe(13);
  });
});
