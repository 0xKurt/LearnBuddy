import { Hono } from 'hono';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { notImplemented } from '../lib/errors.js';

export const materialRoutes = new Hono();
materialRoutes.use('*', requireAuth, requireLearnerContext);

materialRoutes.post('/upload-url', (c) => notImplemented(c, 'POST /materials/upload-url'));

materialRoutes.post(
  '/',
  rateLimit({ key: 'materials_create', per_day: 20 }),
  (c) => notImplemented(c, 'POST /materials (SSE)'),
);

materialRoutes.get('/:id', (c) => notImplemented(c, 'GET /materials/:id'));
materialRoutes.get('/:id/items', (c) => notImplemented(c, 'GET /materials/:id/items'));
materialRoutes.get('/:id/templates', (c) => notImplemented(c, 'GET /materials/:id/templates'));

materialRoutes.post(
  '/:id/regenerate-items',
  rateLimit({ key: 'materials_regenerate', per_day: 10 }),
  (c) => notImplemented(c, 'POST /materials/:id/regenerate-items (SSE)'),
);

materialRoutes.patch('/:id', (c) => notImplemented(c, 'PATCH /materials/:id'));
materialRoutes.delete('/:id', (c) => notImplemented(c, 'DELETE /materials/:id'));
