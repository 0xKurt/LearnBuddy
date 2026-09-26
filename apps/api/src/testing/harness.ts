// Test environment: the real app and schema, fake outside world, one clock.
// requires live verification in Claude Code session (needs a running Postgres)

import type { Hono } from 'hono';

import { createApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import type { Deps } from '../deps.js';
import type { AppEnv } from '../http/context.js';
import { createDb, type PgDb } from '../lib/db.js';
import { DisabledGateway, type LlmGateway } from '../llm/gateway.js';
import { DisabledPush } from '../push/transport.js';
import { createTestDatabase, type TestDatabase } from './database.js';
import { FakeAuth, FakePush, MemoryStorage, ScriptedGateway, TestClock } from './fakes.js';

export type TestEnv = {
  deps: Deps;
  db: PgDb;
  clock: TestClock;
  llm: ScriptedGateway;
  push: FakePush;
  auth: FakeAuth;
  storage: MemoryStorage;
  app: Hono<AppEnv>;
  /** Awaits work the routes started with deps.background (e.g. reading photos). */
  flushBackground(): Promise<void>;
  close(): Promise<void>;
};

export const TEST_TICK_SECRET = 'test-tick-secret-0123456789abcdef';

export async function createTestEnv(
  opts: {
    start?: string;
    model?: 'scripted' | 'disabled';
    /** A real model for evaluations (evals/buddy); overrides `model`. */
    gateway?: LlmGateway;
    push?: 'fake' | 'disabled';
    config?: Record<string, string>;
  } = {},
): Promise<TestEnv> {
  const database: TestDatabase = await createTestDatabase();
  const config: Config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: database.url,
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-used',
    TICK_SECRET: TEST_TICK_SECRET,
    ADMIN_TOKEN_SECRET: 'test-admin-secret-0123456789abcdef0123',
    LLM_BACKEND: 'disabled',
    PUSH_BACKEND: 'disabled',
    ...opts.config,
  });
  const db = createDb(database.url, { max: 8 });
  const clock = new TestClock(opts.start ?? '2026-09-28T08:00:00Z');
  // Background hints for new questions are answered with "none" unless a test scripts them.
  const llm = new ScriptedGateway().byDefault('hints', { json: { items: [] } });
  const push = new FakePush();
  const auth = new FakeAuth(db);
  const storage = new MemoryStorage();
  const pending: Array<Promise<void>> = [];
  const deps: Deps = {
    config,
    db,
    now: clock.now,
    auth,
    storage,
    llm: opts.gateway ?? (opts.model === 'disabled' ? new DisabledGateway() : llm),
    push: opts.push === 'disabled' ? new DisabledPush() : push,
    background: (task) => {
      pending.push(task());
    },
  };
  return {
    deps,
    db,
    clock,
    llm,
    push,
    auth,
    storage,
    app: createApp(deps),
    flushBackground: async () => {
      while (pending.length > 0) await pending.shift();
    },
    close: async () => {
      await db.close();
      await database.drop();
    },
  };
}

export type ApiResponse<T = unknown> = { status: number; body: T };

export type ApiClient = {
  get<T = unknown>(path: string): Promise<ApiResponse<T>>;
  post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  put<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  patch<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  delete<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  with(headers: Record<string, string>): ApiClient;
};

/** HTTP against the in-process app, as the mobile client would call it (/v1/…). */
export function apiClient(
  env: TestEnv,
  token: string | null,
  headers: Record<string, string> = {},
): ApiClient {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> => {
    const res = await env.app.request(`/v1${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  };
  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body ?? {}),
    put: (path, body) => call('PUT', path, body ?? {}),
    patch: (path, body) => call('PATCH', path, body ?? {}),
    delete: (path, body) => call('DELETE', path, body),
    with: (extra) => apiClient(env, token, { ...headers, ...extra }),
  };
}

export type Learner = {
  api: ApiClient;
  token: string;
  userId: string;
  accountId: string;
  learnerId: string;
};

/** Sign-up → consent → profile, through the real endpoints. */
export async function onboard(
  env: TestEnv,
  opts: {
    relation?: 'self' | 'child';
    name?: string;
    birthDate?: string;
    locale?: 'de' | 'en' | 'fr' | 'es' | 'it';
    timezone?: string;
    /** Set up the adult PIN during onboarding, as the app does for a child profile. */
    pin?: string;
  } = {},
): Promise<Learner> {
  const { userId, token } = await env.auth.createUser();
  // Just signed up with e-mail and password.
  env.auth.signedInAt(token, Math.floor(env.clock.now().getTime() / 1000));
  const api = apiClient(env, token, { 'x-timezone': opts.timezone ?? 'Europe/Berlin' });
  const account = await api.post<{ account_id: string }>('/account', {
    locale: opts.locale ?? 'de',
    consent_version: env.deps.config.CONSENT_VERSION,
    accept_privacy: true,
  });
  if (account.status !== 201)
    throw new Error(`account: ${account.status} ${JSON.stringify(account.body)}`);
  const relation = opts.relation ?? 'self';
  const learner = await api.post<{ id: string }>('/learner', {
    relation,
    display_name: opts.name ?? (relation === 'child' ? 'Lina' : 'Alex'),
    birth_date: opts.birthDate ?? (relation === 'child' ? '2014-03-10' : '1995-06-01'),
    locale: opts.locale ?? 'de',
    minor_consent: relation === 'child',
  });
  if (learner.status !== 201)
    throw new Error(`learner: ${learner.status} ${JSON.stringify(learner.body)}`);
  if (opts.pin) {
    const pin = await api.put('/account/pin', { pin: opts.pin });
    if (pin.status !== 200) throw new Error(`pin: ${pin.status} ${JSON.stringify(pin.body)}`);
  }
  return { api, token, userId, accountId: account.body.account_id, learnerId: learner.body.id };
}

/** Enables contact outside the app (an adult's decision) directly in the database. */
export async function enableContact(
  env: TestEnv,
  learnerId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const fields: Record<string, unknown> = {
    contact_enabled: true,
    contact_changed_by: 'learner',
    ...extra,
  };
  const values: unknown[] = [learnerId];
  const sets = Object.entries(fields).map(([k, v]) => {
    values.push(v);
    return `${k} = $${values.length}`;
  });
  await env.db.query(`update buddy_settings set ${sets.join(', ')} where learner_id = $1`, values);
}
