// Admin (service-allowlist). Doc 04 §admin.
import { Hono } from 'hono';
import { ApiError, notImplemented } from '../lib/errors.js';

export const adminRoutes = new Hono();

adminRoutes.use('*', async (c, next) => {
  const email = c.req.header('x-admin-email');
  const allowlist = (process.env.ADMIN_ALLOWLIST_EMAILS ?? '').split(',').map((s) => s.trim());
  if (!email || !allowlist.includes(email)) {
    throw new ApiError('forbidden', 'Admin email not in allowlist');
  }
  await next();
});

adminRoutes.get('/spend', (c) => notImplemented(c, 'GET /admin/spend'));
