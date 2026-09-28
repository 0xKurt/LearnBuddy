// With her 16th birthday the learner decides for herself (EDPB §147–149, issue #31): the
// parents' consent carried her until then, from then on hers does. What must hold: she is
// asked exactly once, nothing is taken from her while she has not answered, under 16 it is
// not hers to give, and the parents' record is never rewritten.
// requires live verification in Claude Code session (needs a running Postgres)

import type { MeResponse } from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const YEAR = 365 * 86_400_000;

describe.skipIf(!dbReady)('her own consent from 16', () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-29T09:00:00Z' });
    // Turns 16 in a bit less than two years.
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-02-10' });
  });
  afterAll(async () => {
    await env?.close();
  });

  const me = async () => (await l.api.get<MeResponse>('/me')).body;

  it('says nothing while she is 15 — and refuses consent she cannot give yet', async () => {
    const before = await me();
    expect(before.learner?.is_minor).toBe(true);
    expect(before.learner?.own_consent_due).toBe(false);
    const tooEarly = await l.api.post('/learner/consent', {
      consent_version: before.consent_version,
      accept_privacy: true,
    });
    expect(tooEarly.status).toBe(403);
    const row = await env.db.one<{ self_consent_at: Date | null }>(
      `select self_consent_at from learners where id = $1`,
      [l.learnerId],
    );
    expect(row.self_consent_at).toBeNull();
  });

  it('asks her once on her 16th birthday, and stops asking when she agreed', async () => {
    env.clock.advance(2 * YEAR);
    const grown = await me();
    expect(grown.learner?.is_minor).toBe(false);
    expect(grown.learner?.own_consent_due).toBe(true);

    const res = await l.api.post('/learner/consent', {
      consent_version: grown.consent_version,
      accept_privacy: true,
    });
    expect(res.status).toBe(200);
    const after = await me();
    expect(after.learner?.own_consent_due).toBe(false);

    // Hers is recorded — and what the parents agreed to is still there, untouched.
    const row = await env.db.one<{
      self_consent_version: string | null;
      self_consent_at: Date | null;
      minor_consent_at: Date | null;
    }>(
      `select self_consent_version, self_consent_at, minor_consent_at from learners where id = $1`,
      [l.learnerId],
    );
    expect(row.self_consent_version).toBe(grown.consent_version);
    expect(row.self_consent_at).not.toBeNull();
    expect(row.minor_consent_at).not.toBeNull();
  });

  it('refuses a version that is not the current text', async () => {
    const res = await l.api.post('/learner/consent', {
      consent_version: 'something-old',
      accept_privacy: true,
    });
    expect(res.status).toBe(409);
  });

  it('an adult profile is never asked (it agreed for itself from the start)', async () => {
    const adultEnv = await createTestEnv({ start: '2026-09-29T09:00:00Z' });
    try {
      const adult = await onboard(adultEnv, { relation: 'self', birthDate: '1990-05-05' });
      const view = (await adult.api.get<MeResponse>('/me')).body;
      expect(view.learner?.own_consent_due).toBe(false);
    } finally {
      await adultEnv.close();
    }
  });
});
