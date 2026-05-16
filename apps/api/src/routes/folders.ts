// Folder routes. Doc 04 §subjects-and-folders (PATCH/DELETE).
//
// Both handlers join folder → subject → learner → account so cross-account
// access returns 404. RLS in production enforces the same guard (migration
// 0002 §folders) but we mirror it at the handler layer too so unit tests
// against the in-memory fake catch a regression.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { FolderUpdate } from '@learnbuddy/shared-types';

import { ApiError } from '../lib/errors.js';
import { getDeps } from '../lib/deps.js';
import { requireAuth } from '../middleware/auth.js';

export const folderRoutes = new Hono();
folderRoutes.use('*', requireAuth);

/** Resolve a folder by id and confirm it belongs to the authed account. */
async function ownedFolder(
  supabase: ReturnType<typeof getDeps>['supabase'],
  accountId: string,
  folderId: string,
): Promise<{ id: string; subject_id: string }> {
  const f = await supabase
    .from('folders')
    .select('id, subject_id')
    .eq('id', folderId)
    .is('archived_at', null)
    .maybeSingle();
  if (f.error) {
    throw new ApiError('internal', 'Failed to load folder', { cause: f.error.message });
  }
  if (!f.data) {
    throw new ApiError('not_found', 'Folder not found');
  }
  const s = await supabase
    .from('subjects')
    .select('id, learner_id')
    .eq('id', (f.data as { subject_id: string }).subject_id)
    .is('archived_at', null)
    .maybeSingle();
  if (s.error) {
    throw new ApiError('internal', 'Failed to resolve folder ownership', {
      cause: s.error.message,
    });
  }
  if (!s.data) {
    throw new ApiError('not_found', 'Folder not found');
  }
  const learner = await supabase
    .from('learners')
    .select('id')
    .eq('id', (s.data as { learner_id: string }).learner_id)
    .eq('account_id', accountId)
    .is('archived_at', null)
    .maybeSingle();
  if (learner.error) {
    throw new ApiError('internal', 'Failed to resolve folder ownership', {
      cause: learner.error.message,
    });
  }
  if (!learner.data) {
    throw new ApiError('not_found', 'Folder not found');
  }
  return f.data as { id: string; subject_id: string };
}

folderRoutes.patch('/:id', zValidator('json', FolderUpdate), async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');
  const input = c.req.valid('json');

  if (Object.keys(input).length === 0) {
    throw new ApiError('validation_failed', 'Empty update body');
  }

  await ownedFolder(supabase, account_id, id);

  const upd = await supabase
    .from('folders')
    .update(input)
    .eq('id', id)
    .is('archived_at', null)
    .select('*')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to update folder', { cause: upd.error.message });
  }
  if (!upd.data) {
    throw new ApiError('not_found', 'Folder not found');
  }
  return c.json(upd.data);
});

folderRoutes.delete('/:id', async (c) => {
  const { supabase, now } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');

  await ownedFolder(supabase, account_id, id);

  const upd = await supabase
    .from('folders')
    .update({ archived_at: now().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to archive folder', { cause: upd.error.message });
  }
  if (!upd.data) {
    throw new ApiError('not_found', 'Folder not found');
  }
  return c.json({ id: (upd.data as { id: string }).id, archived: true });
});
