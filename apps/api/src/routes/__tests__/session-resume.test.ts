// Resume + sustained-session tests. Doc 05 §session / Doc 01 §Studying.
//
// Covers: POST /sessions persists the exact item set; GET /sessions/:id
// returns the SAME items plus the full thread (deterministic resume);
// PATCH pins a topic and keeps the session going by refilling the queue.

import { describe, it, expect } from 'vitest';

import { createApp } from '../../app.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup(email = 'parent@example.com') {
  const deps = createTestDeps();
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
      display_name: 'Anna',
      birth_date: '2010-01-15',
      grade_level: 7,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'text',
    }),
  });
  const learner = (await learnerRes.json()) as { id: string };
  return { app, fake, token, accountId: account_id, learnerId: learner.id };
}

function authed(s: Setup) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${s.token}`,
    'x-learner-id': s.learnerId,
  } as Record<string, string>;
}

function seedItem(s: Setup, topic: string): string {
  const id = s.fake.nextId();
  const items = s.fake.tables.get('items') ?? [];
  items.push({
    id,
    learner_id: s.learnerId,
    material_id: s.fake.nextId(),
    question: `Frage zu ${topic}?`,
    expected_answer: '4',
    acceptable_answers: [],
    answer_kind: 'short',
    stimulus_kind: 'none',
    stimulus_data: {},
    difficulty: 1,
    language: 'de',
    topic,
    archived_at: null,
  });
  s.fake.tables.set('items', items);
  return id;
}

describe('session resume + sustained controls', () => {
  it('persists the picked set and resumes with the same items + thread', async () => {
    const s = await setup();
    const a = seedItem(s, 'Addition');
    const b = seedItem(s, 'Addition');

    const start = await s.app.request('/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ max_items: 20 }),
    });
    expect(start.status).toBe(200);
    const { session_id, items } = (await start.json()) as {
      session_id: string;
      items: Array<{ id: string }>;
    };
    expect(items).toHaveLength(2);

    // One turn so there's a thread to restore.
    await s.app.request(`/sessions/${session_id}/turn`, {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        client_turn_id: '11111111-1111-4111-8111-111111111111',
        item_id: a,
        mode: 'text',
        text: '4',
        client_local_verdict: 'correct',
      }),
    });

    const snap = await s.app.request(`/sessions/${session_id}`, {
      method: 'GET',
      headers: authed(s),
    });
    expect(snap.status).toBe(200);
    const body = (await snap.json()) as {
      items: Array<{ id: string }>;
      turns: unknown[];
      active: boolean;
    };
    expect(body.items.map((i) => i.id).sort()).toEqual([a, b].sort());
    expect(body.turns).toHaveLength(2); // learner + tutor
    expect(body.active).toBe(true);
  });

  it('pins a topic and keeps going by refilling the queue', async () => {
    const s = await setup('pin@example.com');
    seedItem(s, 'Addition');

    const start = await s.app.request('/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ max_items: 1 }),
    });
    const { session_id } = (await start.json()) as { session_id: string };

    // Add more material the refill can pull in.
    seedItem(s, 'Addition');
    seedItem(s, 'Subtraktion');

    const patch = await s.app.request(`/sessions/${session_id}`, {
      method: 'PATCH',
      headers: authed(s),
      body: JSON.stringify({ pinned_topic: 'Addition', keep_going: true }),
    });
    expect(patch.status).toBe(200);
    const snap = (await patch.json()) as {
      pinned_topic: string;
      items: Array<{ topic: string }>;
    };
    expect(snap.pinned_topic).toBe('Addition');
    // Refill only pulled the matching topic, never 'Subtraktion'.
    expect(snap.items.every((i) => i.topic === 'Addition')).toBe(true);
    expect(snap.items.length).toBeGreaterThan(1);
  });

  it('404s a session the learner does not own', async () => {
    const owner = await setup('owner2@example.com');
    seedItem(owner, 'Addition');
    const start = await owner.app.request('/sessions', {
      method: 'POST',
      headers: authed(owner),
      body: JSON.stringify({}),
    });
    const { session_id } = (await start.json()) as { session_id: string };

    const stranger = await setup('stranger2@example.com');
    const res = await stranger.app.request(`/sessions/${session_id}`, {
      method: 'GET',
      headers: authed(stranger),
    });
    expect(res.status).toBe(404);
  });
});
