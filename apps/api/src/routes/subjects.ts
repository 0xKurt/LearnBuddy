// Subject routes. Doc 04 §subjects-and-folders.
//
// PATCH /subjects/:id, DELETE /subjects/:id        — rename / soft archive
// GET   /subjects/:subjectId/folders               — folders under a subject
// POST  /subjects/:subjectId/folders               — create a folder
//
// Every handler joins subject → learner → account on every read/write so
// cross-account access returns 404 (we do not leak that the id exists).
// The production schema enforces this via RLS (migration 0002); the handler
// layer mirrors the same guard so unit tests against the in-memory fake
// surface a regression instead of silently passing.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { FolderCreate, SubjectUpdate } from '@learnbuddy/shared-types';

import { ApiError } from '../lib/errors.js';
import { getDeps } from '../lib/deps.js';
import { idempotency } from '../lib/idempotency.js';
import { requireAuth } from '../middleware/auth.js';

export const subjectRoutes = new Hono();
subjectRoutes.use('*', requireAuth);

/** Resolve a subject by id and confirm it belongs to the authed account. */
async function ownedSubject(
  supabase: ReturnType<typeof getDeps>['supabase'],
  accountId: string,
  subjectId: string,
): Promise<{ id: string; learner_id: string }> {
  const s = await supabase
    .from('subjects')
    .select('id, learner_id')
    .eq('id', subjectId)
    .is('archived_at', null)
    .maybeSingle();
  if (s.error) {
    throw new ApiError('internal', 'Failed to load subject', { cause: s.error.message });
  }
  if (!s.data) {
    throw new ApiError('not_found', 'Subject not found');
  }
  const learner = await supabase
    .from('learners')
    .select('id')
    .eq('id', (s.data as { learner_id: string }).learner_id)
    .eq('account_id', accountId)
    .is('archived_at', null)
    .maybeSingle();
  if (learner.error) {
    throw new ApiError('internal', 'Failed to resolve subject ownership', {
      cause: learner.error.message,
    });
  }
  if (!learner.data) {
    throw new ApiError('not_found', 'Subject not found');
  }
  return s.data as { id: string; learner_id: string };
}

subjectRoutes.patch('/:id', zValidator('json', SubjectUpdate), async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');
  const input = c.req.valid('json');

  if (Object.keys(input).length === 0) {
    throw new ApiError('validation_failed', 'Empty update body');
  }

  await ownedSubject(supabase, account_id, id);

  const upd = await supabase
    .from('subjects')
    .update(input)
    .eq('id', id)
    .is('archived_at', null)
    .select('*')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to update subject', { cause: upd.error.message });
  }
  if (!upd.data) {
    throw new ApiError('not_found', 'Subject not found');
  }
  return c.json(upd.data);
});

subjectRoutes.delete('/:id', async (c) => {
  const { supabase, now } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');

  await ownedSubject(supabase, account_id, id);

  const upd = await supabase
    .from('subjects')
    .update({ archived_at: now().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to archive subject', { cause: upd.error.message });
  }
  if (!upd.data) {
    throw new ApiError('not_found', 'Subject not found');
  }
  return c.json({ id: (upd.data as { id: string }).id, archived: true });
});

subjectRoutes.post('/:id/restore', async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');

  // Must look up archived subjects (archived_at IS NOT NULL).
  const s = await supabase
    .from('subjects')
    .select('id, learner_id')
    .eq('id', id)
    .not('archived_at', 'is', null)
    .maybeSingle();
  if (s.error) throw new ApiError('internal', 'Failed to load subject', { cause: s.error.message });
  if (!s.data) throw new ApiError('not_found', 'Archived subject not found');

  const learner = await supabase
    .from('learners')
    .select('id')
    .eq('id', (s.data as { learner_id: string }).learner_id)
    .eq('account_id', account_id)
    .is('archived_at', null)
    .maybeSingle();
  if (learner.error)
    throw new ApiError('internal', 'Failed to resolve ownership', { cause: learner.error.message });
  if (!learner.data) throw new ApiError('not_found', 'Archived subject not found');

  const upd = await supabase
    .from('subjects')
    .update({ archived_at: null })
    .eq('id', id)
    .not('archived_at', 'is', null)
    .select('id')
    .maybeSingle();
  if (upd.error)
    throw new ApiError('internal', 'Failed to restore subject', { cause: upd.error.message });
  if (!upd.data) throw new ApiError('not_found', 'Archived subject not found');
  return c.json({ id: (upd.data as { id: string }).id, restored: true });
});

subjectRoutes.get('/:subjectId/folders', async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const subjectId = c.req.param('subjectId');

  await ownedSubject(supabase, account_id, subjectId);

  const folders = await supabase
    .from('folders')
    .select('*')
    .eq('subject_id', subjectId)
    .is('archived_at', null);
  if (folders.error) {
    throw new ApiError('internal', 'Failed to load folders', { cause: folders.error.message });
  }
  return c.json(folders.data ?? []);
});

subjectRoutes.post(
  '/:subjectId/folders',
  idempotency,
  zValidator('json', FolderCreate),
  async (c) => {
    const { supabase } = getDeps(c);
    const { account_id } = c.get('auth');
    const subjectId = c.req.param('subjectId');
    const input = c.req.valid('json');

    await ownedSubject(supabase, account_id, subjectId);

    const insert = await supabase
      .from('folders')
      .insert({
        subject_id: subjectId,
        name: input.name,
        scheduled_for: input.scheduled_for ?? null,
        archived_at: null,
      })
      .select('*')
      .single();
    if (insert.error) {
      throw new ApiError('internal', 'Failed to create folder', { cause: insert.error.message });
    }
    return c.json(insert.data, 201);
  },
);
