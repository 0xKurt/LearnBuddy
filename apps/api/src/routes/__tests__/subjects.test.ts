// Subject + folder route tests. Doc 04 §subjects-and-folders + §schedule-summary.

import { describe, it, expect } from 'vitest';

import { createApp } from '../../app.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

const LEARNER_ADULT = {
  display_name: 'Anna',
  birth_year: 1985,
  grade_level: 13,
  ui_locale: 'de',
  avatar_id: 1,
  preferred_answer_mode: 'voice',
};

async function addAccountWithLearner(
  app: ReturnType<typeof createApp>,
  fake: ReturnType<typeof getFake>,
  email: string,
): Promise<{ token: string; accountId: string; learnerId: string }> {
  const signup = await app.request('/auth/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'super-secret-1', locale: 'de', country_code: 'DE' }),
  });
  const { account_id, user_id } = (await signup.json()) as {
    account_id: string;
    user_id: string;
  };
  const token = fake.authenticate(user_id, email);

  const learnerRes = await app.request('/learners', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(LEARNER_ADULT),
  });
  const learner = (await learnerRes.json()) as { id: string };

  return { token, accountId: account_id, learnerId: learner.id };
}

async function setupAccountWithLearner(email = 'parent@example.com') {
  const deps = createTestDeps();
  const app = createApp({ deps });
  const fake = getFake(deps);
  const { token, accountId, learnerId } = await addAccountWithLearner(app, fake, email);
  return { app, deps, fake, token, accountId, learnerId };
}

async function createSubject(
  app: ReturnType<typeof createApp>,
  token: string,
  learnerId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const res = await app.request(`/learners/${learnerId}/subjects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Mathe',
      subject_kind: 'math',
      color_hex: '#6B8AFD',
      icon_id: 'sigma',
      sort_order: 0,
      ...overrides,
    }),
  });
  return (await res.json()) as { id: string };
}

describe('GET /learners/:learnerId/subjects', () => {
  it('returns empty array initially', async () => {
    const { app, token, learnerId } = await setupAccountWithLearner();
    const res = await app.request(`/learners/${learnerId}/subjects`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns subjects with computed folder_count, material_count, upcoming_test_in_days', async () => {
    const { app, fake, token, learnerId } = await setupAccountWithLearner();

    const math = await createSubject(app, token, learnerId, { name: 'Mathe' });
    const bio = await createSubject(app, token, learnerId, {
      name: 'Bio',
      subject_kind: 'biology',
      color_hex: '#3FA876',
    });

    // Folder in Math scheduled 3 days out → chip should appear. now() in fake
    // is 2026-05-16, so +3d = 2026-05-19.
    await app.request(`/subjects/${math.id}/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Klassenarbeit 19.05.', scheduled_for: '2026-05-19' }),
    });
    // A second Math folder beyond the 7-day window → must NOT trigger the chip.
    await app.request(`/subjects/${math.id}/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Kap 6', scheduled_for: '2026-06-30' }),
    });
    // Seed one material directly so material_count = 1 on Math.
    fake.tables.set('materials', [
      {
        id: 'mat-1',
        learner_id: learnerId,
        subject_id: math.id,
        archived_at: null,
        created_at: '2026-05-16T10:00:00Z',
        updated_at: '2026-05-16T10:00:00Z',
      },
    ]);

    const res = await app.request(`/learners/${learnerId}/subjects`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{
      id: string;
      name: string;
      folder_count: number;
      material_count: number;
      upcoming_test_in_days: number | null;
    }>;
    const m = list.find((s) => s.id === math.id)!;
    const b = list.find((s) => s.id === bio.id)!;
    expect(m.folder_count).toBe(2);
    expect(m.material_count).toBe(1);
    expect(m.upcoming_test_in_days).toBe(3);
    expect(b.folder_count).toBe(0);
    expect(b.material_count).toBe(0);
    expect(b.upcoming_test_in_days).toBeNull();
  });

  it("does not return another account's subjects", async () => {
    const {
      app,
      fake,
      token: tokenA,
      learnerId: learnerA,
    } = await setupAccountWithLearner('a@x.com');
    await createSubject(app, tokenA, learnerA, { name: 'A-Mathe' });

    const { token: tokenB } = await addAccountWithLearner(app, fake, 'b@y.com');
    const res = await app.request(`/learners/${learnerA}/subjects`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated', async () => {
    const { app, learnerId } = await setupAccountWithLearner();
    const res = await app.request(`/learners/${learnerId}/subjects`);
    expect(res.status).toBe(401);
  });
});

describe('POST /learners/:learnerId/subjects', () => {
  it('creates a subject', async () => {
    const { app, fake, token, learnerId } = await setupAccountWithLearner();
    const res = await app.request(`/learners/${learnerId}/subjects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'Mathe',
        subject_kind: 'math',
        color_hex: '#6B8AFD',
        icon_id: 'sigma',
        sort_order: 0,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; archived_at: string | null };
    expect(body.name).toBe('Mathe');
    expect(body.archived_at).toBeNull();
    expect(fake.tables.get('subjects')).toHaveLength(1);
  });

  it('rejects invalid color_hex via zod validator (400, see auth.test convention)', async () => {
    const { app, token, learnerId } = await setupAccountWithLearner();
    const res = await app.request(`/learners/${learnerId}/subjects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Mathe', subject_kind: 'math', color_hex: 'red' }),
    });
    // zValidator returns 400 by default for schema failures; the project-wide
    // mapping to `validation_failed`/422 is captured as a separate slice
    // (see Open follow-ups under Slice B2).
    expect(res.status).toBe(400);
  });

  it('returns 404 for a learner_id that is not on this account', async () => {
    const { app, fake, token: tokenA } = await setupAccountWithLearner('a2@x.com');
    const { learnerId: learnerB } = await addAccountWithLearner(app, fake, 'b2@y.com');
    const res = await app.request(`/learners/${learnerB}/subjects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'X', subject_kind: 'math', color_hex: '#6B8AFD' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /subjects/:id', () => {
  it('renames a subject', async () => {
    const { app, token, learnerId } = await setupAccountWithLearner();
    const s = await createSubject(app, token, learnerId);
    const res = await app.request(`/subjects/${s.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Mathe-2' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe('Mathe-2');
  });

  it('returns 404 for cross-account subject', async () => {
    const { app, fake, token: tokenA } = await setupAccountWithLearner('cross-a@x.com');
    const { token: tokenB, learnerId: learnerB } = await addAccountWithLearner(
      app,
      fake,
      'cross-b@y.com',
    );
    const s = await createSubject(app, tokenB, learnerB, { name: 'B-Mathe' });
    const res = await app.request(`/subjects/${s.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'hijack' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /subjects/:id', () => {
  it('soft-archives the subject and removes it from list', async () => {
    const { app, fake, token, learnerId } = await setupAccountWithLearner();
    const s = await createSubject(app, token, learnerId);

    const del = await app.request(`/subjects/${s.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.status).toBe(200);
    const stored = fake.tables.get('subjects')!.find((r) => r.id === s.id)!;
    expect(stored.archived_at).toBeTruthy();

    const list = await app.request(`/learners/${learnerId}/subjects`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(await list.json()).toEqual([]);
  });
});

describe('GET /subjects/:subjectId/folders', () => {
  it('returns folders for the subject', async () => {
    const { app, token, learnerId } = await setupAccountWithLearner();
    const s = await createSubject(app, token, learnerId);
    await app.request(`/subjects/${s.id}/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'K1', scheduled_for: '2026-06-14' }),
    });
    const res = await app.request(`/subjects/${s.id}/folders`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ name: string; scheduled_for: string | null }>;
    expect(list).toHaveLength(1);
    expect(list[0]!.scheduled_for).toBe('2026-06-14');
  });

  it('returns empty array for a fresh subject', async () => {
    const { app, token, learnerId } = await setupAccountWithLearner();
    const s = await createSubject(app, token, learnerId);
    const res = await app.request(`/subjects/${s.id}/folders`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe('POST /subjects/:subjectId/folders', () => {
  it('creates a folder without scheduled_for', async () => {
    const { app, token, learnerId } = await setupAccountWithLearner();
    const s = await createSubject(app, token, learnerId);
    const res = await app.request(`/subjects/${s.id}/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Klassenarbeit Mathe' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { scheduled_for: string | null };
    expect(body.scheduled_for).toBeNull();
  });

  it('returns 404 when subject belongs to a different account', async () => {
    const { app, fake, token: tokenA } = await setupAccountWithLearner('fA@x.com');
    const { token: tokenB, learnerId: learnerB } = await addAccountWithLearner(
      app,
      fake,
      'fB@y.com',
    );
    const s = await createSubject(app, tokenB, learnerB, { name: 'B-X' });
    const res = await app.request(`/subjects/${s.id}/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'hijack' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /learners/:learnerId/schedule-summary', () => {
  it('returns only folders within the next 7 days', async () => {
    const { app, token, learnerId } = await setupAccountWithLearner();
    const s = await createSubject(app, token, learnerId);

    // now() = 2026-05-16. +3d in window, +10d out of window.
    await app.request(`/subjects/${s.id}/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'KA-19', scheduled_for: '2026-05-19' }),
    });
    await app.request(`/subjects/${s.id}/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'KA-26', scheduled_for: '2026-05-26' }),
    });

    const res = await app.request(`/learners/${learnerId}/schedule-summary`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      upcoming_tests: Array<{ name: string; days_until: number; scheduled_for: string }>;
      streak_current: number;
      streak_longest: number;
      last_session_at: string | null;
    };
    expect(body.upcoming_tests).toHaveLength(1);
    expect(body.upcoming_tests[0]!.name).toBe('KA-19');
    expect(body.upcoming_tests[0]!.days_until).toBe(3);
    // Doc 04 §schedule-summary explicitly forbids exposing any due-items counter.
    expect(body).not.toHaveProperty('pending_items');
    expect(body).not.toHaveProperty('due_count');
    expect(body.streak_current).toBe(0);
    expect(body.streak_longest).toBe(0);
    expect(body.last_session_at).toBeNull();
  });
});
