// Admin route tests. Doc 04 §admin.
//
// Verifies the two-layer auth (Supabase JWT + allowlist) and the /spend
// aggregation. Critical for the security-perimeter regression test set.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createApp } from '../../app.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

beforeEach(() => {
  process.env.ADMIN_ALLOWLIST_EMAILS = 'ops@learnbuddy.app,kurt@learnbuddy.app';
});
afterEach(() => {
  delete process.env.ADMIN_ALLOWLIST_EMAILS;
});

async function setupAccount(email: string) {
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
  return { app, fake, token, accountId: account_id };
}

describe('admin auth', () => {
  it('returns 401 without a bearer token even with a forged x-admin-email', async () => {
    const { app } = await setupAccount('ops@learnbuddy.app');
    const res = await app.request('/admin/spend', {
      method: 'GET',
      headers: { 'x-admin-email': 'ops@learnbuddy.app' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated as a non-admin email', async () => {
    const s = await setupAccount('stranger@example.com');
    const res = await s.app.request('/admin/spend', {
      method: 'GET',
      headers: { authorization: `Bearer ${s.token}` },
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 with an aggregated spend payload for an allowlisted admin', async () => {
    const s = await setupAccount('ops@learnbuddy.app');
    // Seed a couple of credit events directly.
    const events = s.fake.tables.get('credit_events') ?? [];
    const now = new Date().toISOString();
    events.push({
      id: s.fake.nextId(),
      account_id: s.accountId,
      delta: -20,
      reason: 'materials_create',
      cost_usd_micros: 1500,
      created_at: now,
    });
    events.push({
      id: s.fake.nextId(),
      account_id: s.accountId,
      delta: -1,
      reason: 'evaluation',
      cost_usd_micros: 75,
      created_at: now,
    });
    s.fake.tables.set('credit_events', events);

    const res = await s.app.request('/admin/spend', {
      method: 'GET',
      headers: { authorization: `Bearer ${s.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total_credits: number;
      by_reason: Record<string, { credits: number; usd_micros: number; count: number }>;
      event_count: number;
    };
    expect(body.event_count).toBeGreaterThanOrEqual(2);
    expect(body.by_reason['materials_create']?.credits).toBe(-20);
    expect(body.by_reason['evaluation']?.credits).toBe(-1);
  });
});
