// Learner route tests. Doc 04 §learners.

import { describe, it, expect } from 'vitest';

import { createApp } from '../../app.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

async function setupAuthed() {
  const deps = createTestDeps();
  const app = createApp({ deps });
  const fake = getFake(deps);

  const signup = await app.request('/auth/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'parent@example.com',
      password: 'super-secret-1',
      locale: 'de',
      country_code: 'DE',
    }),
  });
  const { account_id, user_id } = (await signup.json()) as {
    account_id: string;
    user_id: string;
  };
  const token = fake.authenticate(user_id, 'parent@example.com');
  return { app, deps, fake, token, accountId: account_id };
}

describe('POST /learners', () => {
  it('creates an adult profile without minor_consent_version', async () => {
    const { app, fake, token } = await setupAuthed();

    const res = await app.request('/learners', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        display_name: 'Anna',
        birth_date: '1985-06-15',
        grade_level: 13,
        ui_locale: 'de',
        avatar_id: 1,
        preferred_answer_mode: 'voice',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { display_name: string };
    expect(body.display_name).toBe('Anna');
    expect(fake.tables.get('learners')).toHaveLength(1);
  });

  it('requires minor_consent_version for a profile born after 2010', async () => {
    const { app, token } = await setupAuthed();

    const res = await app.request('/learners', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        display_name: 'Mira',
        birth_date: '2015-03-10',
        grade_level: 4,
        ui_locale: 'de',
        avatar_id: 1,
        preferred_answer_mode: 'voice',
      }),
    });
    expect(res.status).toBe(422);
  });

  it('accepts minor profile with correct consent version', async () => {
    const { app, token } = await setupAuthed();
    const res = await app.request('/learners', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        display_name: 'Mira',
        birth_date: '2015-03-10',
        grade_level: 4,
        ui_locale: 'de',
        avatar_id: 1,
        preferred_answer_mode: 'voice',
        minor_consent_version: '2026-05-01',
      }),
    });
    expect(res.status).toBe(201);
  });

  it('returns learner_already_exists (409) on second active profile', async () => {
    const { app, token } = await setupAuthed();
    const body = JSON.stringify({
      display_name: 'A',
      birth_date: '1985-06-15',
      grade_level: 13,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'voice',
    });
    const first = await app.request('/learners', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body,
    });
    expect(first.status).toBe(201);
    const second = await app.request('/learners', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body,
    });
    expect(second.status).toBe(409);
    const err = (await second.json()) as { error: { code: string } };
    expect(err.error.code).toBe('learner_already_exists');
  });

  it('rejects unauthenticated', async () => {
    const { app } = await setupAuthed();
    const res = await app.request('/learners', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: 'Anna',
        birth_date: '1985-06-15',
        grade_level: 13,
        ui_locale: 'de',
        avatar_id: 1,
        preferred_answer_mode: 'voice',
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /learners/:id', () => {
  it('updates display_name + grade_level', async () => {
    const { app, fake, token } = await setupAuthed();
    const created = await app.request('/learners', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        display_name: 'Anna',
        birth_date: '1985-06-15',
        grade_level: 13,
        ui_locale: 'de',
        avatar_id: 1,
        preferred_answer_mode: 'voice',
      }),
    });
    const learner = (await created.json()) as { id: string };

    const res = await app.request(`/learners/${learner.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ display_name: 'Anna B', grade_level: 12 }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { display_name: string; grade_level: number };
    expect(updated.display_name).toBe('Anna B');
    expect(updated.grade_level).toBe(12);

    const stored = fake.tables.get('learners')!.find((l) => l.id === learner.id)!;
    expect(stored.display_name).toBe('Anna B');
  });

  it('returns not_found for unknown learner id', async () => {
    const { app, token } = await setupAuthed();
    const res = await app.request('/learners/does-not-exist', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ display_name: 'X' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /learners/:id', () => {
  it('soft-archives the learner', async () => {
    const { app, fake, token } = await setupAuthed();
    const created = await app.request('/learners', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        display_name: 'Anna',
        birth_date: '1985-06-15',
        grade_level: 13,
        ui_locale: 'de',
        avatar_id: 1,
        preferred_answer_mode: 'voice',
      }),
    });
    const learner = (await created.json()) as { id: string };

    const res = await app.request(`/learners/${learner.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const stored = fake.tables.get('learners')!.find((l) => l.id === learner.id)!;
    expect(stored.archived_at).toBeTruthy();
  });
});
