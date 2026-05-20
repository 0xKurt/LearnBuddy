// Sessions route — read-only summary surface.
//
// The full conversational tutor lives under /agent/* (routes/agent.ts). The
// only remaining /sessions endpoint is the result-screen summary, which the
// agent route still writes into the `sessions` + `attempts` tables.

import { Hono } from 'hono';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';

export const sessionRoutes = new Hono();
sessionRoutes.use('*', requireAuth, requireLearnerContext);

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
    if (r.verdict === 'incorrect' || r.verdict === 'skipped') stillUnsure++;
    totalDuration += r.duration_ms ?? 0;
    const topic = topicByItem.get(r.item_id);
    if (topic) {
      const t = byTopic.get(topic) ?? { secure: 0, unsure: 0 };
      if (r.verdict === 'correct' || r.verdict === 'partially_correct') t.secure++;
      if (r.verdict === 'incorrect' || r.verdict === 'skipped') t.unsure++;
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
