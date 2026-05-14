// Hono app composition. Doc 02 §api + doc 04 entire.
//
// The same `app` instance is exported for the Vercel handler at
// api/[[...slug]].ts and for the local dev server at src/dev-server.ts.

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

import { errorHandler } from './middleware/error.js';

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
import { renderRoutes } from './routes/render.js';
import { webhookRoutes } from './routes/webhooks.js';
import { adminRoutes } from './routes/admin.js';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  app.use('*', cors({ origin: '*' }));
  app.use('*', errorHandler);

  app.get('/health', (c) => c.json({ ok: true, version: '0.0.0' }));

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
  app.route('/render', renderRoutes);
  app.route('/webhooks', webhookRoutes);
  app.route('/admin', adminRoutes);

  return app;
}

export const app = createApp();
