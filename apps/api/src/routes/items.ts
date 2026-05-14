import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { notImplemented } from '../lib/errors.js';

export const itemRoutes = new Hono();
itemRoutes.use('*', requireAuth);

itemRoutes.delete('/:id', (c) => notImplemented(c, 'DELETE /items/:id'));
