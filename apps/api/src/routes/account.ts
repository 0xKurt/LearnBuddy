import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { notImplemented } from '../lib/errors.js';

export const accountRoutes = new Hono();

accountRoutes.use('*', requireAuth);
accountRoutes.get('/', (c) => notImplemented(c, 'GET /account'));
accountRoutes.get('/credits/summary', (c) => notImplemented(c, 'GET /account/credits/summary'));
