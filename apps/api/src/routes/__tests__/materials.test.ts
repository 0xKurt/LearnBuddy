// Material route tests. Doc 04 §materials + Doc 08 §atomic-debit + ADR 0003.
//
// POST /materials now ENQUEUES (202) and a worker drains the queue, so the
// tests exercise enqueue → drain → ready, plus the retry + worker-auth paths.

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

async function reserveMaterial(s: Setup, photoCount = 2): Promise<{ material_id: string }> {
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
  return (await res.json()) as { material_id: string };
}

function scores(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    position: i + 1,
    blur: 120,
    brightness: 140,
    tilt: 0,
    width: 1024,
    height: 768,
  }));
}

async function enqueue(s: Setup, materialId: string, n = 2) {
  return s.app.request('/materials', {
    method: 'POST',
    headers: authed(s),
    body: JSON.stringify({
      material_id: materialId,
      subject_id: s.subjectId,
      folder_id: null,
      title: 'Bruchrechnung',
      locale: 'de',
      client_quality_scores: scores(n),
    }),
  });
}

async function drain(s: Setup, secret = 'test-worker-secret') {
  return s.app.request('/materials-worker/drain', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-worker-secret': secret },
  });
}

describe('POST /materials/upload-url', () => {
  it('reserves a material and returns one signed URL per photo', async () => {
    const s = await setup();
    const res = await s.app.request('/materials/upload-url', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        subject_id: s.subjectId,
        folder_id: null,
        photo_count: 3,
        mime_type: 'image/jpeg',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      material_id: string;
      uploads: Array<{ position: number; storage_path: string }>;
    };
    expect(body.uploads).toHaveLength(3);
    expect(body.uploads[0]?.storage_path).toContain(`materials-raw/${s.accountId}/`);
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

describe('POST /materials (enqueue) + worker drain', () => {
  it('enqueues 202, debits 20, then the worker extracts to ready', async () => {
    const s = await setup();
    const { material_id } = await reserveMaterial(s, 2);

    const res = await enqueue(s, material_id, 2);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { material_id: string; status: string };
    expect(body).toEqual({ material_id, status: 'pending' });

    // Debited on enqueue; job queued; photos persisted; NOT yet processed.
    const bucket0 = s.fake.tables.get('credit_buckets')?.find((r) => r.account_id === s.accountId);
    expect(bucket0?.current_balance).toBe(1480); // 1500 − 20
    const job0 = s.fake.tables.get('extraction_jobs')?.find((j) => j.material_id === material_id);
    expect(job0?.status).toBe('queued');
    expect(
      s.fake.tables.get('material_photos')?.filter((p) => p.material_id === material_id),
    ).toHaveLength(2);
    expect(s.fake.tables.get('items') ?? []).toHaveLength(0);

    const d = await drain(s);
    expect(d.status).toBe(200);
    const dBody = (await d.json()) as { processed: number; results: Array<{ ok: boolean }> };
    expect(dBody.processed).toBe(1);
    expect(dBody.results[0]?.ok).toBe(true);

    const m = s.fake.tables.get('materials')?.find((r) => r.id === material_id);
    expect(m?.extraction_status).toBe('ready');
    expect(m?.scheduled_photo_deletion_at).toBeTypeOf('string');
    expect(s.fake.tables.get('items')?.filter((i) => i.material_id === material_id)).toHaveLength(
      3,
    );
    const job1 = s.fake.tables.get('extraction_jobs')?.find((j) => j.material_id === material_id);
    expect(job1?.status).toBe('done');
    // settle: 1480 − (1 − 20) = 1499
    const bucket1 = s.fake.tables.get('credit_buckets')?.find((r) => r.account_id === s.accountId);
    expect(bucket1?.current_balance).toBe(1499);
  });

  it('drain refuses without the worker secret', async () => {
    const s = await setup();
    expect((await drain(s, 'wrong')).status).toBe(401);
  });

  it('returns 402 at enqueue when credits are insufficient (no job, no debit)', async () => {
    const s = await setup();
    const { material_id } = await reserveMaterial(s, 1);
    const bucket = s.fake.tables.get('credit_buckets')?.find((r) => r.account_id === s.accountId);
    if (bucket) bucket.current_balance = 5;

    const res = await enqueue(s, material_id, 1);
    expect(res.status).toBe(402);
    expect(s.fake.tables.get('extraction_jobs') ?? []).toHaveLength(0);
    expect(bucket?.current_balance).toBe(5);
  });

  it('returns 404 when the material belongs to another account', async () => {
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
        client_quality_scores: scores(1),
      }),
    });
    expect(res.status).toBe(404);
  });

  it('retry re-enqueues a failed material and the worker completes it', async () => {
    const s = await setup();
    const { material_id } = await reserveMaterial(s, 1);
    await enqueue(s, material_id, 1);

    // Simulate a failed attempt (worker would have refunded on failure).
    const job = s.fake.tables.get('extraction_jobs')?.find((j) => j.material_id === material_id);
    if (job) job.status = 'failed';
    const m0 = s.fake.tables.get('materials')?.find((r) => r.id === material_id);
    if (m0) m0.extraction_status = 'failed';
    const bucket = s.fake.tables.get('credit_buckets')?.find((r) => r.account_id === s.accountId);
    if (bucket) bucket.current_balance = 1480; // post-refund state

    const retry = await s.app.request(`/materials/${material_id}/retry`, {
      method: 'POST',
      headers: authed(s),
    });
    expect(retry.status).toBe(202);
    const job1 = s.fake.tables.get('extraction_jobs')?.find((j) => j.material_id === material_id);
    expect(job1?.status).toBe('queued');
    // Re-debited (fresh attempt, the failed one was refunded).
    expect(
      s.fake.tables.get('credit_buckets')?.find((r) => r.account_id === s.accountId)
        ?.current_balance,
    ).toBe(1460);

    await drain(s);
    expect(
      s.fake.tables.get('materials')?.find((r) => r.id === material_id)?.extraction_status,
    ).toBe('ready');
  });

  it('retry is a no-op (202) while a job is still queued — no double charge', async () => {
    const s = await setup();
    const { material_id } = await reserveMaterial(s, 1);
    await enqueue(s, material_id, 1);
    const balance = s.fake.tables
      .get('credit_buckets')
      ?.find((r) => r.account_id === s.accountId)?.current_balance;

    const retry = await s.app.request(`/materials/${material_id}/retry`, {
      method: 'POST',
      headers: authed(s),
    });
    expect(retry.status).toBe(202);
    expect(
      s.fake.tables.get('credit_buckets')?.find((r) => r.account_id === s.accountId)
        ?.current_balance,
    ).toBe(balance); // unchanged — guarded
  });
});

describe('GET /materials/:id', () => {
  it('exposes status for polling, then items once ready', async () => {
    const s = await setup();
    const { material_id } = await reserveMaterial(s, 1);
    await enqueue(s, material_id, 1);

    const pending = await s.app.request(`/materials/${material_id}`, { headers: authed(s) });
    expect(pending.status).toBe(200);
    expect(((await pending.json()) as { extraction_status: string }).extraction_status).toBe(
      'pending',
    );

    await drain(s);

    const ready = await s.app.request(`/materials/${material_id}`, { headers: authed(s) });
    const body = (await ready.json()) as { extraction_status: string; items: unknown[] };
    expect(body.extraction_status).toBe('ready');
    expect(body.items).toHaveLength(3);
  });

  it('returns 404 cross-account', async () => {
    const owner = await setup('owner@x.com');
    const { material_id } = await reserveMaterial(owner, 1);
    const stranger = await setup('stranger@y.com');
    const res = await stranger.app.request(`/materials/${material_id}`, {
      headers: authed(stranger),
    });
    expect(res.status).toBe(404);
  });
});
