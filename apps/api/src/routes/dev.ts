// Dev-only routes. Only mounted when ENABLE_DEV_ROUTES=true (see app.ts).
// Never set that env var in production or staging — if the routes aren't
// mounted they return 404 rather than 403, leaking nothing about the surface.

import { Hono } from 'hono';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const devRoutes = new Hono();

devRoutes.use('*', requireAuth);

// DELETE /dev/nuke-account
// Immediately hard-deletes the authenticated user from Supabase Auth.
// Auth cascade (via FK ON DELETE CASCADE) wipes all rows across every table
// owned by the account. Use this in dev/simulator to reset without waiting
// for the 7-day DSGVO queue.
devRoutes.delete('/nuke-account', async (c) => {
  const { supabase } = getDeps(c);
  const { user_id, account_id } = c.get('auth');

  const { error } = await supabase.auth.admin.deleteUser(user_id);
  if (error) {
    throw new ApiError('internal', `Failed to nuke user ${account_id}: ${error.message}`);
  }
  return c.json({ ok: true });
});
