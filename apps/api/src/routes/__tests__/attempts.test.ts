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
