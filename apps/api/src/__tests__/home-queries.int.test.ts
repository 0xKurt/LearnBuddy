// The home is read inside one snapshot on one connection (modules/buddy/home.ts), so every
// statement is a round trip of its own (#712, #637): at the production distance (3.2 ms, #447)
// each one adds to every turn and every poll. Facts that are read together are asked together.
// requires live verification in Claude Code session (scripted model, fake auth)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('the home’s round trips', () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-14T13:30:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => env.close());

  it('reads a plain home in at most 35 statements', async () => {
    const res = await env.app.request('/v1/buddy', {
      headers: { authorization: `Bearer ${l.token}` },
    });
    expect(res.status).toBe(200);
    const queries = Number(
      /db;dur=\d+;desc="(\d+) queries"/.exec(res.headers.get('server-timing') ?? '')?.[1],
    );
    // 39 before #712: the system status took four statements, what is working two.
    expect(queries).toBeLessThanOrEqual(35);
  });
});
