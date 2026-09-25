// Local stack for trying the real app in a browser without Supabase or a
// model account: the real API and scheduler on a throwaway copy of the real
// schema (local Postgres), plus stand-ins for the outside world —
//   /auth/v1/*        a minimal Supabase Auth (GoTrue) for sign-up / sign-in / refresh
//   /dev-storage/*    the photo upload target
//   model             scripted answers for one scenario (or none: LB_DEV_MODEL=disabled)
// Test tooling only (src/testing is not part of the build). Never deploy it.
//
//   pnpm --filter @learnbuddy/api dev:stack
//   → API and auth on http://localhost:8787 (PORT to change)

import { randomUUID } from 'node:crypto';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { createApp } from '../app.js';
import type { AuthUser, AuthVerifier } from '../auth/verifier.js';
import { loadConfig } from '../config.js';
import type { Deps } from '../deps.js';
import { createDb, type Db } from '../lib/db.js';
import { DisabledGateway } from '../llm/gateway.js';
import { DisabledPush } from '../push/transport.js';
import { runTick } from '../modules/scheduler/tick.js';
import type { UploadTarget } from '../storage/gateway.js';
import { createTestDatabase, testDatabaseAvailable } from './database.js';
import { MemoryStorage, ScriptedGateway } from './fakes.js';
import { scriptCoreLoop } from './scenarios/core-loop.js';

const PORT = Number(process.env.PORT ?? 8787);
const BASE = `http://localhost:${PORT}`;

type Issued = { userId: string; email: string; authAt: number; expiresAt: number };

/** Just enough of Supabase Auth for supabase-js: password sign-up/sign-in, refresh, logout. */
class DevAuth implements AuthVerifier {
  private readonly users = new Map<string, { id: string; password: string }>();
  private readonly access = new Map<string, Issued>();
  private readonly refresh = new Map<string, Omit<Issued, 'expiresAt'>>();

  constructor(private readonly db: Db) {}

  private issue(userId: string, email: string, authAt: number) {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = `dev-access-${randomUUID()}`;
    const refreshToken = `dev-refresh-${randomUUID()}`;
    this.access.set(accessToken, { userId, email, authAt, expiresAt: now + 3600 });
    this.refresh.set(refreshToken, { userId, email, authAt });
    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: refreshToken,
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email,
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    };
  }

  async signUp(email: string, password: string) {
    if (this.users.has(email)) return null;
    const row = await this.db.one<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    );
    this.users.set(email, { id: row.id, password });
    return this.issue(row.id, email, Math.floor(Date.now() / 1000));
  }

  signIn(email: string, password: string) {
    const u = this.users.get(email);
    if (!u || u.password !== password) return null;
    return this.issue(u.id, email, Math.floor(Date.now() / 1000));
  }

  renew(refreshToken: string) {
    const r = this.refresh.get(refreshToken);
    if (!r) return null;
    this.refresh.delete(refreshToken);
    // A refresh keeps the original sign-in time (like Supabase's amr claim).
    return this.issue(r.userId, r.email, r.authAt);
  }

  async verify(token: string): Promise<AuthUser | null> {
    const a = this.access.get(token);
    if (!a || a.expiresAt < Math.floor(Date.now() / 1000)) return null;
    return { userId: a.userId, email: a.email, authenticatedAt: a.authAt };
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.query(`delete from auth.users where id = $1`, [userId]);
    for (const [email, u] of this.users) if (u.id === userId) this.users.delete(email);
  }
}

class DevStorage extends MemoryStorage {
  override async createUploadTarget(path: string): Promise<UploadTarget> {
    return { path, url: `${BASE}/dev-storage/${encodeURIComponent(path)}`, token: 'dev' };
  }
}

async function main(): Promise<void> {
  if (!(await testDatabaseAvailable()))
    throw new Error('No local Postgres (see LB_TEST_DATABASE_URL)');
  const database = await createTestDatabase();
  const db = createDb(database.url, { max: 8 });
  const config = loadConfig({
    NODE_ENV: 'development',
    DATABASE_URL: database.url,
    SUPABASE_URL: BASE,
    SUPABASE_SERVICE_ROLE_KEY: 'dev-service-role-key-not-used',
    TICK_SECRET: 'dev-tick-secret-0123456789abcdef',
    ADMIN_TOKEN_SECRET: 'dev-admin-secret-0123456789abcdef0123',
    LLM_BACKEND: 'disabled',
    PUSH_BACKEND: 'disabled',
  });
  const auth = new DevAuth(db);
  const storage = new DevStorage();
  const scripted = new ScriptedGateway();
  const model = process.env.LB_DEV_MODEL === 'disabled' ? new DisabledGateway() : scripted;
  if (model === scripted) scriptCoreLoop(scripted);
  const deps: Deps = {
    config,
    db,
    now: () => new Date(),
    auth,
    storage,
    llm: model,
    push: new DisabledPush(),
    background: (task) => {
      void task().catch((err: unknown) => console.error('[dev-stack] background', err));
    },
  };

  const outer = new Hono();
  outer.use(
    '*',
    cors({
      origin: (origin) => origin,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'authorization',
        'apikey',
        'content-type',
        'accept',
        'x-client-info',
        'x-supabase-api-version',
        'x-timezone',
        'x-admin-token',
      ],
      maxAge: 600,
    }),
  );
  outer.post('/auth/v1/signup', async (c) => {
    const { email, password } = (await c.req.json()) as { email?: string; password?: string };
    if (!email || !password || password.length < 8) {
      return c.json(
        { code: 'weak_password', message: 'Password should be at least 8 characters.' },
        422,
      );
    }
    const session = await auth.signUp(email.toLowerCase(), password);
    if (!session)
      return c.json({ code: 'user_already_exists', message: 'User already registered' }, 422);
    return c.json(session);
  });
  outer.post('/auth/v1/token', async (c) => {
    const grant = c.req.query('grant_type');
    const body = (await c.req.json()) as {
      email?: string;
      password?: string;
      refresh_token?: string;
    };
    const session =
      grant === 'password'
        ? auth.signIn((body.email ?? '').toLowerCase(), body.password ?? '')
        : grant === 'refresh_token'
          ? auth.renew(body.refresh_token ?? '')
          : null;
    if (!session)
      return c.json({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 400);
    return c.json(session);
  });
  outer.post('/auth/v1/logout', (c) => c.body(null, 204));
  outer.post('/auth/v1/recover', (c) => c.json({}));
  outer.put('/dev-storage/:path', async (c) => {
    storage.put(decodeURIComponent(c.req.param('path')), new Uint8Array(await c.req.arrayBuffer()));
    return c.json({ Key: c.req.param('path') });
  });
  outer.route('/', createApp(deps));

  serve({ fetch: outer.fetch, port: PORT });
  console.info(
    `[dev-stack] API + auth on ${BASE} · database ${database.url} · model ${model === scripted ? 'scripted (core loop)' : 'disabled'}`,
  );

  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runTick(deps)
      .then((s) => {
        if (s.errors.length) console.warn('[dev-stack] tick errors', s.errors);
      })
      .catch((err: unknown) => console.error('[dev-stack] tick', err))
      .finally(() => {
        running = false;
      });
  }, 5000);

  const stop = async () => {
    clearInterval(timer);
    const left = scripted.pending();
    if (left > 0 || scripted.unexpected.length > 0) {
      console.info(
        `[dev-stack] scripted answers left: ${left}; unscripted calls: ${scripted.unexpected.map((u) => u.purpose).join(', ') || 'none'}`,
      );
    }
    await db.close();
    await database.drop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

void main();
