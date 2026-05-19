// Fake-backed dev server. For Playwright / curl smoke tests with no cloud
// dependencies. Same Hono app, but injects FakeSupabase + FakeLlmGateway so
// the server boots without SUPABASE_* / GOOGLE_* env vars.
//
// Boot:  pnpm -F @learnbuddy/api dev:fake
// Port:  PORT=6101 by default (different from real dev-server.ts so they
//        can run side-by-side).

import { serve } from '@hono/node-server';

import { createApp } from './app.js';
import type { Deps } from './lib/deps.js';
import type { Env } from './lib/env.js';
import { createTestDeps, getFake } from './test/fake-supabase.js';

const env: Env = {
  SUPABASE_URL: 'http://fake.local',
  SUPABASE_ANON_KEY: 'fake-anon-key-0000000000',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-key-0000000000',
  PUBLIC_APP_URL: 'http://localhost:6101',
  EMAIL_REDIRECT_URL: 'http://localhost:6101/verify-email',
  DSGVO_CONSENT_VERSION: '2026-05-01',
  // Using 'test' so the auth route takes the supabaseAnon.signUp path (the
  // one the fake-supabase actually implements). 'development' would trigger
  // the `auth.admin.createUser` shortcut which the fake doesn't model.
  NODE_ENV: 'test',
  ENABLE_DEV_ROUTES: 'true',
  GOOGLE_VERTEX_LOCATION: 'europe-west4',
  VERTEX_MODEL_ID: 'gemini-2.5-flash-lite',
  VERTEX_TUTOR_MODEL_ID: 'gemini-2.5-flash',
};

// Re-use the test deps so the fake supports the same surface vitest does.
// One global instance — each request shares the same in-memory tables so
// Playwright can chain signup → learner → material in the same process.
const baseDeps = createTestDeps({ env });
const fake = getFake(baseDeps);

// `auth.getUser(token)` resolves a real Bearer token via Supabase in prod;
// here we mint a token at signup time and stash it on the user. The test
// harness already wires this end-to-end via `fake.authenticate()`. For the
// dev server we also auto-mint a token on successful signup so callers can
// log in immediately without bouncing through email verification.
// The route handler reads `signUp().data.session` to decide whether the user
// can skip the verification screen. Patch the fake to mint a session as soon
// as the user row exists — that's the dev-server's "developer convenience"
// (matches the prod NODE_ENV==='development' admin.createUser shortcut).
const anon = baseDeps.supabaseAnon as unknown as {
  auth: {
    signUp: (input: { email: string; password: string; options?: unknown }) => Promise<{
      data: {
        user: { id: string; email?: string } | null;
        session: { access_token: string; refresh_token: string; expires_at: number | null } | null;
      };
      error: { message: string; status?: number } | null;
    }>;
  };
};
const origSignUp = anon.auth.signUp.bind(anon.auth);
anon.auth.signUp = async (input) => {
  const res = await origSignUp(input);
  if (res.data?.user && !res.error) {
    const token = fake.authenticate(res.data.user.id, input.email);
    return {
      data: {
        user: res.data.user,
        session: { access_token: token, refresh_token: `r-${token}`, expires_at: null },
      },
      error: null,
    };
  }
  return res;
};

// Override 'now' to be the real wall-clock time (createTestDeps freezes it).
const deps: Deps = {
  ...baseDeps,
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
};

const app = createApp({ deps });

const port = Number(process.env.PORT ?? 6101);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`[api:fake] listening on http://localhost:${port}  (in-memory fakes)`);
});
