import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { notImplemented } from '../lib/errors.js';

export const subjectRoutes = new Hono();
subjectRoutes.use('*', requireAuth);

subjectRoutes.patch('/:id', (c) => notImplemented(c, 'PATCH /subjects/:id'));
subjectRoutes.delete('/:id', (c) => notImplemented(c, 'DELETE /subjects/:id'));
subjectRoutes.get('/:subjectId/folders', (c) => notImplemented(c, 'GET /subjects/:subjectId/folders'));
subjectRoutes.post('/:subjectId/folders', (c) => notImplemented(c, 'POST /subjects/:subjectId/folders'));
