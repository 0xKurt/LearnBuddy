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

// GET /folders/:id — single Lernziel detail + all its items.
//
// Powers the Lernziel-Detail screen: kid taps a Lernziel and we deliver
// the folder metadata plus every (non-archived) item across every
// (non-archived) material inside the folder, ready for inline display
// + tutor session.
folderRoutes.get('/:id', async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');

  await ownedFolder(supabase, account_id, id);

  const folderRes = await supabase.from('folders').select('*').eq('id', id).maybeSingle();
  if (folderRes.error) {
    throw new ApiError('internal', 'Failed to load folder', { cause: folderRes.error.message });
  }
  if (!folderRes.data) throw new ApiError('not_found', 'Folder not found');

  const materialsRes = await supabase
    .from('materials')
    .select('id, title, extraction_status, page_count, created_at')
    .eq('folder_id', id)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  const materialsRaw = (materialsRes.data ?? []) as Array<{
    id: string;
    title: string | null;
    extraction_status: string;
    page_count: number | null;
    created_at: string;
  }>;

  const matIds = materialsRaw.map((m) => m.id);

  // Load all photos for these materials in ONE query so each material
  // row can carry its photo URLs. The folder UI surfaces the individual
  // sheets directly (one row per photo) instead of nesting them inside
  // a "Material" wrapper that the kid then had to click into.
  const photosRes =
    matIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('material_photos')
          .select('material_id, position, storage_path')
          .in('material_id', matIds)
          .order('position', { ascending: true });
  if (photosRes.error) {
    throw new ApiError('internal', 'Failed to load folder photos', {
      cause: photosRes.error.message,
    });
  }
  const photoRows = (photosRes.data ?? []) as Array<{
    material_id: string;
    position: number;
    storage_path: string;
  }>;
  const photoUrlsByMaterial = new Map<string, string[]>();
  for (const row of photoRows) {
    const path = row.storage_path.startsWith('materials-raw/')
      ? row.storage_path.slice('materials-raw/'.length)
      : row.storage_path;
    const signed = await supabase.storage.from('materials-raw').createSignedUrl(path, 3600);
    if (!signed.data?.signedUrl) continue;
    const arr = photoUrlsByMaterial.get(row.material_id) ?? [];
    arr.push(signed.data.signedUrl);
    photoUrlsByMaterial.set(row.material_id, arr);
  }
  const materials = materialsRaw.map((m) => ({
    ...m,
    photo_urls: photoUrlsByMaterial.get(m.id) ?? [],
  }));

  const itemsRes =
    matIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('items')
          .select('id, question, expected_answer, material_id, created_at')
          .in('material_id', matIds)
          .is('archived_at', null)
          .order('created_at', { ascending: true });
  if (itemsRes.error) {
    throw new ApiError('internal', 'Failed to load folder items', {
      cause: itemsRes.error.message,
    });
  }

  return c.json({
    ...(folderRes.data as Record<string, unknown>),
    materials,
    items: itemsRes.data ?? [],
  });
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
