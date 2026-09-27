// The production trigger chain for background work (docs/architecture.md §Background work):
// pg_cron runs lb_invoke_tick() every minute, which reads URL and secret from Vault and posts
// to {lb_api_url}/internal/tick through pg_net. pg_cron and pg_net are stand-ins here (the
// shim records the request instead of sending it); the recorded request is replayed against
// the real app. Audit tick-trigger-path-untested. What stays unverified: the hosted pg_cron
// schedule actually firing and pg_net reaching the deploy (docs/architecture.md §Testing).
// requires live verification in Claude Code session (needs a running Postgres)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, TEST_TICK_SECRET, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type Recorded = { url: string; headers: Record<string, string>; body: unknown };

describe.skipIf(!dbReady)('scheduler trigger chain', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
  });
  afterEach(async () => {
    await env.close();
  });

  it('is scheduled every minute', async () => {
    const jobs = await env.db.query<{ schedule: string; command: string }>(
      `select schedule, command from cron.job where jobname = 'lb-tick'`,
    );
    expect(jobs).toEqual([{ schedule: '* * * * *', command: 'select lb_invoke_tick();' }]);
  });

  it('does nothing without the Vault secrets', async () => {
    await env.db.query('select lb_invoke_tick()');
    expect(await env.db.query('select 1 from net.test_requests')).toEqual([]);
  });

  it('posts to the API with the secret, and the API runs the tick and reports healthy', async () => {
    await env.db.query(
      `insert into vault.decrypted_secrets (name, decrypted_secret)
       values ('lb_api_url', 'https://api.example.test/v1'), ('lb_tick_secret', $1)`,
      [TEST_TICK_SECRET],
    );
    const before = await env.app.request('/v1/health');
    expect(before.status).toBe(503);

    await env.db.query('select lb_invoke_tick()');
    const sent = await env.db.query<Recorded>('select url, headers, body from net.test_requests');
    expect(sent).toHaveLength(1);
    const req = sent[0]!;
    const url = new URL(req.url);
    expect(url.pathname).toBe('/v1/internal/tick');
    expect(req.headers['x-tick-secret']).toBe(TEST_TICK_SECRET);

    const res = await env.app.request(url.pathname, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    expect(res.status).toBe(200);
    const health = await env.app.request('/v1/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, scheduler: { ok: true } });
  });

  it('refuses a tick with a wrong secret', async () => {
    const res = await env.app.request('/v1/internal/tick', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tick-secret': 'wrong-secret' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });
});
