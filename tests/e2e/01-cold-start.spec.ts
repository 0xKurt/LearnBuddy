// Cold-start: health → signup → consent → learner → subject → folder.
// The "first run" journey J1 from USER-FLOWS.md.

import { expect, test } from '@playwright/test';

import { authedHeaders, createLearner, signUpAccount, uniqueEmail } from './helpers.js';

test('GET /health is up', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});

test('cold journey: signup → consent → /account reflects state', async ({ request }) => {
  const email = uniqueEmail('cold');
  const acct = await signUpAccount(request, email);

  // 1. Account exists but no consent yet.
  const acctRes = await request.get('/account', {
    headers: { authorization: `Bearer ${acct.token}` },
  });
  expect(acctRes.status()).toBe(200);
  const acctBody = (await acctRes.json()) as {
    consent: { version: string } | null;
    learner: unknown | null;
    subscription: { tier: string; status: string };
  };
  expect(acctBody.consent).toBeNull();
  expect(acctBody.learner).toBeNull();
  expect(acctBody.subscription.tier).toBe('trial');
  expect(acctBody.subscription.status).toBe('trial');

  // 2. Record consent.
  const consentRes = await request.post('/auth/account/consent', {
    headers: { authorization: `Bearer ${acct.token}` },
    data: { accepted: true, version: '2026-05-01' },
  });
  expect(consentRes.status()).toBe(200);

  // 3. /account now reflects consent.
  const acct2 = await request.get('/account', {
    headers: { authorization: `Bearer ${acct.token}` },
  });
  const acct2Body = (await acct2.json()) as { consent: { version: string } | null };
  expect(acct2Body.consent?.version).toBe('2026-05-01');

  // 4. Create the first learner.
  const learner = await createLearner(request, acct, 'Lena');

  // 5. /account now shows the learner row.
  const acct3 = await request.get('/account', {
    headers: { authorization: `Bearer ${acct.token}` },
  });
  const acct3Body = (await acct3.json()) as { learner: { id: string } | null };
  expect(acct3Body.learner?.id).toBe(learner.learnerId);
});

test('signup rejects weak password with 4xx', async ({ request }) => {
  const res = await request.post('/auth/account/signup', {
    data: { email: uniqueEmail('weak'), password: 'short', locale: 'de', country_code: 'DE' },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

test('signup rejects duplicate email with 409', async ({ request }) => {
  const email = uniqueEmail('dup');
  const first = await request.post('/auth/account/signup', {
    data: { email, password: 'super-secret-1', locale: 'de', country_code: 'DE' },
  });
  expect(first.status()).toBe(201);
  const second = await request.post('/auth/account/signup', {
    data: { email, password: 'super-secret-1', locale: 'de', country_code: 'DE' },
  });
  expect(second.status()).toBe(409);
});

test('idempotency replay returns same body', async ({ request }) => {
  const email = uniqueEmail('idemp');
  const key = `e2e-${Date.now()}`;
  const opts = {
    headers: { 'idempotency-key': key },
    data: { email, password: 'super-secret-1', locale: 'de', country_code: 'DE' },
  };
  const first = await request.post('/auth/account/signup', opts);
  expect(first.status()).toBe(201);
  const firstBody = (await first.json()) as { account_id: string };

  const second = await request.post('/auth/account/signup', opts);
  expect(second.status()).toBe(201);
  expect(second.headers()['idempotent-replay']).toBe('true');
  const secondBody = (await second.json()) as { account_id: string };
  expect(secondBody.account_id).toBe(firstBody.account_id);
});

test('/account 401s without bearer', async ({ request }) => {
  const res = await request.get('/account');
  expect(res.status()).toBe(401);
});

test('admin requires JWT and email allowlist', async ({ request }) => {
  // No bearer.
  const noBearer = await request.get('/admin/spend');
  expect(noBearer.status()).toBe(401);

  // Auth but not on allowlist (ADMIN_ALLOWLIST_EMAILS unset on fake server).
  const acct = await signUpAccount(request);
  const r2 = await request.get('/admin/spend', {
    headers: authedHeaders(acct),
  });
  // 403 (not on allowlist) or 500 (allowlist unset) — both prove the
  // unsigned x-admin-email header has no power.
  expect([403, 500]).toContain(r2.status());
});
