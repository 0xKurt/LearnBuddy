// GET /study-assets/:id — Doc 06 §P1.3 / Doc 07 (diagram_label).
// Happy path (signed url + marker metadata), cross-learner 404, auth 401.

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
  const { user_id } = (await signup.json()) as { user_id: string };
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

function seedAsset(s: Setup, learnerId = s.learnerId): string {
  const id = s.fake.nextId();
  const rows = s.fake.tables.get('study_assets') ?? [];
  rows.push({
    id,
    material_id: s.fake.nextId(),
    learner_id: learnerId,
    kind: 'numbered_diagram',
    storage_path: `study-assets/${learnerId}/${id}.png`,
    width: 800,
    height: 600,
    metadata: {
      label_positions: [
        { index: 1, x: 0.2, y: 0.3 },
        { index: 2, x: 0.7, y: 0.55 },
      ],
    },
  });
  s.fake.tables.set('study_assets', rows);
  return id;
}

describe('GET /study-assets/:id', () => {
  it('returns a signed url + marker metadata for an owned asset', async () => {
    const s = await setup();
    const id = seedAsset(s);
    const res = await s.app.request(`/study-assets/${id}`, { method: 'GET', headers: authed(s) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      width: number;
      height: number;
      label_positions: Array<{ index: number; x: number; y: number }>;
      signed_url: string;
    };
    expect(body.id).toBe(id);
    expect(body.width).toBe(800);
    expect(body.height).toBe(600);
    expect(body.label_positions).toHaveLength(2);
    expect(body.signed_url).toContain('study-assets');
    expect(typeof body.signed_url).toBe('string');
    expect(body.signed_url.length).toBeGreaterThan(0);
  });

  it('404s an asset belonging to another learner', async () => {
    const owner = await setup('owner@x.com');
    const id = seedAsset(owner);
    const stranger = await setup('stranger@y.com');
    const res = await stranger.app.request(`/study-assets/${id}`, {
      method: 'GET',
      headers: authed(stranger),
    });
    expect(res.status).toBe(404);
  });

  it('401s without a bearer token', async () => {
    const s = await setup();
    const id = seedAsset(s);
    const res = await s.app.request(`/study-assets/${id}`, {
      method: 'GET',
      headers: { 'content-type': 'application/json', 'x-learner-id': s.learnerId },
    });
    expect(res.status).toBe(401);
  });
});
