// Folder route tests. Doc 04 §subjects-and-folders (PATCH/DELETE).

import { describe, it, expect } from 'vitest';

import { createApp } from '../../app.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

async function setup(email = 'parent@example.com') {
  const deps = createTestDeps();
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
      display_name: 'Anna',
      birth_date: '1985-06-15',
      grade_level: 13,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'voice',
    }),
  });
  const learner = (await learnerRes.json()) as { id: string };

  const subjectRes = await app.request(`/learners/${learner.id}/subjects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Mathe', subject_kind: 'math', color_hex: '#6B8AFD' }),
  });
  const subject = (await subjectRes.json()) as { id: string };

  const folderRes = await app.request(`/subjects/${subject.id}/folders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Klassenarbeit', scheduled_for: '2026-06-14' }),
  });
  const folder = (await folderRes.json()) as { id: string };

  return {
    app,
    deps,
    fake,
    token,
    learnerId: learner.id,
    subjectId: subject.id,
    folderId: folder.id,
  };
}

describe('PATCH /folders/:id', () => {
  it('renames and reschedules', async () => {
    const { app, token, folderId } = await setup();
    const res = await app.request(`/folders/${folderId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'KA 21.06.', scheduled_for: '2026-06-21' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; scheduled_for: string };
    expect(body.name).toBe('KA 21.06.');
    expect(body.scheduled_for).toBe('2026-06-21');
  });

  it('returns 404 for a cross-account folder', async () => {
    const { app, fake, folderId } = await setup('owner@x.com');
    const stranger = await app.request('/auth/account/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'stranger@y.com',
        password: 'super-secret-1',
        locale: 'de',
        country_code: 'DE',
      }),
    });
    const { user_id } = (await stranger.json()) as { user_id: string };
    const tokenStranger = fake.authenticate(user_id, 'stranger@y.com');
    const res = await app.request(`/folders/${folderId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenStranger}` },
      body: JSON.stringify({ name: 'hijack' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /folders/:id', () => {
  it('soft-archives and excludes from list', async () => {
    const { app, fake, token, subjectId, folderId } = await setup();
    const del = await app.request(`/folders/${folderId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.status).toBe(200);
    const stored = fake.tables.get('folders')!.find((f) => f.id === folderId)!;
    expect(stored.archived_at).toBeTruthy();

    const list = await app.request(`/subjects/${subjectId}/folders`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(await list.json()).toEqual([]);
  });
});
