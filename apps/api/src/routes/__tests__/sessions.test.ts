// Sessions route tests. Doc 04 §POST /sessions.
//
// Minimum coverage per CODEBASE-AUDIT priority #8 — happy path + a
// validation failure + an auth failure for the highest-value flows. Exercises
// the JS fallback path of `pickItems` (the fake-supabase doesn't speak
// RPC, so the route's fallback branch is the one under test here).

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
    body: JSON.stringify({
      email,
      password: 'super-secret-1',
      locale: 'de',
      country_code: 'DE',
    }),
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
      birth_year: 2010,
      grade_level: 7,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'voice',
    }),
  });
  const learner = (await learnerRes.json()) as { id: string };

  const subjectRes = await app.request(`/learners/${learner.id}/subjects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-learner-id': learner.id,
    },
    body: JSON.stringify({ name: 'Mathe', subject_kind: 'math', color_hex: '#6B8AFD' }),
  });
  const subject = (await subjectRes.json()) as { id: string };

  return {
    app,
    deps,
    fake,
    token,
    accountId: account_id,
    learnerId: learner.id,
    subjectId: subject.id,
  };
}

function authed(s: Setup) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${s.token}`,
    'x-learner-id': s.learnerId,
  } as Record<string, string>;
}

function seedMaterialAndItems(s: Setup, count = 5) {
  // Bypass the materials POST so we don't have to run the LLM flow for
  // every session test. Drop rows directly into the fake.
  const materials = s.fake.tables.get('materials') ?? [];
  const items = s.fake.tables.get('items') ?? [];
  const material_id = s.fake.nextId();
  materials.push({
    id: material_id,
    subject_id: s.subjectId,
    folder_id: null,
    learner_id: s.learnerId,
    extraction_status: 'ready',
    archived_at: null,
  });
  s.fake.tables.set('materials', materials);
  for (let i = 0; i < count; i++) {
    items.push({
      id: s.fake.nextId(),
      material_id,
      learner_id: s.learnerId,
      question: `Q${i + 1}`,
      expected_answer: 'OK',
      acceptable_answers: [],
      answer_kind: 'short',
      stimulus_kind: 'none',
      stimulus_data: {},
      difficulty: 2,
      language: 'de',
      archived_at: null,
    });
  }
  s.fake.tables.set('items', items);
  return material_id;
}

describe('POST /sessions', () => {
  it('returns a session with up to max_items items from the learner pool', async () => {
    const s = await setup();
    seedMaterialAndItems(s, 4);

    const res = await s.app.request('/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        subject_id: s.subjectId,
        test_mode: false,
        max_items: 10,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session_id: string; items: unknown[] };
    expect(body.session_id).toBeTruthy();
    expect(body.items).toHaveLength(4);

    const session = s.fake.tables.get('sessions')?.find((r) => r.id === body.session_id);
    expect(session?.learner_id).toBe(s.learnerId);
    expect(session?.test_mode).toBe(false);
  });

  it('caps results at max_items even when more are available', async () => {
    const s = await setup();
    seedMaterialAndItems(s, 25);

    const res = await s.app.request('/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ subject_id: s.subjectId, max_items: 5 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(5);
  });

  it('rejects max_items > 50 with 400', async () => {
    const s = await setup();
    seedMaterialAndItems(s, 1);
    const res = await s.app.request('/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ max_items: 100 }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 without bearer token', async () => {
    const s = await setup();
    seedMaterialAndItems(s, 1);
    const res = await s.app.request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-learner-id': s.learnerId },
      body: JSON.stringify({ max_items: 5 }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when pool is empty', async () => {
    const s = await setup();
    // No items seeded.
    const res = await s.app.request('/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ subject_id: s.subjectId, max_items: 10 }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 403 when X-Learner-Id belongs to another account', async () => {
    const owner = await setup('owner@x.com');
    seedMaterialAndItems(owner, 1);
    const stranger = await setup('stranger@y.com');
    const res = await stranger.app.request('/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${stranger.token}`,
        'x-learner-id': owner.learnerId,
      },
      body: JSON.stringify({ max_items: 5 }),
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /sessions/:id/finish', () => {
  it('stamps ended_at and returns the row', async () => {
    const s = await setup();
    seedMaterialAndItems(s, 2);
    const create = await s.app.request('/sessions', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ subject_id: s.subjectId, max_items: 5 }),
    });
    const { session_id } = (await create.json()) as { session_id: string };

    const finish = await s.app.request(`/sessions/${session_id}/finish`, {
      method: 'PATCH',
      headers: authed(s),
    });
    expect(finish.status).toBe(200);
    const body = (await finish.json()) as { id: string; ended_at: string };
    expect(body.id).toBe(session_id);
    expect(body.ended_at).toBeTruthy();
  });
});
