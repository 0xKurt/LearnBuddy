// Sessions. Doc 04 §POST /sessions.
//
// Slice E1: server picks due items using FSRS state. v1 selection logic:
//   1. Filter items by subject_id / folder_id / material_id when provided.
//   2. Filter by learner_id and archived_at IS NULL.
//   3. Sort by `item_states.due ASC` (overdue first), then unseen items
//      (no item_state row → treat as "new", after overdue), then future-due.
//   4. Cap at min(max_items, 50).
//
// For test_mode, the same selection is used but sessions.test_mode=true; the
// no-hints / single-shot rule changes (Doc 05 §session) are enforced
// client-side.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const SessionCreateRequest = z.object({
  subject_id: z.string().uuid().nullable().optional(),
  folder_id: z.string().uuid().nullable().optional(),
  material_id: z.string().uuid().nullable().optional(),
  test_mode: z.boolean().default(false),
  max_items: z.number().int().min(1).max(50).default(20),
});

export const sessionRoutes = new Hono();
sessionRoutes.use('*', requireAuth, requireLearnerContext);

sessionRoutes.post(
  '/',
  rateLimit({ key: 'sessions_create', per_hour: 60 }),
  zValidator('json', SessionCreateRequest),
  async (c) => {
    const { supabase, now } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const input = c.req.valid('json');

    let q = supabase.from('items').select('*').eq('learner_id', learner_id).is('archived_at', null);
    if (input.material_id) q = q.eq('material_id', input.material_id);
    const items = await q;
    if (items.error) {
      throw new ApiError('internal', 'Failed to load items', { cause: items.error.message });
    }
    let pool = (items.data ?? []) as Array<Record<string, unknown>>;

    if (input.subject_id || input.folder_id) {
      const mat = await supabase
        .from('materials')
        .select('id, subject_id, folder_id')
        .eq('learner_id', learner_id)
        .is('archived_at', null);
      const materials = (mat.data ?? []) as Array<{
        id: string;
        subject_id: string;
        folder_id: string | null;
      }>;
      const allow = new Set(
        materials
          .filter((m) => {
            if (input.subject_id && m.subject_id !== input.subject_id) return false;
            if (input.folder_id && m.folder_id !== input.folder_id) return false;
            return true;
          })
          .map((m) => m.id),
      );
      pool = pool.filter((it) => allow.has(it.material_id as string));
    }

    const states = await supabase.from('item_states').select('*').eq('learner_id', learner_id);
    const stateByItem = new Map<string, { due: string | null }>();
    for (const s of (states.data ?? []) as Array<{ item_id: string; due: string }>) {
      stateByItem.set(s.item_id, { due: s.due });
    }
    const nowIso = now().toISOString();
    pool.sort((a, b) => {
      const aDue = stateByItem.get(a.id as string)?.due ?? null;
      const bDue = stateByItem.get(b.id as string)?.due ?? null;
      const aOverdue = aDue && aDue < nowIso;
      const bOverdue = bDue && bDue < nowIso;
      // Buckets: 0 = overdue, 1 = unseen, 2 = future-due.
      const aBucket = aOverdue ? 0 : aDue === null ? 1 : 2;
      const bBucket = bOverdue ? 0 : bDue === null ? 1 : 2;
      if (aBucket !== bBucket) return aBucket - bBucket;
      const aKey = aDue ?? '0';
      const bKey = bDue ?? '0';
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });
    const picked = pool.slice(0, input.max_items);

    if (picked.length === 0) {
      throw new ApiError('not_found', 'No items in scope. Add material first or widen the filter.');
    }

    const sess = await supabase
      .from('sessions')
      .insert({
        learner_id,
        subject_id: input.subject_id ?? null,
        test_mode: input.test_mode,
        started_at: nowIso,
        attempts_count: 0,
        correct_count: 0,
      })
      .select('*')
      .single();
    if (sess.error || !sess.data) {
      throw new ApiError('internal', 'Failed to create session', {
        cause: sess.error?.message ?? 'no row',
      });
    }

    return c.json({
      session_id: (sess.data as { id: string }).id,
      items: picked,
    });
  },
);

sessionRoutes.patch('/:id/finish', async (c) => {
  const { supabase, now } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const session_id = c.req.param('id');

  const upd = await supabase
    .from('sessions')
    .update({ ended_at: now().toISOString() })
    .eq('id', session_id)
    .eq('learner_id', learner_id)
    .select('*')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to finish session', { cause: upd.error.message });
  }
  if (!upd.data) throw new ApiError('not_found', 'Session not found');
  return c.json(upd.data);
});
