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
    const nowIso = now().toISOString();

    const picked = await pickItems(supabase, {
      learner_id,
      subject_id: input.subject_id ?? null,
      folder_id: input.folder_id ?? null,
      material_id: input.material_id ?? null,
      max_items: input.max_items,
      now: nowIso,
    });

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

type PickInput = {
  learner_id: string;
  subject_id: string | null;
  folder_id: string | null;
  material_id: string | null;
  max_items: number;
  now: string;
};

async function pickItems(
  supabase: ReturnType<typeof getDeps>['supabase'],
  i: PickInput,
): Promise<Array<Record<string, unknown>>> {
  // Try the server-side RPC first; falls back to the JS path when the
  // function is missing (e.g. against the fake-supabase or a dev DB that
  // hasn't applied migration 0012 yet).
  const supaWithRpc = supabase as unknown as {
    rpc?: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: Array<{ item_id: string }> | null; error: { message: string } | null }>;
  };
  if (typeof supaWithRpc.rpc === 'function') {
    const ids = await supaWithRpc.rpc('lb_pick_session_items', {
      p_learner_id: i.learner_id,
      p_subject_id: i.subject_id,
      p_folder_id: i.folder_id,
      p_material_id: i.material_id,
      p_max_items: i.max_items,
      p_now: i.now,
    });
    if (!ids.error && ids.data) {
      const itemIds = ids.data.map((r) => r.item_id);
      if (itemIds.length === 0) return [];
      const items = await supabase.from('items').select('*').in('id', itemIds);
      if (items.error) {
        throw new ApiError('internal', 'Failed to load items', { cause: items.error.message });
      }
      // Preserve the RPC's ordering.
      const byId = new Map(
        ((items.data ?? []) as Array<Record<string, unknown>>).map((it) => [it.id as string, it]),
      );
      return itemIds.map((id) => byId.get(id)).filter((it): it is Record<string, unknown> => !!it);
    }
  }
  // ── Fallback path ────────────────────────────────────────────────────────
  let q = supabase.from('items').select('*').eq('learner_id', i.learner_id).is('archived_at', null);
  if (i.material_id) q = q.eq('material_id', i.material_id);
  const items = await q;
  if (items.error) {
    throw new ApiError('internal', 'Failed to load items', { cause: items.error.message });
  }
  let pool = (items.data ?? []) as Array<Record<string, unknown>>;

  if (i.subject_id || i.folder_id) {
    const mat = await supabase
      .from('materials')
      .select('id, subject_id, folder_id')
      .eq('learner_id', i.learner_id)
      .is('archived_at', null);
    const materials = (mat.data ?? []) as Array<{
      id: string;
      subject_id: string;
      folder_id: string | null;
    }>;
    const allow = new Set(
      materials
        .filter((m) => {
          if (i.subject_id && m.subject_id !== i.subject_id) return false;
          if (i.folder_id && m.folder_id !== i.folder_id) return false;
          return true;
        })
        .map((m) => m.id),
    );
    pool = pool.filter((it) => allow.has(it.material_id as string));
  }

  const states = await supabase.from('item_states').select('*').eq('learner_id', i.learner_id);
  const stateByItem = new Map<string, { due: string | null }>();
  for (const s of (states.data ?? []) as Array<{ item_id: string; due: string }>) {
    stateByItem.set(s.item_id, { due: s.due });
  }
  pool.sort((a, b) => {
    const aDue = stateByItem.get(a.id as string)?.due ?? null;
    const bDue = stateByItem.get(b.id as string)?.due ?? null;
    const aOverdue = aDue && aDue < i.now;
    const bOverdue = bDue && bDue < i.now;
    const aBucket = aOverdue ? 0 : aDue === null ? 1 : 2;
    const bBucket = bOverdue ? 0 : bDue === null ? 1 : 2;
    if (aBucket !== bBucket) return aBucket - bBucket;
    const aKey = aDue ?? '0';
    const bKey = bDue ?? '0';
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  return pool.slice(0, i.max_items);
}

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

// GET /sessions/:id/summary — Doc 04 §sessions + Doc 05 §result.
//
// Renders the post-session "Heute geübt — fein gemacht" screen. We never
// surface a "missed days" count (Doc 01 §tone) — secure / unsure are framed
// positively. Per Doc 05, we *may* list which topics felt sicher vs. unsicher.
sessionRoutes.get('/:id/summary', async (c) => {
  const { supabase } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const session_id = c.req.param('id');

  const sess = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .eq('learner_id', learner_id)
    .maybeSingle();
  if (sess.error) {
    throw new ApiError('internal', 'Failed to load session', { cause: sess.error.message });
  }
  if (!sess.data) throw new ApiError('not_found', 'Session not found');

  const attempts = await supabase
    .from('attempts')
    .select('item_id, verdict, duration_ms')
    .eq('session_id', session_id);
  if (attempts.error) {
    throw new ApiError('internal', 'Failed to load attempts', { cause: attempts.error.message });
  }
  const rows = (attempts.data ?? []) as Array<{
    item_id: string;
    verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped';
    duration_ms: number | null;
  }>;

  // Per-topic tally so the chips on result.tsx can render real names instead
  // of the placeholder German strings.
  const itemIds = [...new Set(rows.map((r) => r.item_id))];
  type ItemTopicRow = { id: string; topic: string | null };
  const topicByItem = new Map<string, string>();
  if (itemIds.length > 0) {
    const items = await supabase.from('items').select('id, topic').in('id', itemIds);
    if (!items.error) {
      for (const it of (items.data ?? []) as ItemTopicRow[]) {
        if (it.topic) topicByItem.set(it.id, it.topic);
      }
    }
  }

  type TopicTally = { secure: number; unsure: number };
  const byTopic = new Map<string, TopicTally>();
  let secureNow = 0;
  let stillUnsure = 0;
  let totalDuration = 0;
  for (const r of rows) {
    if (r.verdict === 'correct' || r.verdict === 'partially_correct') secureNow++;
    if (r.verdict === 'incorrect') stillUnsure++;
    totalDuration += r.duration_ms ?? 0;
    const topic = topicByItem.get(r.item_id);
    if (topic) {
      const t = byTopic.get(topic) ?? { secure: 0, unsure: 0 };
      if (r.verdict === 'correct' || r.verdict === 'partially_correct') t.secure++;
      if (r.verdict === 'incorrect') t.unsure++;
      byTopic.set(topic, t);
    }
  }

  const topics = Array.from(byTopic.entries())
    .map(([name, t]) => ({
      name,
      // "secure" if ≥ 2× as many correct as wrong; "unsure" otherwise. Soft
      // threshold to keep the green chip count generous (Doc 01 tone).
      tone: t.secure >= Math.max(1, t.unsure * 2) ? ('secure' as const) : ('unsure' as const),
    }))
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'secure' ? -1 : 1));

  const session = sess.data as Record<string, unknown>;
  return c.json({
    session_id,
    started_at: session.started_at,
    ended_at: session.ended_at,
    attempts_count: rows.length,
    secure_now: secureNow,
    still_unsure: stillUnsure,
    total_duration_ms: totalDuration,
    topics,
  });
});
