// Items route tests. Doc 04 §DELETE /items/:id.
//
// Covers: happy-path soft-archive, ownership guard (403/404), and auth failure.

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
    body: JSON.stringify({ email, password: 'pw123456', locale: 'de', country_code: 'DE' }),
  });
  const { user_id } = (await signup.json()) as { user_id: string; account_id: string };
  const token = fake.authenticate(user_id, email);
  const learnerRes = await app.request('/learners', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      display_name: 'Max',
      birth_year: 2007,
      grade_level: 10,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'text',
    }),
  });
  const learner = (await learnerRes.json()) as { id: string };
  return { app, deps, fake, token, learnerId: learner.id };
}

function authed(s: Setup) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${s.token}`,
    'x-learner-id': s.learnerId,
  } as Record<string, string>;
}

function seedItem(s: Setup, overrides: Record<string, unknown> = {}): string {
  const items = s.fake.tables.get('items') ?? [];
  const id = s.fake.nextId();
  items.push({
    id,
    learner_id: s.learnerId,
    material_id: s.fake.nextId(),
    question: 'Was ist H₂O?',
    expected_answer: 'Wasser',
    acceptable_answers: [],
    answer_kind: 'short',
    stimulus_kind: 'none',
    archived_at: null,
    ...overrides,
  });
  s.fake.tables.set('items', items);
  return id;
}

describe('DELETE /items/:id', () => {
  it('soft-archives an item the learner owns', async () => {
    const s = await setup();
    const itemId = seedItem(s);

    const res = await s.app.request(`/items/${itemId}`, {
      method: 'DELETE',
      headers: authed(s),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; archived: boolean };
    expect(body.id).toBe(itemId);
    expect(body.archived).toBe(true);

    const row = s.fake.tables.get('items')?.find((r) => r.id === itemId);
    expect(row?.archived_at).toBeTruthy();
  });

  it('returns 404 when item belongs to another learner', async () => {
    const owner = await setup('owner@x.com');
    const itemId = seedItem(owner);
    const stranger = await setup('stranger@y.com');

    const res = await stranger.app.request(`/items/${itemId}`, {
      method: 'DELETE',
      headers: authed(stranger),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an already-archived item', async () => {
    const s = await setup();
    const itemId = seedItem(s, { archived_at: '2026-01-01T00:00:00Z' });

    const res = await s.app.request(`/items/${itemId}`, {
      method: 'DELETE',
      headers: authed(s),
    });
    expect(res.status).toBe(404);
  });

  it('returns 401 without bearer token', async () => {
    const s = await setup();
    const itemId = seedItem(s);

    const res = await s.app.request(`/items/${itemId}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-learner-id': s.learnerId },
    });
    expect(res.status).toBe(401);
  });
});
