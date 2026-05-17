// DSGVO export/delete + credits summary + admin allowlist enforcement.

import { expect, test } from '@playwright/test';

import { authedHeaders, signUpAccount, uniqueEmail } from './helpers.js';

test('DSGVO export request flows', async ({ request }) => {
  const acct = await signUpAccount(request, uniqueEmail('dsgvo'));

  // Queue export.
  const exp = await request.post('/dsgvo/export', {
    headers: authedHeaders(acct),
  });
  expect(exp.status()).toBe(202);
  const expBody = (await exp.json()) as { request_id: string; queued: boolean };
  expect(expBody.queued).toBe(true);

  // Status query returns the row.
  const status = await request.get(`/dsgvo/requests/${expBody.request_id}`, {
    headers: authedHeaders(acct),
  });
  expect(status.status()).toBe(200);
  const statusBody = (await status.json()) as { kind: string; status: string };
  expect(statusBody.kind).toBe('export');
});

test('DSGVO delete-account is idempotent + cancellable', async ({ request }) => {
  const acct = await signUpAccount(request, uniqueEmail('dsgvo-del'));

  const first = await request.post('/dsgvo/delete-account', {
    headers: authedHeaders(acct),
  });
  expect(first.status()).toBe(202);
  const firstBody = (await first.json()) as { request_id: string };

  const second = await request.post('/dsgvo/delete-account', {
    headers: authedHeaders(acct),
  });
  // Second call returns the same request id (idempotent).
  const secondBody = (await second.json()) as { request_id: string };
  expect(secondBody.request_id).toBe(firstBody.request_id);

  // Cancel.
  const cancel = await request.post(`/dsgvo/delete-account/${firstBody.request_id}/cancel`, {
    headers: authedHeaders(acct),
  });
  expect(cancel.status()).toBe(200);
});

test('credits/summary returns bucket + recent events', async ({ request }) => {
  const acct = await signUpAccount(request, uniqueEmail('credits'));
  const res = await request.get('/account/credits/summary', {
    headers: authedHeaders(acct),
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    bucket: { tier: string; current_balance: number } | null;
    recent_events: Array<{ reason: string; delta: number }>;
  };
  expect(body.bucket?.tier).toBe('trial');
  expect(body.bucket?.current_balance).toBeGreaterThan(0);
  expect(body.recent_events.some((e) => e.reason === 'monthly_grant')).toBe(true);
});

test('GET /render/latex returns immutable SVG', async ({ request }) => {
  const res = await request.get(`/render/latex?expression=${encodeURIComponent('a^2 + b^2')}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/svg+xml');
  expect(res.headers()['cache-control']).toContain('immutable');
  const body = await res.text();
  expect(body).toContain('<svg');
});

test('GET /render/latex 422s on malformed input', async ({ request }) => {
  const res = await request.get(`/render/latex?expression=${encodeURIComponent('\\frac{')}`);
  expect(res.status()).toBe(422);
});
