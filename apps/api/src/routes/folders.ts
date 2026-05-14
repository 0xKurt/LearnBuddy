import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { notImplemented } from '../lib/errors.js';

export const folderRoutes = new Hono();
folderRoutes.use('*', requireAuth);

folderRoutes.patch('/:id', (c) => notImplemented(c, 'PATCH /folders/:id'));
folderRoutes.delete('/:id', (c) => notImplemented(c, 'DELETE /folders/:id'));
