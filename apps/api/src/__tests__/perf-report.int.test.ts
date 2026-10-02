// The device's waiting times reach the server summed up, and nothing else does (issue #169,
// docs/privacy.md §Device timing): fixed actions, fixed buckets, a count — no learner, no account,
// no content. Anything outside the fixed lists is refused, never stored as text.
// requires live verification in Claude Code session (needs a running Postgres)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { purgePerf } from '../modules/perf/service.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  apiClient,
  createTestEnv,
  onboard,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('device timing (issue #169)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-02T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => {
    await env?.close();
  });

  const counts = () =>
    env.db.query<{ action: string; bucket_ms: number; count: number }>(
      `select action, bucket_ms, count from perf_rollups
        where day = '2026-10-02' and platform = 'android' and build = 'release'
        order by action, bucket_ms`,
    );

  it('adds each report to the day, per action and bucket', async () => {
    const report = {
      platform: 'android',
      build: 'release',
      spans: [
        { action: 'reply', bucket_ms: 3000, count: 4 },
        { action: 'reply', bucket_ms: 2500, count: 1 },
        // The same key twice in one report is summed, not refused.
        { action: 'reply', bucket_ms: 3000, count: 1 },
        { action: 'next_question', bucket_ms: 50, count: 7 },
      ],
      counters: [{ counter: 'speech_ahead_used', count: 3 }],
    };
    const first = await l.api.post<{ ok: boolean; rows: number }>('/perf', report);
    expect(first.status).toBe(200);
    expect(first.body.rows).toBe(4);
    await l.api.post('/perf', report);
    expect(await counts()).toEqual([
      { action: 'next_question', bucket_ms: 50, count: 14 },
      { action: 'reply', bucket_ms: 2500, count: 2 },
      { action: 'reply', bucket_ms: 3000, count: 10 },
      { action: 'speech_ahead_used', bucket_ms: -1, count: 6 },
    ]);
  });

  it('stores nobody: the table has no column that could point to a person', async () => {
    const columns = await env.db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'perf_rollups' order by ordinal_position`,
    );
    expect(columns.map((c) => c.column_name)).toEqual([
      'day',
      'platform',
      'build',
      'action',
      'bucket_ms',
      'count',
    ]);
  });

  it('refuses anything outside the fixed lists', async () => {
    const base = { platform: 'android', build: 'release', counters: [] };
    for (const bad of [
      { ...base, spans: [{ action: 'Lena tippt Brüche', bucket_ms: 50, count: 1 }] },
      { ...base, spans: [{ action: 'reply', bucket_ms: 1234, count: 1 }] },
      { ...base, spans: [{ action: 'reply', bucket_ms: 50, count: 100_000 }] },
      { ...base, platform: 'toaster', spans: [] },
      { ...base, spans: [], counters: [{ counter: 'anything', count: 1 }] },
    ]) {
      const res = await l.api.post('/perf', bad);
      expect(res.status).toBe(422);
    }
    expect((await counts()).reduce((n, r) => n + r.count, 0)).toBe(32);
  });

  it('needs a signed-in app', async () => {
    const res = await apiClient(env, null).post('/perf', {
      platform: 'web',
      build: 'dev',
      spans: [{ action: 'send', bucket_ms: 50, count: 1 }],
    });
    expect(res.status).toBe(401);
  });

  it('keeps the counts 180 days', async () => {
    env.clock.hours(24 * 179);
    expect(await purgePerf(env.deps)).toBe(0);
    env.clock.hours(48);
    expect(await purgePerf(env.deps)).toBe(4);
  });
});
