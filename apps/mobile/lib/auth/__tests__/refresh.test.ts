// H-28 / repro-26: the real supabase-js refresh against a stubbed token
// endpoint. An outage (5xx, 429, no connection) keeps the session; only a
// definite "this refresh token is over" ends it.
import { createClient, type Session as SbSession } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { localDataOnSignIn } from '../localData.js';
import { createRefresher, RefreshBackoff, refreshFailureOf } from '../refresh.js';

type Stub = (url: string) => Response | Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fresh = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  expires_in: 3600,
  expires_at: 2_000_000_000,
  token_type: 'bearer',
  user: { id: 'u1', aud: 'authenticated', email: 'a@example.test' },
};

function setup(stub: Stub) {
  const client = createClient('http://auth.test', 'anon', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input: RequestInfo | URL) => Promise.resolve(stub(String(input))) },
  });
  let clock = 1_000_000;
  const saved: string[] = [];
  let cleared = 0;
  const backoff = new RefreshBackoff(() => clock);
  const refresh = createRefresher({
    client: client.auth,
    toSession: (s: SbSession) => s.refresh_token,
    save: async (s: string) => {
      saved.push(s);
    },
    clear: async () => {
      cleared += 1;
    },
    backoff,
  });
  return {
    refresh,
    saved,
    cleared: () => cleared,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('refreshing the session (H-28)', () => {
  beforeEach(() => {
    // supabase-js retries 5xx for up to 30 s with sleeps; run them instantly.
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function run<T>(p: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return p;
  }

  it('saves the new tokens', async () => {
    const t = setup(() => json(200, fresh));
    expect(await run(t.refresh('old'))).toBe('new-refresh');
    expect(t.saved).toEqual(['new-refresh']);
  });

  it.each([500, 502, 503, 504, 429])('keeps the session on %i', async (status) => {
    const t = setup(() => json(status, { code: 'unexpected_failure', msg: 'down' }));
    expect(await run(t.refresh('old'))).toBeNull();
    expect(t.cleared()).toBe(0);
  });

  it('keeps the session without a connection and on an unreadable answer', async () => {
    const offline = setup(() => {
      throw new TypeError('Network request failed');
    });
    expect(await run(offline.refresh('old'))).toBeNull();
    expect(offline.cleared()).toBe(0);
    const html = setup(() => new Response('<html>proxy</html>', { status: 500 }));
    expect(await run(html.refresh('old'))).toBeNull();
    expect(html.cleared()).toBe(0);
  });

  it('ends the session only when the refresh token is definitely over', async () => {
    const t = setup(() =>
      json(400, { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }),
    );
    expect(await run(t.refresh('old'))).toBeNull();
    expect(t.cleared()).toBe(1);
    const legacy = setup(() => json(400, { error: 'invalid_grant', error_description: 'bad' }));
    expect(await run(legacy.refresh('old'))).toBeNull();
    expect(legacy.cleared()).toBe(1);
  });

  it('waits before trying again after an outage, then succeeds', async () => {
    let calls = 0;
    let down = true;
    const t = setup(() => {
      calls += 1;
      return down ? json(429, { msg: 'slow down' }) : json(200, fresh);
    });
    await run(t.refresh('old'));
    const after = calls;
    // Immediately again: not even asked (no hammering during an outage).
    expect(await run(t.refresh('old'))).toBeNull();
    expect(calls).toBe(after);
    down = false;
    t.advance(2_000);
    expect(await run(t.refresh('old'))).toBe('new-refresh');
  });

  it('classifies bare errors', () => {
    expect(refreshFailureOf({ status: 0 })).toBe('transient');
    expect(refreshFailureOf({})).toBe('transient');
    expect(refreshFailureOf({ status: 408 })).toBe('transient');
    expect(refreshFailureOf({ name: 'AuthSessionMissingError', status: 400 })).toBe('invalid');
    expect(refreshFailureOf({ status: 403, code: 'bad_jwt' })).toBe('invalid');
  });
});

describe('unsent work across sign-ins (H-28, M-73)', () => {
  it('keeps her own leftovers and wipes only another person’s', () => {
    expect(localDataOnSignIn('u1', 'u1')).toBe('keep');
    expect(localDataOnSignIn(null, 'u1')).toBe('keep');
    expect(localDataOnSignIn('u1', 'u2')).toBe('wipe');
  });
});
