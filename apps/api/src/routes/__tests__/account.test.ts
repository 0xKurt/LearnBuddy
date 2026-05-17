// Account route tests. Doc 04 §account.

import { describe, it, expect, beforeEach } from 'vitest';

import { createApp } from '../../app.js';
import { _resetIdempotencyForTests } from '../../lib/idempotency.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

function setup() {
  const deps = createTestDeps();
  const app = createApp({ deps });
  return { app, deps, fake: getFake(deps) };
}

beforeEach(() => {
  _resetIdempotencyForTests();
});

async function signUpAndAuthenticate(
  app: ReturnType<typeof setup>['app'],
  fake: ReturnType<typeof getFake>,
  email = 'returning@example.com',
) {
  const res = await app.request('/auth/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'super-secret-1',
      locale: 'de',
      country_code: 'DE',
    }),
  });
  const body = (await res.json()) as { account_id: string; user_id: string };
  const token = fake.authenticate(body.user_id, email);
  return { token, accountId: body.account_id, userId: body.user_id };
}

describe('GET /account/credits/summary', () => {
  it('returns the bucket + recent events for the authenticated account', async () => {
    const { app, fake } = setup();
    const { token } = await signUpAndAuthenticate(app, fake, 'creds@example.com');

    const res = await app.request('/account/credits/summary', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bucket: { tier: string; current_balance: number } | null;
      recent_events: Array<{ delta: number; reason: string }>;
    };
    expect(body.bucket?.tier).toBe('trial');
    expect(body.bucket?.current_balance).toBe(1500);
    expect(body.recent_events.length).toBeGreaterThan(0);
    expect(body.recent_events.some((e) => e.reason === 'monthly_grant')).toBe(true);
  });

  it('returns 401 without bearer', async () => {
    const { app } = setup();
    const res = await app.request('/account/credits/summary', { method: 'GET' });
    expect(res.status).toBe(401);
  });
});

describe('GET /account', () => {
  it('rejects unauthenticated', async () => {
    const { app } = setup();
    const res = await app.request('/account', { method: 'GET' });
    expect(res.status).toBe(401);
    const err = (await res.json()) as { error: { code: string } };
    expect(err.error.code).toBe('unauthenticated');
  });

  it('returns the account + trial subscription + null learner for a fresh signup', async () => {
    const { app, fake } = setup();
    const { token, accountId } = await signUpAndAuthenticate(app, fake);

    const res = await app.request('/account', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      display_name: string | null;
      locale: string;
      country_code: string;
      subscription: { tier: string; status: string; trial_ends_at: string | null };
      consent: null | { version: string; accepted_at: string };
      learner: null | { id: string };
    };
    expect(body.id).toBe(accountId);
    expect(body.display_name).toBeNull();
    expect(body.locale).toBe('de');
    expect(body.country_code).toBe('DE');
    expect(body.subscription.tier).toBe('trial');
    expect(body.subscription.status).toBe('trial');
    expect(typeof body.subscription.trial_ends_at).toBe('string');
    expect(body.consent).toBeNull();
    expect(body.learner).toBeNull();
  });

  it('reflects consent once POST /auth/account/consent has run', async () => {
    const { app, fake } = setup();
    const { token } = await signUpAndAuthenticate(app, fake, 'with-consent@example.com');

    await app.request('/auth/account/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ accepted: true, version: '2026-05-01' }),
    });

    const res = await app.request('/account', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { consent: { version: string; accepted_at: string } | null };
    expect(body.consent).not.toBeNull();
    expect(body.consent!.version).toBe('2026-05-01');
    expect(body.consent!.accepted_at).toBeTruthy();
  });

  it('returns the active learner once one has been created', async () => {
    const { app, fake } = setup();
    const { token } = await signUpAndAuthenticate(app, fake, 'with-learner@example.com');

    const created = await app.request('/learners', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        display_name: 'Anna',
        birth_year: 1985,
        grade_level: 13,
        ui_locale: 'de',
        avatar_id: 1,
        preferred_answer_mode: 'voice',
      }),
    });
    const learner = (await created.json()) as { id: string; display_name: string };

    const res = await app.request('/account', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { learner: { id: string; display_name: string } | null };
    expect(body.learner).not.toBeNull();
    expect(body.learner!.id).toBe(learner.id);
    expect(body.learner!.display_name).toBe('Anna');
  });

  it('omits an archived learner', async () => {
    const { app, fake } = setup();
    const { token } = await signUpAndAuthenticate(app, fake, 'archived-learner@example.com');

    const created = await app.request('/learners', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        display_name: 'Anna',
        birth_year: 1985,
        grade_level: 13,
        ui_locale: 'de',
        avatar_id: 1,
        preferred_answer_mode: 'voice',
      }),
    });
    const learner = (await created.json()) as { id: string };

    await app.request(`/learners/${learner.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });

    const res = await app.request('/account', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { learner: { id: string } | null };
    expect(body.learner).toBeNull();
  });
});
