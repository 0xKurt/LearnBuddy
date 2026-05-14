import { Hono } from 'hono';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { notImplemented } from '../lib/errors.js';

export const explainRoutes = new Hono();
explainRoutes.use('*', requireAuth, requireLearnerContext);

explainRoutes.post(
  '/',
  rateLimit({ key: 'explain', per_day: 60 }),
  (c) => notImplemented(c, 'POST /explain (SSE)'),
);
