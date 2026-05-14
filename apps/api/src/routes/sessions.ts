import { Hono } from 'hono';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { notImplemented } from '../lib/errors.js';

export const sessionRoutes = new Hono();
sessionRoutes.use('*', requireAuth, requireLearnerContext);

sessionRoutes.post(
  '/',
  rateLimit({ key: 'sessions_create', per_day: 60 }),
  (c) => notImplemented(c, 'POST /sessions'),
);
