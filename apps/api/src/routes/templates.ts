import { Hono } from 'hono';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { notImplemented } from '../lib/errors.js';

export const templateRoutes = new Hono();
templateRoutes.use('*', requireAuth, requireLearnerContext);

templateRoutes.post(
  '/:id/practice-run',
  rateLimit({ key: 'practice_run_create', per_day: 50 }),
  (c) => notImplemented(c, 'POST /templates/:id/practice-run'),
);

templateRoutes.patch('/:id/practice-run/:run_id', (c) =>
  notImplemented(c, 'PATCH /templates/:id/practice-run/:run_id'),
);

templateRoutes.delete('/:id', (c) => notImplemented(c, 'DELETE /templates/:id'));
