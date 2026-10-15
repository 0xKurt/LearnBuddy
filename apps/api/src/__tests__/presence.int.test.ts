// Her presence is written at most once a minute (#671 F14-c, #637), against a real Postgres.
// requires live verification in Claude Code session (needs a running Postgres)
//
// Every request of hers wrote `last_seen_at` into her settings row — each poll, each spoken
// sentence — a write on the row her turns lock. "In the app now" (modules/buddy/inApp.ts) asks
// for the last three minutes, so a minute's precision is all it needs.
//
// What must hold:
//   · the first request records her presence;
//   · within the minute no request writes the row again (its row version stays);
//   · after a minute the next request records it anew;
//   · a new time zone is still taken at once, minute or not (it is fenced context, rule 4).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('her presence, once a minute', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  });
  afterAll(async () => {
    await env?.close();
  });

  const row = (learnerId: string) =>
    env.db.one<{ last_seen_at: Date; timezone: string; version: string }>(
      `select last_seen_at, timezone, xmin::text as version from buddy_settings
        where learner_id = $1`,
      [learnerId],
    );

  it('writes it on the first request, not again within the minute, and anew after it', async () => {
    const l = await onboard(env);
    const first = env.clock.advance(5_000);
    expect((await l.api.get('/buddy')).status).toBe(200);
    const seen = await row(l.learnerId);
    expect(seen.last_seen_at.getTime()).toBe(first.getTime());

    env.clock.advance(20_000);
    await l.api.get('/buddy');
    env.clock.advance(30_000);
    await l.api.get('/buddy');
    const within = await row(l.learnerId);
    expect(within.last_seen_at.getTime()).toBe(first.getTime());
    expect(within.version).toBe(seen.version);

    const later = env.clock.advance(15_000);
    await l.api.get('/buddy');
    expect((await row(l.learnerId)).last_seen_at.getTime()).toBe(later.getTime());
  });

  it('takes a new time zone at once, inside the minute', async () => {
    const l = await onboard(env);
    await l.api.get('/buddy');
    env.clock.advance(10_000);
    await l.api.with({ 'x-timezone': 'America/New_York' }).get('/buddy');
    expect((await row(l.learnerId)).timezone).toBe('America/New_York');
  });
});
