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
  const folderRows = (folders.data ?? []) as Array<{
    id: string;
    subject_id: string;
    name: string;
    scheduled_for: string | null;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
  }>;
  if (folderRows.length === 0) return c.json([]);

  // Aggregate material + item counts per folder so the Lernziel-Liste
  // can show "3 Materialien · 24 Karten" without N+1 round-trips.
  const folderIds = folderRows.map((f) => f.id);
  const materialsRes = await supabase
    .from('materials')
    .select('id, folder_id, extraction_status')
    .in('folder_id', folderIds)
    .is('archived_at', null);
  const materials = (materialsRes.data ?? []) as Array<{
    id: string;
    folder_id: string | null;
    extraction_status: string;
  }>;
  const matIds = materials.map((m) => m.id);
  const itemsRes =
    matIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('items')
          .select('material_id')
          .in('material_id', matIds)
          .is('archived_at', null);
  const itemRows = (itemsRes.data ?? []) as Array<{ material_id: string }>;
  const itemCountByMat = new Map<string, number>();
  for (const r of itemRows) {
    itemCountByMat.set(r.material_id, (itemCountByMat.get(r.material_id) ?? 0) + 1);
  }
  const aggByFolder = new Map<
    string,
    { material_count: number; item_count: number; has_pending: boolean; has_failed: boolean }
  >();
  for (const m of materials) {
    if (!m.folder_id) continue;
    const agg = aggByFolder.get(m.folder_id) ?? {
      material_count: 0,
      item_count: 0,
      has_pending: false,
      has_failed: false,
    };
    agg.material_count += 1;
    agg.item_count += itemCountByMat.get(m.id) ?? 0;
    if (m.extraction_status !== 'ready' && m.extraction_status !== 'failed') {
      agg.has_pending = true;
    }
    if (m.extraction_status === 'failed') agg.has_failed = true;
    aggByFolder.set(m.folder_id, agg);
  }

  return c.json(
    folderRows.map((f) => {
      const agg = aggByFolder.get(f.id);
      return {
        ...f,
        material_count: agg?.material_count ?? 0,
        item_count: agg?.item_count ?? 0,
        has_pending: agg?.has_pending ?? false,
        has_failed: agg?.has_failed ?? false,
      };
    }),
  );
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
