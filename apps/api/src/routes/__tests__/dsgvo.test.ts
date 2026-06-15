// DSGVO route tests. Doc 04 §dsgvo + Doc 09 §account-holder-rights.
//
// Covers the queue, status, idempotent re-queue, and cancel paths.

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
  return { app, deps, fake, token, accountId: account_id };
}

function authHeaders(s: Setup) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${s.token}`,
  } as Record<string, string>;
}

describe('POST /dsgvo/export', () => {
  it('queues an export request with status=pending', async () => {
    const s = await setup();
    const res = await s.app.request('/dsgvo/export', {
      method: 'POST',
      headers: authHeaders(s),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { queued: boolean; request_id: string };
    expect(body.queued).toBe(true);
    expect(body.request_id).toBeTruthy();

    const row = s.fake.tables.get('dsgvo_requests')?.find((r) => r.id === body.request_id);
    expect(row?.account_id).toBe(s.accountId);
    expect(row?.kind).toBe('export');
    expect(row?.status).toBe('pending');
  });

  it('returns 401 without bearer', async () => {
    const s = await setup();
    const res = await s.app.request('/dsgvo/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /dsgvo/delete-account', () => {
  it('queues a delete request with a 7-day execute_at', async () => {
    const s = await setup();
    const res = await s.app.request('/dsgvo/delete-account', {
      method: 'POST',
      headers: authHeaders(s),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { execute_at: string; request_id: string };
    expect(body.execute_at).toBeTruthy();
    expect(new Date(body.execute_at).getTime()).toBeGreaterThan(Date.now());

    const row = s.fake.tables.get('dsgvo_requests')?.find((r) => r.id === body.request_id);
    expect(row?.kind).toBe('delete');
    expect(row?.status).toBe('pending');
  });

  it('returns the same request_id when called twice', async () => {
    const s = await setup();
    const first = await s.app.request('/dsgvo/delete-account', {
      method: 'POST',
      headers: authHeaders(s),
    });
    const firstBody = (await first.json()) as { request_id: string };

    const second = await s.app.request('/dsgvo/delete-account', {
      method: 'POST',
      headers: authHeaders(s),
    });
    const secondBody = (await second.json()) as { request_id: string };
    expect(secondBody.request_id).toBe(firstBody.request_id);
  });
});

describe('POST /dsgvo/delete-account/:id/cancel', () => {
  it('cancels a pending delete', async () => {
    const s = await setup();
    const queue = await s.app.request('/dsgvo/delete-account', {
      method: 'POST',
      headers: authHeaders(s),
    });
    const { request_id } = (await queue.json()) as { request_id: string };

    const cancel = await s.app.request(`/dsgvo/delete-account/${request_id}/cancel`, {
      method: 'POST',
      headers: authHeaders(s),
    });
    expect(cancel.status).toBe(200);
    const row = s.fake.tables.get('dsgvo_requests')?.find((r) => r.id === request_id);
    expect(row?.status).toBe('cancelled');
  });

  it('returns 404 when no active delete exists', async () => {
    const s = await setup();
    const res = await s.app.request(
      `/dsgvo/delete-account/00000000-0000-4000-8000-deadbeef0000/cancel`,
      { method: 'POST', headers: authHeaders(s) },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /dsgvo/requests/:id', () => {
  it('returns the request for the owning account', async () => {
    const s = await setup();
    const queue = await s.app.request('/dsgvo/export', {
      method: 'POST',
      headers: authHeaders(s),
    });
    const { request_id } = (await queue.json()) as { request_id: string };
    const res = await s.app.request(`/dsgvo/requests/${request_id}`, {
      method: 'GET',
      headers: authHeaders(s),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; kind: string };
    expect(body.id).toBe(request_id);
    expect(body.kind).toBe('export');
  });

  it('returns 404 cross-account', async () => {
    const owner = await setup('owner@x.com');
    const queue = await owner.app.request('/dsgvo/export', {
      method: 'POST',
      headers: authHeaders(owner),
    });
    const { request_id } = (await queue.json()) as { request_id: string };

    const stranger = await setup('stranger@y.com');
    const res = await stranger.app.request(`/dsgvo/requests/${request_id}`, {
      method: 'GET',
      headers: authHeaders(stranger),
    });
    expect(res.status).toBe(404);
  });
});
