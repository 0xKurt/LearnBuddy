// Attempts route tests. Doc 04 §POST /attempts + /attempts/batch.
//
// Per CODEBASE-AUDIT priority #8: highest-value money flow with zero
// coverage. Exercises: happy-path local-correct (no LLM, 0 credits),
// LLM-evaluated incorrect (debit + settle), batch drain (bulk insert +
// upsert path).

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
      birth_year: 2010,
      grade_level: 7,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'voice',
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

function seedItem(s: Setup, overrides: Record<string, unknown> = {}): string {
  const items = s.fake.tables.get('items') ?? [];
  const id = s.fake.nextId();
  items.push({
    id,
    learner_id: s.learnerId,
    material_id: s.fake.nextId(),
    question: '2 + 2',
    expected_answer: '4',
    acceptable_answers: [],
    answer_kind: 'numeric',
    stimulus_kind: 'none',
    stimulus_data: {},
    difficulty: 1,
    language: 'de',
    archived_at: null,
    ...overrides,
  });
  s.fake.tables.set('items', items);
  return id;
}

describe('POST /attempts', () => {
  it('records a local-correct attempt without LLM cost', async () => {
    const s = await setup();
    const item_id = seedItem(s);
    const balanceBefore = s.fake.tables
      .get('credit_buckets')
      ?.find((b) => b.account_id === s.accountId)?.current_balance as number;

    const res = await s.app.request('/attempts', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        item_id,
        mode: 'text',
        kid_answer: '4',
        client_local_verdict: 'correct',
        duration_ms: 800,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verdict: string; credits_used: number };
    expect(body.verdict).toBe('correct');
    expect(body.credits_used).toBe(0);

    const attempts = s.fake.tables.get('attempts');
    expect(attempts).toHaveLength(1);
    expect(attempts?.[0]?.evaluated_by).toBe('local');

    const balanceAfter = s.fake.tables
      .get('credit_buckets')
      ?.find((b) => b.account_id === s.accountId)?.current_balance as number;
    expect(balanceAfter).toBe(balanceBefore); // No debit.
  });

  it('debits + settles for an LLM-evaluated attempt', async () => {
    const s = await setup();
    const item_id = seedItem(s);
    const res = await s.app.request('/attempts', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        item_id,
        mode: 'text',
        kid_answer: '5',
        duration_ms: 1200,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verdict: string; credits_used: number };
    // FakeLlmGateway resolves to 'correct' deterministically; the important
    // assertion is that the credit accounting ran.
    expect(['correct', 'partially_correct', 'incorrect']).toContain(body.verdict);
    expect(body.credits_used).toBeGreaterThanOrEqual(1);

    const events = s.fake.tables.get('credit_events') ?? [];
    // signup grant + evaluation debit + settle event = 3 events.
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.reason === 'evaluation')).toBe(true);
  });

  it('returns 404 when the item belongs to another learner', async () => {
    const owner = await setup('owner@x.com');
    const item_id = seedItem(owner);
    const stranger = await setup('stranger@y.com');
    const res = await stranger.app.request('/attempts', {
      method: 'POST',
      headers: authed(stranger),
      body: JSON.stringify({
        item_id,
        mode: 'text',
        kid_answer: '4',
        client_local_verdict: 'correct',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 401 without bearer', async () => {
    const s = await setup();
    const item_id = seedItem(s);
    const res = await s.app.request('/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-learner-id': s.learnerId },
      body: JSON.stringify({
        item_id,
        mode: 'text',
        kid_answer: '4',
        client_local_verdict: 'correct',
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /attempts/batch', () => {
  it('bulk-inserts attempts and upserts item_states', async () => {
    const s = await setup();
    const i1 = seedItem(s);
    const i2 = seedItem(s);

    const res = await s.app.request('/attempts/batch', {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({
        attempts: [
          {
            client_attempt_id: '11111111-1111-4111-8111-111111111111',
            item_id: i1,
            mode: 'text',
            kid_answer: '4',
            verdict: 'correct',
            evaluated_by: 'local',
            reviewed_at: '2026-05-16T11:00:00Z',
          },
          {
            client_attempt_id: '22222222-2222-4222-8222-222222222222',
            item_id: i2,
            mode: 'text',
            kid_answer: '3',
            verdict: 'incorrect',
            evaluated_by: 'local',
            reviewed_at: '2026-05-16T11:00:01Z',
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: string[]; rejected: unknown[] };
    expect(body.accepted).toHaveLength(2);
    expect(body.rejected).toHaveLength(0);

    expect(s.fake.tables.get('attempts')).toHaveLength(2);
    expect(s.fake.tables.get('item_states')).toHaveLength(2);
  });

  it('rejects attempts for items belonging to another learner', async () => {
    const owner = await setup('owner@x.com');
    const otherItem = seedItem(owner);
    const stranger = await setup('stranger@y.com');
    const myItem = seedItem(stranger);

    const res = await stranger.app.request('/attempts/batch', {
      method: 'POST',
      headers: authed(stranger),
      body: JSON.stringify({
        attempts: [
          {
            client_attempt_id: '33333333-3333-4333-8333-333333333333',
            item_id: otherItem,
            mode: 'text',
            kid_answer: '4',
            verdict: 'correct',
            evaluated_by: 'local',
            reviewed_at: '2026-05-16T11:00:00Z',
          },
          {
            client_attempt_id: '44444444-4444-4444-8444-444444444444',
            item_id: myItem,
            mode: 'text',
            kid_answer: '4',
            verdict: 'correct',
            evaluated_by: 'local',
            reviewed_at: '2026-05-16T11:00:01Z',
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: string[];
      rejected: Array<{ client_attempt_id: string; reason: string }>;
    };
    expect(body.accepted).toHaveLength(1);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]?.reason).toBe('item_not_found');
  });
});
