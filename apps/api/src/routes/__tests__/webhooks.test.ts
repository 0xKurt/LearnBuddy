// Webhook route tests. Doc 04 §webhooks + Doc 08 §grants.
//
// Exercises shared-secret verification (constant-time + replay window) and
// the credit grant on INITIAL_PURCHASE.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createApp } from '../../app.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

const WEBHOOK_SECRET = 'test-webhook-secret-1234';

beforeEach(() => {
  process.env.REVENUECAT_WEBHOOK_SECRET = WEBHOOK_SECRET;
});
afterEach(() => {
  delete process.env.REVENUECAT_WEBHOOK_SECRET;
});

async function setupWithRevenuecatUser() {
  const deps = createTestDeps();
  const app = createApp({ deps });
  const fake = getFake(deps);

  const signup = await app.request('/auth/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'paying@example.com',
      password: 'super-secret-1',
      locale: 'de',
      country_code: 'DE',
    }),
  });
  const { account_id } = (await signup.json()) as { account_id: string };

  // Subscriptions row created by signup uses account_id as the
  // revenuecat_app_user_id (mobile sets it that way after Purchases.configure).
  const sub = fake.tables.get('subscriptions')?.find((r) => r.account_id === account_id);
  if (sub) sub.revenuecat_app_user_id = account_id;

  return { app, fake, accountId: account_id };
}

describe('POST /webhooks/revenuecat', () => {
  it('rejects requests without the shared secret with 401', async () => {
    const { app } = await setupWithRevenuecatUser();
    const res = await app.request('/webhooks/revenuecat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: { type: 'INITIAL_PURCHASE', app_user_id: 'anyone' } }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with a wrong secret with 401', async () => {
    const { app } = await setupWithRevenuecatUser();
    const res = await app.request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer wrong-secret-XYZ`,
      },
      body: JSON.stringify({ event: { type: 'INITIAL_PURCHASE', app_user_id: 'anyone' } }),
    });
    expect(res.status).toBe(401);
  });

  it('grants the monthly standard allotment on INITIAL_PURCHASE', async () => {
    const { app, fake, accountId } = await setupWithRevenuecatUser();
    const before = fake.tables.get('credit_buckets')?.find((r) => r.account_id === accountId)
      ?.current_balance as number;

    const res = await app.request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        event: {
          type: 'INITIAL_PURCHASE',
          app_user_id: accountId,
          product_id: 'learnbuddy.standard.monthly',
          expiration_at_ms: Date.now() + 30 * 86_400_000,
          event_timestamp_ms: Date.now(),
        },
      }),
    });
    expect(res.status).toBe(200);

    const sub = fake.tables.get('subscriptions')?.find((r) => r.account_id === accountId);
    expect(sub?.tier).toBe('standard');
    expect(sub?.status).toBe('active');

    const after = fake.tables.get('credit_buckets')?.find((r) => r.account_id === accountId)
      ?.current_balance as number;
    // Standard allotment is 4000, cap is 12000. Before was 1500 trial.
    expect(after).toBe(Math.min(12_000, before + 4000));
  });

  it('ignores events for unknown app_user_id with 200', async () => {
    const { app } = await setupWithRevenuecatUser();
    const res = await app.request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        event: {
          type: 'INITIAL_PURCHASE',
          app_user_id: 'ghost-user',
          product_id: 'learnbuddy.standard.monthly',
          event_timestamp_ms: Date.now(),
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ignored?: boolean };
    expect(body.ignored).toBe(true);
  });

  it('rejects events older than the replay window with 400', async () => {
    const { app, accountId } = await setupWithRevenuecatUser();
    const res = await app.request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        event: {
          type: 'RENEWAL',
          app_user_id: accountId,
          product_id: 'learnbuddy.standard.monthly',
          // 10 minutes ago → outside the 5-minute replay window.
          event_timestamp_ms: Date.now() - 10 * 60_000,
        },
      }),
    });
    expect(res.status).toBe(422);
  });
});
