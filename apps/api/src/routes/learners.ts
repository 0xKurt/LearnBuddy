import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { notImplemented } from '../lib/errors.js';

export const learnerRoutes = new Hono();

learnerRoutes.use('*', requireAuth);

learnerRoutes.post('/', (c) => notImplemented(c, 'POST /learners'));
learnerRoutes.patch('/:id', (c) => notImplemented(c, 'PATCH /learners/:id'));
learnerRoutes.delete('/:id', (c) => notImplemented(c, 'DELETE /learners/:id'));

learnerRoutes.get('/:learnerId/subjects', (c) => notImplemented(c, 'GET /learners/:learnerId/subjects'));
learnerRoutes.post('/:learnerId/subjects', (c) => notImplemented(c, 'POST /learners/:learnerId/subjects'));
learnerRoutes.get('/:learnerId/schedule-summary', (c) =>
  notImplemented(c, 'GET /learners/:learnerId/schedule-summary'),
);
