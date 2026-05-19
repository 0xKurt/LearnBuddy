// Explain route tests. Doc 04 §POST /explain + Doc 08 §estimated-costs.
//
// Covers: happy-path credit debit+settle, 402 on insufficient credits,
// learner-not-found 404, and auth failures.

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
    body: JSON.stringify({ email, password: 'pw123456', locale: 'de', country_code: 'DE' }),
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
      display_name: 'Lena',
      birth_date: '2006-01-15',
      grade_level: 10,
      ui_locale: 'de',
      avatar_id: 2,
      preferred_answer_mode: 'text',
    }),
  });
  const learner = (await learnerRes.json()) as { id: string };
  return { app, deps, fake, token, accountId: account_id, learnerId: learner.id };
}

function authed(s: Setup) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${s.token}`,
    'x-learner-id': s.learnerId,
  } as Record<string, string>;
}

describe('POST /explain', () => {
  it('returns explanation text and debits credits', async () => {
    const s = await setup();
    const balanceBefore = s.fake.tables
      .get('credit_buckets')
      ?.find((b) => b.account_id === s.accountId)?.current_balance as number;

    const res = await s.app.request('/explain', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ topic: 'Photosynthese', style: 'simpler' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string; credits_used: number };
    expect(typeof body.text).toBe('string');
    expect(body.text.length).toBeGreaterThan(0);
    expect(body.credits_used).toBeGreaterThanOrEqual(1);

    const balanceAfter = s.fake.tables
      .get('credit_buckets')
      ?.find((b) => b.account_id === s.accountId)?.current_balance as number;
    expect(balanceAfter).toBeLessThan(balanceBefore);

    const events = s.fake.tables.get('credit_events') ?? [];
    expect(events.some((e) => e.reason === 'explain')).toBe(true);
  });

  it('returns 402 when credits are exhausted', async () => {
    const s = await setup();
    // Drain the bucket.
    const buckets = s.fake.tables.get('credit_buckets') ?? [];
    for (const b of buckets) {
      if (b.account_id === s.accountId) b.current_balance = 0;
    }
    const res = await s.app.request('/explain', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ topic: 'Gravitation', style: 'step-by-step' }),
    });
    expect(res.status).toBe(402);
  });

  it('returns 403 when learner does not belong to this account', async () => {
    const s = await setup();
    const res = await s.app.request('/explain', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${s.token}`,
        'x-learner-id': '00000000-0000-4000-8000-000000000099',
      },
      body: JSON.stringify({ topic: 'Gravitation', style: 'analogy' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 401 without bearer token', async () => {
    const s = await setup();
    const res = await s.app.request('/explain', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-learner-id': s.learnerId },
      body: JSON.stringify({ topic: 'Biologie', style: 'simpler' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a topic that is too short', async () => {
    const s = await setup();
    const res = await s.app.request('/explain', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ topic: 'x', style: 'simpler' }),
    });
    expect(res.status).toBe(400);
  });
});
