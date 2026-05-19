// Material route tests. Doc 04 §materials + Doc 08 §atomic-debit + Doc 09 §4.

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

async function reserveMaterial(
  s: Setup,
  photoCount = 2,
): Promise<{
  material_id: string;
  uploads: Array<{ position: number; storage_path: string; signed_url: string }>;
}> {
  const res = await s.app.request('/materials/upload-url', {
    method: 'POST',
    headers: authed(s),
    body: JSON.stringify({
      subject_id: s.subjectId,
      folder_id: null,
      photo_count: photoCount,
      mime_type: 'image/jpeg',
    }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    material_id: string;
    uploads: Array<{ position: number; storage_path: string; signed_url: string }>;
  };
}

describe('POST /materials/upload-url', () => {
  it('reserves a material and returns one signed URL per photo', async () => {
    const s = await setup();
    const body = await reserveMaterial(s, 3);
    expect(body.material_id).toBeTypeOf('string');
    expect(body.uploads).toHaveLength(3);
    expect(body.uploads[0]?.position).toBe(1);
    expect(body.uploads[0]?.storage_path).toContain(`materials-raw/${s.accountId}/`);
    expect(body.uploads[0]?.signed_url).toContain('https://fake-storage.local/materials-raw/');
  });

  it('rejects photo_count > 10', async () => {
    const s = await setup();
    const res = await s.app.request('/materials/upload-url', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        subject_id: s.subjectId,
        folder_id: null,
        photo_count: 11,
        mime_type: 'image/jpeg',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the subject belongs to another account', async () => {
    const owner = await setup('owner@x.com');
    const stranger = await setup('stranger@y.com');
    const res = await stranger.app.request('/materials/upload-url', {
      method: 'POST',
      headers: authed(stranger),
      body: JSON.stringify({
        subject_id: owner.subjectId,
        folder_id: null,
        photo_count: 1,
        mime_type: 'image/jpeg',
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /materials', () => {
  it('streams done with placeholder items and debits 20 credits', async () => {
    const s = await setup();
    const reserved = await reserveMaterial(s, 2);

    const res = await s.app.request('/materials', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        material_id: reserved.material_id,
        subject_id: s.subjectId,
        folder_id: null,
        title: 'Bruchrechnung',
        locale: 'de',
        target_item_count: 10,
        client_quality_scores: [
          { position: 1, blur: 142.3, brightness: 138, tilt: 4, width: 1024, height: 768 },
          { position: 2, blur: 98.1, brightness: 145, tilt: 6, width: 1024, height: 768 },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('event: phase');
    expect(body).toContain('reading_images');
    expect(body).toContain('generating_items');
    expect(body).toContain('event: done');

    // Pull the `done` payload out of the SSE stream.
    const doneLine = body
      .split('\n')
      .find((l) => l.startsWith('data: ') && l.includes('material_id'));
    expect(doneLine).toBeTruthy();
    const done = JSON.parse(doneLine!.slice('data: '.length)) as {
      material_id: string;
      items: unknown[];
      credits_used: number;
    };
    expect(done.material_id).toBe(reserved.material_id);
    expect(done.items).toHaveLength(3);
    // FakeLlmGateway reports zero token cost; settle() floors at 1 credit.
    expect(done.credits_used).toBe(1);

    // Bucket: 1500 (trial grant) − 20 estimate + 19 refund-via-settle = 1499.
    const bucket = s.fake.tables.get('credit_buckets')?.find((r) => r.account_id === s.accountId);
    expect(bucket?.current_balance).toBe(1499);

    // material is ready + photo wipe scheduled.
    const m = s.fake.tables.get('materials')?.find((r) => r.id === reserved.material_id);
    expect(m?.extraction_status).toBe('ready');
    expect(m?.scheduled_photo_deletion_at).toBeTypeOf('string');

    // material_photos rows persisted with quality scores.
    const photos = s.fake.tables
      .get('material_photos')
      ?.filter((r) => r.material_id === reserved.material_id);
    expect(photos).toHaveLength(2);
    expect(photos?.[0]?.client_blur_score).toBe(142.3);
  });

  it('returns 402 when the credit bucket is empty', async () => {
    const s = await setup();
    const reserved = await reserveMaterial(s, 1);
    // Empty the bucket directly via the fake.
    const bucket = s.fake.tables.get('credit_buckets')?.find((r) => r.account_id === s.accountId);
    if (bucket) bucket.current_balance = 5;

    const res = await s.app.request('/materials', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        material_id: reserved.material_id,
        subject_id: s.subjectId,
        folder_id: null,
        locale: 'de',
        target_item_count: 10,
        client_quality_scores: [
          { position: 1, blur: 120, brightness: 140, tilt: 0, width: 1024, height: 768 },
        ],
      }),
    });
    expect(res.status).toBe(402);
    // No items inserted, no debit.
    expect(s.fake.tables.get('items') ?? []).toHaveLength(0);
    expect(bucket?.current_balance).toBe(5);
  });

  it('returns 404 when the material_id belongs to another account', async () => {
    const owner = await setup('owner@x.com');
    const ownerReserved = await reserveMaterial(owner, 1);

    const stranger = await setup('stranger@y.com');
    const res = await stranger.app.request('/materials', {
      method: 'POST',
      headers: authed(stranger),
      body: JSON.stringify({
        material_id: ownerReserved.material_id,
        subject_id: stranger.subjectId,
        folder_id: null,
        locale: 'de',
        target_item_count: 10,
        client_quality_scores: [
          { position: 1, blur: 120, brightness: 140, tilt: 0, width: 1024, height: 768 },
        ],
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /materials/:id and /items', () => {
  it('returns the persisted material + items', async () => {
    const s = await setup();
    const reserved = await reserveMaterial(s, 1);
    const postRes = await s.app.request('/materials', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        material_id: reserved.material_id,
        subject_id: s.subjectId,
        folder_id: null,
        locale: 'de',
        target_item_count: 10,
        client_quality_scores: [
          { position: 1, blur: 120, brightness: 140, tilt: 0, width: 1024, height: 768 },
        ],
      }),
    });
    await postRes.text(); // drain stream so all DB writes complete before GET

    const m = await s.app.request(`/materials/${reserved.material_id}`, {
      method: 'GET',
      headers: authed(s),
    });
    expect(m.status).toBe(200);
    const mBody = (await m.json()) as { id: string; items: unknown[] };
    expect(mBody.id).toBe(reserved.material_id);
    expect(mBody.items).toHaveLength(3);

    const i = await s.app.request(`/materials/${reserved.material_id}/items`, {
      method: 'GET',
      headers: authed(s),
    });
    expect(i.status).toBe(200);
    const iBody = (await i.json()) as { items: unknown[] };
    expect(iBody.items).toHaveLength(3);
  });

  it('GET /materials/:id returns 404 cross-account', async () => {
    const owner = await setup('owner@x.com');
    const reserved = await reserveMaterial(owner, 1);
    const ownerPost = await owner.app.request('/materials', {
      method: 'POST',
      headers: authed(owner),
      body: JSON.stringify({
        material_id: reserved.material_id,
        subject_id: owner.subjectId,
        folder_id: null,
        locale: 'de',
        target_item_count: 10,
        client_quality_scores: [
          { position: 1, blur: 120, brightness: 140, tilt: 0, width: 1024, height: 768 },
        ],
      }),
    });
    await ownerPost.text();

    const stranger = await setup('stranger@y.com');
    const res = await stranger.app.request(`/materials/${reserved.material_id}`, {
      method: 'GET',
      headers: authed(stranger),
    });
    expect(res.status).toBe(404);
  });
});
