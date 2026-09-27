// After a privacy-text version bump nothing is processed for an account until it agreed
// again — in the API (identity.int.test.ts) and in the scheduler; erasure never waits, and a
// phone can still be unregistered. docs/privacy.md §Consent.
// requires live verification in Claude Code session (needs a running Postgres)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enqueueJob } from '../modules/scheduler/jobs.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  enableContact,
  onboard,
  TEST_TICK_SECRET,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
}

describe.skipIf(!dbReady)('outdated consent in the background', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T13:00:00Z' });
  });
  afterEach(async () => {
    await env.close();
  });

  const outdate = (accountId: string) =>
    env.db.query(`update accounts set consent_version = '2020-01-01' where id = $1`, [accountId]);

  it('Buddy checks and outreach wait until the account agreed again (p2-ml-consent-version-not-enforced-server-side)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: env.clock.now(),
      dedupeKey: 'check:consent',
      payload: { reason: 'checkin_requested', note: 'consent' },
    });
    await env.db.query(
      `insert into buddy_outreach (learner_id, kind, origin, topic_key, dedupe_key, title, body, status,
                                   send_at, expires_at, created_at)
       values ($1, 'idea', 'buddy', 't', 'd', 'Titel', 'Text', 'scheduled', $2, $3, $2)`,
      [l.learnerId, env.clock.now(), new Date(env.clock.now().getTime() + 6 * 3_600_000)],
    );
    await outdate(l.accountId);
    await tick(env);
    const job = await env.db.one<{ status: string }>(
      `select status from jobs where dedupe_key = 'check:consent'`,
    );
    expect(job.status).toBe('queued');
    const out = await env.db.one<{ status: string }>(
      `select status from buddy_outreach where learner_id = $1`,
      [l.learnerId],
    );
    expect(out.status).toBe('scheduled');

    // Agreed again: the waiting work runs.
    await env.db.query(`update accounts set consent_version = $2 where id = $1`, [
      l.accountId,
      env.deps.config.CONSENT_VERSION,
    ]);
    env.clock.minutes(30); // she has left the app meanwhile
    await tick(env);
    const ran = await env.db.one<{ status: string }>(
      `select status from jobs where dedupe_key = 'check:consent'`,
    );
    expect(ran.status).toBe('done');
    const after = await env.db.one<{ status: string }>(
      `select status from buddy_outreach where learner_id = $1 and dedupe_key = 'd'`,
      [l.learnerId],
    );
    expect(after.status).not.toBe('scheduled');
  });

  it('a phone can still be unregistered while the new text waits for consent', async () => {
    const l = await onboard(env);
    const token = 'ExponentPushToken[consent-test-000]';
    expect(
      (
        await l.api.post('/buddy/push-tokens', {
          token,
          platform: 'ios',
          device_id: 'install-0123456789abcdef',
        })
      ).status,
    ).toBe(200);
    await outdate(l.accountId);
    expect((await l.api.get('/buddy')).status).toBe(409);
    expect((await l.api.delete('/buddy/push-tokens', { token })).status).toBe(200);
    expect(await env.db.query(`select 1 from push_tokens where token = $1`, [token])).toEqual([]);
  });
});
