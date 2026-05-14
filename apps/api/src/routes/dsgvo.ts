import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { notImplemented } from '../lib/errors.js';

export const dsgvoRoutes = new Hono();
dsgvoRoutes.use('*', requireAuth);

dsgvoRoutes.post('/export', (c) => notImplemented(c, 'POST /dsgvo/export'));
dsgvoRoutes.get('/requests/:id', (c) => notImplemented(c, 'GET /dsgvo/requests/:id'));
dsgvoRoutes.post('/delete-account', (c) => notImplemented(c, 'POST /dsgvo/delete-account'));
dsgvoRoutes.post('/cancel-deletion', (c) => notImplemented(c, 'POST /dsgvo/cancel-deletion'));
