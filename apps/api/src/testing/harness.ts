// Test environment: the real app and schema, fake outside world, one clock.
// requires live verification in Claude Code session (needs a running Postgres)

import type { CurriculumRegion, SessionView } from '@learnbuddy/shared-types/contracts';
import type { Hono } from 'hono';

import { createApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import type { Deps } from '../deps.js';
import type { AppEnv } from '../http/context.js';
import { createDb, type PgDb } from '../lib/db.js';
import { DisabledEmbeddings, type EmbeddingGateway } from '../llm/embeddings.js';
import { DisabledGateway, type LlmGateway } from '../llm/gateway.js';
import { DisabledPush } from '../push/transport.js';
import { createTestDatabase, type TestDatabase } from './database.js';
import {
  FakeAuth,
  FakeEmbeddings,
  FakePush,
  FakeSpeech,
  MemoryStorage,
  ScriptedGateway,
  TestClock,
} from './fakes.js';
import { DisabledSpeech } from '../speech/gateway.js';

export type TestEnv = {
  deps: Deps;
  db: PgDb;
  clock: TestClock;
  llm: ScriptedGateway;
  embeddings: FakeEmbeddings;
  push: FakePush;
  speech: FakeSpeech;
  auth: FakeAuth;
  storage: MemoryStorage;
  app: Hono<AppEnv>;
  /** Awaits work the routes started with deps.background (e.g. reading photos). */
  flushBackground(): Promise<void>;
  /**
   * Holds every background task started from now on until the next `flushBackground()`.
   * Without it a task runs at once, beside the request, so a test that asserts the state
   * BEFORE the task lands races it — and loses under load (issue #323).
   */
  holdBackground(): void;
  /**
   * Fails unless the scripted model was used exactly as scripted: no unexpected call, no error
   * inside a scripted answer, nothing scripted left over. It reads that only after the background
   * work the routes started has landed (issue #323) — read before, a background model call
   * (Buddy's look after /finish, a reading, hints) was counted or missed depending on how busy
   * the machine was. `reset` forgets the scripts, for tests that share one environment.
   */
  checkScript(opts?: { reset?: boolean }): Promise<void>;
  /** `close()`, then `checkScript()`'s verdict: the afterEach of a test with its own environment. */
  closeChecked(): Promise<void>;
  close(): Promise<void>;
};

/** What the scripted model saw that it should not have, and what it was promised but never asked. */
type ScriptReport = { scriptErrors: string[]; unexpected: string[]; pending: number };

function verdict(r: ScriptReport): void {
  if (r.scriptErrors.length > 0 || r.unexpected.length > 0 || r.pending > 0)
    throw new Error(`The model was not used as scripted: ${JSON.stringify(r)}`);
}

export const TEST_TICK_SECRET = 'test-tick-secret-0123456789abcdef';

export async function createTestEnv(
  opts: {
    start?: string;
    model?: 'scripted' | 'disabled';
    /** A real model for evaluations (evals/buddy); overrides `model`. */
    gateway?: LlmGateway;
    /** 'disabled', or a real embedding gateway for evaluations (evals/lookup); default fake. */
    embeddings?: EmbeddingGateway | 'disabled';
    push?: 'fake' | 'disabled';
    speech?: 'fake' | 'disabled';
    config?: Record<string, string>;
    /**
     * Connect the API as another role than the superuser that built the database: gets the
     * test database's admin URL, returns the URL the API uses (issue #107: the API role from
     * infra/supabase/templates/api-role.sql). The fake auth keeps the admin connection,
     * because real accounts go through Supabase's own API, not through the API's role.
     */
    connectAs?: (adminUrl: string) => Promise<string>;
  } = {},
): Promise<TestEnv> {
  const database: TestDatabase = await createTestDatabase();
  const apiUrl = opts.connectAs ? await opts.connectAs(database.url) : database.url;
  const config: Config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: apiUrl,
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-used',
    TICK_SECRET: TEST_TICK_SECRET,
    ADMIN_TOKEN_SECRET: 'test-admin-secret-0123456789abcdef0123',
    LLM_BACKEND: 'disabled',
    PUSH_BACKEND: 'disabled',
    ...opts.config,
  });
  const db = createDb(apiUrl, { max: 8 });
  const adminDb = opts.connectAs ? createDb(database.url, { max: 2 }) : db;
  const clock = new TestClock(opts.start ?? '2026-09-28T08:00:00Z');
  // Background hints for new questions are answered with "none" unless a test scripts
  // them; the concept-image pass finds no figures unless a test scripts boxes (issue #50).
  const llm = new ScriptedGateway()
    .byDefault('hints', { json: { items: [] } })
    .byDefault('figures', { json: { assets: [] } });
  const push = new FakePush();
  const speech = new FakeSpeech();
  const auth = new FakeAuth(adminDb, clock.now);
  const storage = new MemoryStorage();
  const embeddings = new FakeEmbeddings();
  const pending: Array<Promise<void>> = [];
  let held: Array<() => Promise<void>> | null = null;
  const flushBackground = async (): Promise<void> => {
    const release = held ?? [];
    held = null;
    for (const task of release) pending.push(task());
    while (pending.length > 0) await pending.shift();
  };
  // Every background task, held or running, finishes or fails. A failure is not thrown here: what
  // it did wrong shows in the model report or in the test's own assertions, as it did before.
  const settleBackground = async (): Promise<void> => {
    for (const task of held ?? []) pending.push(task());
    held = null;
    while (pending.length > 0) await Promise.allSettled(pending.splice(0));
  };
  const scriptReport = async (o: { reset?: boolean } = {}): Promise<ScriptReport> => {
    await settleBackground();
    const report = {
      scriptErrors: [...llm.scriptErrors],
      unexpected: llm.unexpected.map((u) => u.purpose),
      pending: llm.pending(),
    };
    if (o.reset) llm.reset();
    return report;
  };
  const close = async (): Promise<void> => {
    // Work the routes started in the background finishes (or fails) first: a task still
    // running on a closed pool would surface as an unhandled rejection in another test
    // (harness-close-does-not-drain-background).
    await settleBackground();
    await db.close();
    if (adminDb !== db) await adminDb.close();
    await database.drop();
  };
  const deps: Deps = {
    config,
    db,
    now: clock.now,
    auth,
    storage,
    llm: opts.gateway ?? (opts.model === 'disabled' ? new DisabledGateway() : llm),
    embeddings:
      opts.embeddings === 'disabled' ? new DisabledEmbeddings() : (opts.embeddings ?? embeddings),
    push: opts.push === 'disabled' ? new DisabledPush() : push,
    speech: opts.speech === 'disabled' ? new DisabledSpeech() : speech,
    background: (task) => {
      if (held) held.push(task);
      else pending.push(task());
    },
  };
  return {
    deps,
    db,
    clock,
    llm,
    embeddings,
    push,
    speech,
    auth,
    storage,
    app: createApp(deps),
    holdBackground: () => {
      held ??= [];
    },
    flushBackground,
    checkScript: async (o) => verdict(await scriptReport(o)),
    closeChecked: async () => {
      let report: ScriptReport;
      try {
        report = await scriptReport();
      } finally {
        await close();
      }
      verdict(report);
    },
    close,
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
    /**
     * The Bundesland her school is in (issue #199). Required by POST /learner, so the
     * harness always sends one; a test that cares which state it is passes its own.
     */
    region?: CurriculumRegion;
    contactEnabled?: boolean;
    timezone?: string;
    /** Set up the adult PIN during onboarding, as the app does for a child profile. */
    pin?: string;
    /**
     * Whether the account holder clicked the link in the confirmation mail (issue #30).
     * Default true: on the hosted project nobody gets a session before that click.
     */
    emailConfirmed?: boolean;
  } = {},
): Promise<Learner> {
  const { userId, token } = await env.auth.createUser(undefined, {
    emailConfirmed: opts.emailConfirmed !== false,
  });
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
    curriculum_region: opts.region ?? 'ni',
    minor_consent: relation === 'child',
    ...(opts.contactEnabled !== undefined ? { contact_enabled: opts.contactEnabled } : {}),
    // The parents' first PIN goes with the profile, in one request (as the app sends it).
    ...(opts.pin ? { pin: opts.pin } : {}),
  });
  if (learner.status !== 201)
    throw new Error(`learner: ${learner.status} ${JSON.stringify(learner.body)}`);
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

/**
 * Ends a practice run as the app does. Finishing wakes Buddy to look at it (`session_finished`,
 * one background `buddy_check`); here he plans nothing. The look is awaited, so its model call
 * belongs to the test that caused it instead of landing before or after the model report by
 * chance (issue #323).
 */
export async function finishRun(
  env: TestEnv,
  l: Learner,
  sessionId: string,
): Promise<ApiResponse<SessionView>> {
  env.llm.script('buddy_check', {
    json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
  });
  const res = await l.api.post<SessionView>(`/practice/sessions/${sessionId}/finish`, {});
  await env.flushBackground();
  return res;
}
