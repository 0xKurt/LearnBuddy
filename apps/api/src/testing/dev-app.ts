// The dev stack's HTTP surface (src/testing/dev-stack.ts): the real API plus
// stand-ins for Supabase Auth and storage, behind the same CORS as the API so
// the web build gets through exactly what a browser would get through.
// Test tooling only (src/testing is not part of the build). Never deploy it.

import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';

import { createApp } from '../app.js';
import type { AuthUser, AuthVerifier } from '../auth/verifier.js';
import type { Deps } from '../deps.js';
import { appCors } from '../http/cors.js';
import type { Db } from '../lib/db.js';
import type { UploadTarget } from '../storage/gateway.js';
import { MemoryStorage } from './fakes.js';

type Issued = { userId: string; email: string; authAt: number; expiresAt: number };

/** Just enough of Supabase Auth for supabase-js: password sign-up/sign-in, refresh, logout. */
export class DevAuth implements AuthVerifier {
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

  async updatePassword(userId: string, password: string): Promise<void> {
    for (const u of this.users.values()) if (u.id === userId) u.password = password;
  }
}

export class DevStorage extends MemoryStorage {
  constructor(private readonly base: string) {
    super();
  }

  override async createUploadTarget(path: string): Promise<UploadTarget> {
    return { path, url: `${this.base}/dev-storage/${encodeURIComponent(path)}`, token: 'dev' };
  }
}

export function createDevApp(deps: Deps, auth: DevAuth, storage: DevStorage): Hono {
  const outer = new Hono();
  // Any origin (the web build runs on its own port); supabase-js adds its own headers.
  outer.use(
    '*',
    appCors({
      allowOrigin: () => true,
      extraHeaders: ['apikey', 'x-client-info', 'x-supabase-api-version'],
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

  return outer;
}
