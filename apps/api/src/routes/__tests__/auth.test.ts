// Auth route tests. Doc 04 §auth.
//
// Covers POST /auth/account/signup and POST /auth/account/consent.
// Uses the in-memory Supabase fake — see CLAUDE.md "Never mock the database"
// — this is a unit-level test of the route layer. The slice is not considered
// complete until the same paths are exercised against a real Supabase local
// in `pnpm db:start` integration tests.

import { describe, it, expect, beforeEach } from 'vitest';

import { createApp } from '../../app.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

function setup() {
  const deps = createTestDeps();
  const app = createApp({ deps });
  return { app, deps, fake: getFake(deps) };
}

describe('POST /auth/account/signup', () => {
  it('creates account + subscription + credit bucket on happy path', async () => {
    const { app, fake } = setup();
    const res = await app.request('/auth/account/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'lena@example.com',
        password: 'super-secret-1',
        locale: 'de',
        country_code: 'DE',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      account_id: string;
      user_id: string;
      requires_verification: boolean;
    };
    expect(body.requires_verification).toBe(true);
    expect(body.account_id).toBeTruthy();
    expect(body.user_id).toBeTruthy();

    expect(fake.tables.get('accounts')).toHaveLength(1);
    expect(fake.tables.get('subscriptions')).toHaveLength(1);
    expect(fake.tables.get('credit_buckets')).toHaveLength(1);
    expect(fake.tables.get('credit_events')).toHaveLength(1);

    const sub = fake.tables.get('subscriptions')?.[0];
    expect(sub).toBeDefined();
    expect(sub?.tier).toBe('trial');
    expect(sub?.status).toBe('trial');
    expect(typeof sub?.trial_ends_at).toBe('string');

    const bucket = fake.tables.get('credit_buckets')?.[0];
    expect(bucket).toBeDefined();
    expect(bucket?.current_balance).toBe(1500);
    expect(bucket?.monthly_allotment).toBe(1500);
    expect(bucket?.rollover_cap).toBe(4500);
  });

  it('rejects duplicate email with 409', async () => {
    const { app } = setup();
    const body = JSON.stringify({
      email: 'dup@example.com',
      password: 'super-secret-1',
      locale: 'de',
      country_code: 'DE',
    });
    const first = await app.request('/auth/account/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(first.status).toBe(201);

    const second = await app.request('/auth/account/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(second.status).toBe(409);
    const err = (await second.json()) as { error: { code: string } };
    expect(err.error.code).toBe('conflict');
  });

  it('rejects weak password (< 8) with 400 from zod validator', async () => {
    const { app } = setup();
    const res = await app.request('/auth/account/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'weak@example.com',
        password: 'short',
        locale: 'de',
        country_code: 'DE',
      }),
    });
    // zValidator returns 400 by default for schema failures.
    expect(res.status).toBe(400);
  });

  it('rejects invalid email shape', async () => {
    const { app } = setup();
    const res = await app.request('/auth/account/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'super-secret-1',
        locale: 'de',
        country_code: 'DE',
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/account/consent', () => {
  async function signUpAndAuthenticate(app: ReturnType<typeof setup>['app'], fake: ReturnType<typeof getFake>) {
    const res = await app.request('/auth/account/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'consent@example.com',
        password: 'super-secret-1',
        locale: 'de',
        country_code: 'DE',
      }),
    });
    const body = (await res.json()) as { account_id: string; user_id: string };
    const token = fake.authenticate(body.user_id, 'consent@example.com');
    return { token, accountId: body.account_id };
  }

  it('records consent version + accepted_at on the account', async () => {
    const { app, fake } = setup();
    const { token, accountId } = await signUpAndAuthenticate(app, fake);

    const res = await app.request('/auth/account/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ accepted: true, version: '2026-05-01' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string; accepted_at: string };
    expect(body.version).toBe('2026-05-01');
    expect(body.accepted_at).toBeTruthy();

    const account = fake.tables.get('accounts')!.find((a) => a.id === accountId)!;
    expect(account.dsgvo_consent_version).toBe('2026-05-01');
    expect(account.dsgvo_consent_at).toBeTruthy();
  });

  it('rejects unauthenticated', async () => {
    const { app } = setup();
    const res = await app.request('/auth/account/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accepted: true, version: '2026-05-01' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects mismatched consent version', async () => {
    const { app, fake } = setup();
    const { token } = await signUpAndAuthenticate(app, fake);

    const res = await app.request('/auth/account/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ accepted: true, version: '2024-01-01' }),
    });
    expect(res.status).toBe(422);
  });
});
