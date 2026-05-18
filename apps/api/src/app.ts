// Hono app composition. Doc 02 §api + doc 04 entire.
//
// The same `app` instance is exported for the Vercel handler at
// api/[[...slug]].ts and for the local dev server at src/dev-server.ts.
//
// Deps (Supabase clients, env, time, uuid) are injected via the
// `deps` context variable so route handlers stay testable. In production
// we lazy-construct via `createProdDeps()`; tests supply their own.

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

import { errorHandler } from './middleware/error.js';
import type { Deps } from './lib/deps.js';
import { createProdDeps } from './lib/deps.js';
import { initSentry } from './lib/sentry.js';

// Init Sentry as soon as the module loads so a crash in deps construction
// is still captured.
initSentry();

import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/account.js';
import { learnerRoutes } from './routes/learners.js';
import { subjectRoutes } from './routes/subjects.js';
import { folderRoutes } from './routes/folders.js';
import { materialRoutes } from './routes/materials.js';
import { itemRoutes } from './routes/items.js';
import { sessionRoutes } from './routes/sessions.js';
import { attemptRoutes } from './routes/attempts.js';
import { templateRoutes } from './routes/templates.js';
import { explainRoutes } from './routes/explain.js';
import { dsgvoRoutes } from './routes/dsgvo.js';
import { devRoutes } from './routes/dev.js';
import { renderRoutes } from './routes/render.js';
import { webhookRoutes } from './routes/webhooks.js';
import { adminRoutes } from './routes/admin.js';

export function createApp(opts: { deps?: Deps } = {}) {
  const app = new Hono();
  let deps: Deps | null = opts.deps ?? null;

  app.use('*', logger());
  // Mobile clients send `Origin: null` from RN; localhost origins are dev
  // tooling (Expo web preview, vitest). Lock CORS to the known set instead
  // of `*` so a future browser surface doesn't accidentally inherit a
  // wide-open policy. Override via API_CORS_ORIGINS (comma-separated).
  const allowedOrigins = (process.env.API_CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultOrigins = [
    'http://localhost:8081', // Expo dev
    'http://localhost:19006', // Expo web
    'http://localhost:3000', // misc dev
  ];
  const origins = allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;
  app.use(
    '*',
    cors({
      origin: (incoming) => {
        // RN fetch sends no Origin header — pass through.
        if (!incoming) return null;
        return origins.includes(incoming) ? incoming : null;
      },
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Learner-Id'],
      maxAge: 86_400,
    }),
  );
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    if (!deps) {
      deps = createProdDeps();
    }
    c.set('deps', deps);
    await next();
  });

  app.get('/health', (c) =>
    c.json({ ok: true, version: process.env.npm_package_version ?? '0.0.0' }),
  );
  app.get('/version', (c) =>
    c.json({
      api_version: process.env.npm_package_version ?? '0.0.0',
      min_app_version: process.env.MIN_APP_VERSION ?? '0.0.1',
    }),
  );

  // Versioned under /v1 via the Vercel rewrite in vercel.json. The dev server
  // serves the same routes without the prefix.
  app.route('/auth', authRoutes);
  app.route('/account', accountRoutes);
  app.route('/learners', learnerRoutes);
  app.route('/subjects', subjectRoutes);
  app.route('/folders', folderRoutes);
  app.route('/materials', materialRoutes);
  app.route('/items', itemRoutes);
  app.route('/sessions', sessionRoutes);
  app.route('/attempts', attemptRoutes);
  app.route('/templates', templateRoutes);
  app.route('/explain', explainRoutes);
  app.route('/dsgvo', dsgvoRoutes);
  if (process.env.ENABLE_DEV_ROUTES === 'true') app.route('/dev', devRoutes);
  app.route('/render', renderRoutes);
  app.route('/webhooks', webhookRoutes);
  app.route('/admin', adminRoutes);

  return app;
}

export const app = createApp();
