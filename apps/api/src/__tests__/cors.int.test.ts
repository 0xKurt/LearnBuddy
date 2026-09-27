// The web build gets through CORS with every header the app sends
// (docs/architecture.md §API, §Testing). Regression: the dev stack kept its own
// header list, the app started sending x-app-version (audit M-69), and every
// call from the browser failed its preflight — the app only said "Keine Verbindung".
// requires live verification in Claude Code session (needs a running Postgres)

import { APP_REQUEST_HEADERS } from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createDevApp, DevAuth, DevStorage } from '../testing/dev-app.js';
import { createTestEnv, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const WEB = 'http://localhost:8081';

type Fetcher = { request: (path: string, init: RequestInit) => Response | Promise<Response> };

async function preflight(app: Fetcher, path: string, origin: string, headers: readonly string[]) {
  return app.request(path, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': headers.join(','),
    },
  });
}

function allowed(res: Response): string[] {
  return (res.headers.get('access-control-allow-headers') ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

describe.skipIf(!dbReady)('CORS for the web build', () => {
  let env: TestEnv;
  let dev: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ config: { CORS_ORIGINS: `${WEB}, https://app.example` } });
    dev = await createTestEnv();
  });
  afterAll(async () => {
    await env?.close();
    await dev?.close();
  });

  it('the API allows every header the app sends, for its configured origins only', async () => {
    const ok = await preflight(env.app, '/v1/me', WEB, APP_REQUEST_HEADERS);
    expect(ok.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(allowed(ok)).toEqual(expect.arrayContaining([...APP_REQUEST_HEADERS]));

    const other = await preflight(env.app, '/v1/me', 'https://evil.example', APP_REQUEST_HEADERS);
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('the dev stack lets the web build sign up and call the API with every app header', async () => {
    const auth = new DevAuth(dev.db);
    const app = createDevApp({ ...dev.deps, auth }, auth, new DevStorage('http://localhost:8787'));

    const pre = await preflight(app, '/v1/me', WEB, APP_REQUEST_HEADERS);
    expect(pre.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(allowed(pre)).toEqual(expect.arrayContaining([...APP_REQUEST_HEADERS]));
    // supabase-js's own headers for the stand-in Auth.
    const supa = [
      'apikey',
      'authorization',
      'content-type',
      'x-client-info',
      'x-supabase-api-version',
    ];
    expect(allowed(await preflight(app, '/auth/v1/signup', WEB, supa))).toEqual(
      expect.arrayContaining(supa),
    );

    const signUp = await app.request('/auth/v1/signup', {
      method: 'POST',
      headers: { origin: WEB, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'web@example.test', password: 'geheim-123' }),
    });
    expect(signUp.status).toBe(200);
    const { access_token } = (await signUp.json()) as { access_token: string };

    const me = await app.request('/v1/me', {
      headers: {
        origin: WEB,
        accept: 'application/json',
        authorization: `Bearer ${access_token}`,
        'x-timezone': 'Europe/Berlin',
        'x-app-version': '1.0.0',
      },
    });
    expect(me.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(me.status).toBe(200);
  });
});
