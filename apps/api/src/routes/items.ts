// Item soft-archive. Doc 04 §DELETE /items/:id.

import { Hono } from 'hono';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';

export const itemRoutes = new Hono();
itemRoutes.use('*', requireAuth, requireLearnerContext);

itemRoutes.delete('/:id', async (c) => {
  const { supabase, now } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const id = c.req.param('id');

  const lookup = await supabase
    .from('items')
    .select('id, learner_id')
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();
  if (lookup.error) {
    throw new ApiError('internal', 'Failed to load item', { cause: lookup.error.message });
  }
  if (!lookup.data || (lookup.data as { learner_id: string }).learner_id !== learner_id) {
    throw new ApiError('not_found', 'Item not found');
  }

  const upd = await supabase
    .from('items')
    .update({ archived_at: now().toISOString() })
    .eq('id', id);
  if (upd.error) {
    throw new ApiError('internal', 'Failed to archive item', { cause: upd.error.message });
  }
  return c.json({ id, archived: true });
});
