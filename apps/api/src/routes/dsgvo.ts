// DSGVO endpoints. Doc 04 §dsgvo + Doc 09 §account-holder-rights.
//
// POST /dsgvo/export
//   Queue a dsgvo_requests row with kind='export'. The actual ZIP assembly
//   runs in the Edge Function `dsgvo-export-worker` (infra/supabase/
//   functions/) which the deploy must register. Mobile polls
//   /dsgvo/requests/:id to get the signed URL once status='done'.
//
// POST /dsgvo/delete-account
//   7-day-hold delete. Queue a 'delete' request; the Edge Function
//   `dsgvo-delete-executor` runs at requested_at + 7d and cascades the
//   account_id deletion. Until then the cancel endpoint can flip the status
//   to 'cancelled'.

import { Hono } from 'hono';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const dsgvoRoutes = new Hono();
dsgvoRoutes.use('*', requireAuth);

dsgvoRoutes.post('/export', rateLimit({ key: 'dsgvo_export', per_day: 5 }), async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const ins = await supabase
    .from('dsgvo_requests')
    .insert({ account_id, kind: 'export', status: 'pending' })
    .select('id')
    .single();
  if (ins.error || !ins.data) {
    throw new ApiError('internal', 'Failed to queue export', {
      cause: ins.error?.message ?? 'no row',
    });
  }
  return c.json({ queued: true, request_id: (ins.data as { id: string }).id }, 202);
});

dsgvoRoutes.get('/requests/:id', async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');
  const row = await supabase
    .from('dsgvo_requests')
    .select('*')
    .eq('id', id)
    .eq('account_id', account_id)
    .maybeSingle();
  if (row.error) {
    throw new ApiError('internal', 'Failed to load request', { cause: row.error.message });
  }
  if (!row.data) throw new ApiError('not_found', 'Request not found');
  return c.json(row.data);
});

dsgvoRoutes.post('/delete-account', rateLimit({ key: 'dsgvo_delete', per_day: 2 }), async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');

  // Idempotency: if an active pending delete exists, return that one.
  const existing = await supabase
    .from('dsgvo_requests')
    .select('id, requested_at, status')
    .eq('account_id', account_id)
    .eq('kind', 'delete')
    .in('status', ['pending', 'running']);
  if (existing.error) {
    throw new ApiError('internal', 'Failed to check delete state', {
      cause: existing.error.message,
    });
  }
  if ((existing.data ?? []).length > 0) {
    const row = (existing.data ?? [])[0] as { id: string; requested_at: string };
    const execAt = new Date(new Date(row.requested_at).getTime() + 7 * 86_400_000);
    return c.json({ queued: true, request_id: row.id, execute_at: execAt.toISOString() });
  }

  const ins = await supabase
    .from('dsgvo_requests')
    .insert({ account_id, kind: 'delete', status: 'pending' })
    .select('id, requested_at')
    .single();
  if (ins.error || !ins.data) {
    throw new ApiError('internal', 'Failed to queue delete', {
      cause: ins.error?.message ?? 'no row',
    });
  }
  const data = ins.data as { id: string; requested_at: string };
  const execAt = new Date(new Date(data.requested_at).getTime() + 7 * 86_400_000);
  return c.json({ queued: true, request_id: data.id, execute_at: execAt.toISOString() }, 202);
});

dsgvoRoutes.post('/delete-account/:id/cancel', async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');
  const upd = await supabase
    .from('dsgvo_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('account_id', account_id)
    .eq('kind', 'delete')
    .in('status', ['pending', 'running'])
    .select('id')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to cancel delete', { cause: upd.error.message });
  }
  if (!upd.data) throw new ApiError('not_found', 'Active delete request not found');
  return c.json({ cancelled: true });
});

// Legacy path kept for old clients — Doc 04 historically named it differently.
dsgvoRoutes.post('/cancel-deletion', async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const upd = await supabase
    .from('dsgvo_requests')
    .update({ status: 'cancelled' })
    .eq('account_id', account_id)
    .eq('kind', 'delete')
    .in('status', ['pending', 'running'])
    .select('id');
  if (upd.error) {
    throw new ApiError('internal', 'Failed to cancel', { cause: upd.error.message });
  }
  return c.json({ cancelled: ((upd.data ?? []) as Array<unknown>).length });
});
