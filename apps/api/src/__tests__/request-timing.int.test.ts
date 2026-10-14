// Where a request's time went, for every answer and not only the streamed ones (issue #626):
// the `Server-Timing` header splits the server's share into sign-in, database and model, and a
// request that called a model writes its `[timing]` line — so a slow "Prüfen" on the phone can be
// lined up with what the server waited for.
// requires live verification in Claude Code session (needs a running Postgres)

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const answer = (reply: string) => ({
  json: { lookups: [], actions: [], reply, options: null, asks_permission: false },
});

describe.skipIf(!dbReady)('request timing', () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-14T13:30:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => env.close());

  const call = (method: string, path: string, body?: unknown) =>
    env.app.request(`/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${l.token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  it('names the sign-in, the database round trips and the model time in Server-Timing', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const res = await call('GET', '/materials');
      expect(res.status).toBe(200);
      const header = res.headers.get('server-timing') ?? '';
      expect(header).toMatch(/(^|, )auth;dur=\d+/);
      expect(header).toMatch(/(^|, )done;dur=\d+/);
      const queries = Number(/db;dur=\d+;desc="(\d+) queries"/.exec(header)?.[1] ?? 0);
      expect(queries).toBeGreaterThan(0);
      expect(header).toContain('model;dur=0;desc="0 calls"');
      // Fast and without a model: no log line for it.
      expect(info.mock.calls.some((a) => String(a[0]).startsWith('[timing]'))).toBe(false);
    } finally {
      info.mockRestore();
    }
  });

  it('logs a request that called the model, by route pattern and numbers only', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      env.llm.script('buddy_turn', answer('Ein Nenner steht unter dem Bruchstrich.'));
      const res = await call('POST', '/buddy/messages', {
        client_message_id: '00000000-0000-4000-8000-000000000626',
        text: 'was ist ein nenner',
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('server-timing')).toMatch(/model;dur=\d+;desc="1 calls"/);
      const lines = info.mock.calls
        .map((a) => String(a[0]))
        .filter((line) => line.startsWith('[timing]'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(
        /^\[timing\] POST \/v1\/buddy\/messages auth=\d+ done=\d+ db=\d+\/\d+ms model=1\/\d+ms$/,
      );
      expect(lines[0]).not.toContain(l.learnerId);
      expect(lines[0]).not.toContain('nenner');
    } finally {
      info.mockRestore();
    }
  });
});
