// HTTP composition. docs/architecture.md §API.
//
// One Hono app for the Node server, the Vercel function and tests; all
// dependencies come in through `deps`. Every error leaves as the envelope
// {"error": {"code", "message", "details"?}} (lib/errors.ts).

import { createHash, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';

import type { Deps } from './deps.js';
import type { AppEnv } from './http/context.js';
import { appCors } from './http/cors.js';
import { accountBudgets } from './http/limits.js';
import { isCheckViolation } from './lib/db.js';
import { AppError, isAppError, type ErrorCode } from './lib/errors.js';
import { olderThan } from './lib/version.js';
import { pushDeviceRoutes } from './modules/devices/routes.js';
import { buddyRoutes } from './modules/buddy/routes.js';
import { identityRoutes } from './modules/identity/routes.js';
import { materialRoutes } from './modules/materials/routes.js';
import { erasureBacklog } from './modules/materials/purge.js';
import { voiceRoutes } from './modules/voice/routes.js';
import { practiceRoutes } from './modules/practice/routes.js';
import { schedulerHealth, type SchedulerHealth } from './modules/scheduler/health.js';
import { runTick } from './modules/scheduler/tick.js';

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
    app.use('*', appCors({ allowOrigin: (origin) => origins.includes(origin) }));
  }
  // Photos go straight to storage; API bodies are small JSON.
  const smallBodies = bodyLimit({
    maxSize: 64 * 1024,
    onError: () => {
      throw new AppError('too_large', 'Request body too large');
    },
  });
  // Recordings are the one larger body: speaking practice (≤ 15 s), spoken
  // messages (≤ ~3 min, TranscribeRequest caps the base64 at 2 000 000 chars) and a
  // rehearsal talk (≤ 10 min at the long-recording rate, REHEARSAL_MAX_BASE64 = 2 800 000
  // chars) — this leaves room for the JSON around them.
  const recordings = bodyLimit({
    maxSize: 3 * 1024 * 1024,
    onError: () => {
      throw new AppError('too_large', 'Request body too large');
    },
  });
  app.use('*', (c, next) =>
    /\/practice\/sessions\/[^/]+\/speak$|\/voice\/transcribe$|\/voice\/rehearse$/.test(c.req.path)
      ? recordings(c, next)
      : smallBodies(c, next),
  );
  app.use('*', async (c, next) => {
    c.set('deps', deps);
    await next();
  });
  // Builds too old for this API say "please update" instead of failing somewhere
  // inside (audit M-69). Builds that send no version (older ones, the web) pass.
  const minimum = deps.config.MIN_APP_VERSION;
  if (minimum) {
    app.use('*', async (c, next) => {
      const version = c.req.header('x-app-version');
      if (version && /^\d+(\.\d+){0,2}$/.test(version) && olderThan(version, minimum))
        throw new AppError('update_required', 'This app version is too old', { minimum });
      await next();
    });
  }
  // Per-account budgets for answers and messages (abuse protection only, ADR 0006, docs/architecture.md §Limits).
  app.use('*', accountBudgets);

  app.onError((err, c) => {
    if (isAppError(err)) {
      // Locks and rate limits say when to try again.
      const retry = err.details?.retry_after_s;
      if (typeof retry === 'number') c.header('Retry-After', String(retry));
      return c.json(err.toJSON(), err.status);
    }
    // A row the schema refuses is a request the API should have refused: 422, not 500.
    if (isCheckViolation(err)) {
      console.warn('[api] check violation', {
        method: c.req.method,
        path: c.req.routePath,
        constraint: (err as { constraint?: string }).constraint ?? null,
      });
      return c.json(
        { error: { code: 'invalid_input', message: 'The request breaks a data rule' } },
        422,
      );
    }
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

  /**
   * Liveness for monitoring: database reachable and the scheduler actually running — a recent
   * run without errors and no due work left waiting — plus parked jobs per kind (audit S-5).
   */
  api.get('/health', async (c) => {
    let scheduler: SchedulerHealth | null = null;
    try {
      scheduler = await schedulerHealth(deps.db, deps.now());
    } catch {
      scheduler = null;
    }
    const schedulerOk = scheduler?.ok ?? false;
    // Erasure later than promised is a failure someone must look at (docs/privacy.md).
    let dbOk = scheduler !== null;
    let erasure = { overdue_deletions: 0, overdue_photo_deletions: 0 };
    try {
      if (dbOk) erasure = await erasureBacklog(deps.db, deps.now());
    } catch {
      dbOk = false;
    }
    const erasureOk = erasure.overdue_deletions === 0 && erasure.overdue_photo_deletions === 0;
    const ok = dbOk && schedulerOk && erasureOk;
    return c.json(
      {
        ok,
        database: dbOk,
        scheduler: scheduler ?? {
          ok: false,
          state: 'stale',
          last_run_at: null,
          parked: {},
          retention: { last_run_at: null, counts: null },
        },
        erasure: { ok: erasureOk, ...erasure },
        model: deps.llm.available,
        push: deps.push.enabled,
        // Whether Buddy reads with his own voice or the app falls back to the phone's
        // (issue #176): from the outside those two sound alike, and one of them is a robot.
        voice: deps.speech.available,
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
  api.route('/', pushDeviceRoutes);
  api.route('/buddy', buddyRoutes);
  api.route('/practice', practiceRoutes);
  api.route('/materials', materialRoutes);
  api.route('/voice', voiceRoutes);

  // The app calls /v1/…; Vercel rewrites /v1/* to the /api function, and the
  // Node server serves the same routes without a prefix.
  for (const base of ['/', '/v1', '/api', '/api/v1']) app.route(base, api);
  return app;
}
