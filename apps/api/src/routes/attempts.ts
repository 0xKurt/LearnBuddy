import { Hono } from 'hono';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { notImplemented } from '../lib/errors.js';

export const attemptRoutes = new Hono();
attemptRoutes.use('*', requireAuth, requireLearnerContext);

attemptRoutes.post(
  '/',
  rateLimit({ key: 'attempts_create', per_hour: 600 }),
  (c) => notImplemented(c, 'POST /attempts (SSE)'),
);

attemptRoutes.post(
  '/batch',
  rateLimit({ key: 'attempts_batch', per_hour: 60 }),
  (c) => notImplemented(c, 'POST /attempts/batch'),
);

attemptRoutes.post('/:client_id/finalize', (c) =>
  notImplemented(c, 'POST /attempts/:client_id/finalize (SSE)'),
);
