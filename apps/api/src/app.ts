// HTTP composition. docs/architecture.md §API.
//
// One Hono app for the Node server, the Vercel function and tests; all
// dependencies come in through `deps`. Every error leaves as the envelope
// {"error": {"code", "message", "details"?}} (lib/errors.ts).

import { createHash, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';

import type { Deps } from './deps.js';
import type { AppEnv } from './http/context.js';
import { AppError, isAppError, type ErrorCode } from './lib/errors.js';
import { buddyRoutes } from './modules/buddy/routes.js';
import { identityRoutes } from './modules/identity/routes.js';
import { materialRoutes } from './modules/materials/routes.js';
import { practiceRoutes } from './modules/practice/routes.js';
import { runTick } from './modules/scheduler/tick.js';

/** The scheduler counts as stalled after this long without a finished run. */
export const SCHEDULER_STALE_MS = 10 * 60_000;

function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function codeForStatus(status: number): ErrorCode {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 413) return 'too_large';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'internal';
  return 'invalid_input';
}

export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const origins = (deps.config.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.use(
      '*',
      cors({
        origin: (origin) => (origins.includes(origin) ? origin : null),
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['content-type', 'authorization', 'x-timezone', 'x-admin-token'],
        maxAge: 86_400,
      }),
    );
  }
  // Photos go straight to storage; API bodies are small JSON.
  const smallBodies = bodyLimit({
    maxSize: 64 * 1024,
    onError: () => {
      throw new AppError('too_large', 'Request body too large');
    },
  });
  // Recordings for speaking practice (≤ 15 s, base64) are the one larger body.
  const recordings = bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: () => {
      throw new AppError('too_large', 'Request body too large');
    },
  });
  app.use('*', (c, next) =>
    /\/practice\/sessions\/[^/]+\/speak$/.test(c.req.path)
      ? recordings(c, next)
      : smallBodies(c, next),
  );
  app.use('*', async (c, next) => {
    c.set('deps', deps);
    await next();
  });

  app.onError((err, c) => {
    if (isAppError(err)) return c.json(err.toJSON(), err.status);
    if (err instanceof HTTPException) {
      const status = err.status;
      return c.json(
        { error: { code: codeForStatus(status), message: err.message || 'Request failed' } },
        status,
      );
    }
    // Logs carry the route and the error class, never request bodies or user content.
    console.error('[api] unhandled error', {
      method: c.req.method,
      path: c.req.routePath,
      error: err instanceof Error ? `${err.name}: ${err.message.slice(0, 300)}` : 'unknown',
    });
    return c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

  const api = new Hono<AppEnv>();

  /** Liveness for monitoring: database reachable and the scheduler actually running. */
  api.get('/health', async (c) => {
    let dbOk = true;
    let lastRun: Date | null = null;
    try {
      const hb = await deps.db.maybeOne<{ last_finished_at: Date | null }>(
        `select last_finished_at from system_heartbeats where name = 'tick'`,
      );
      lastRun = hb?.last_finished_at ?? null;
    } catch {
      dbOk = false;
    }
    const schedulerOk =
      lastRun !== null && deps.now().getTime() - lastRun.getTime() < SCHEDULER_STALE_MS;
    const ok = dbOk && schedulerOk;
    return c.json(
      {
        ok,
        database: dbOk,
        scheduler: { ok: schedulerOk, last_run_at: lastRun ? lastRun.toISOString() : null },
        model: deps.llm.available,
        push: deps.push.enabled,
      },
      ok ? 200 : 503,
    );
  });

  /** Called every minute by pg_cron (lb_invoke_tick) or any external cron. */
  api.post('/internal/tick', async (c) => {
    const expected = deps.config.TICK_SECRET;
    if (!expected) throw new AppError('unavailable', 'The scheduler secret is not configured');
    const given = c.req.header('x-tick-secret');
    if (!given || !sameSecret(given, expected))
      throw new AppError('forbidden', 'Wrong scheduler secret');
    return c.json(await runTick(deps));
  });

  api.route('/', identityRoutes);
  api.route('/buddy', buddyRoutes);
  api.route('/practice', practiceRoutes);
  api.route('/materials', materialRoutes);

  // The app calls /v1/…; Vercel rewrites /v1/* to the /api function, and the
  // Node server serves the same routes without a prefix.
  for (const base of ['/', '/v1', '/api', '/api/v1']) app.route(base, api);
  return app;
}
