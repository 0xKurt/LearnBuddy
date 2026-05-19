// Attempts routes. Doc 04 §POST /attempts/batch.
//
// The single POST /attempts (one-shot P3 evaluation) was removed: the app
// now learns through the streaming conversational endpoint
// (POST /sessions/:id/turn), so the old path was dead. /attempts/batch is
// still the sync drain for the mobile offline outbox (Slice E1).

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { applyAttempt, type ItemStateRow } from '../lib/fsrs.js';
import { idempotency } from '../lib/idempotency.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const attemptRoutes = new Hono();
attemptRoutes.use('*', requireAuth, requireLearnerContext);

// POST /attempts/batch — Doc 04 §POST /attempts/batch + Doc 05 §sync-engine.
//
// Mobile drains its offline outbox here. Each attempt is persisted; FSRS
// state is recomputed server-side using ts-fsrs (mirroring mobile's local
// FSRS). Items the learner does not own → rejected, not thrown.
const AttemptBatchRequest = z.object({
  attempts: z
    .array(
      z.object({
        client_attempt_id: z.string().uuid(),
        session_id: z.string().uuid().nullable().optional(),
        item_id: z.string().uuid(),
        mode: z.enum(['voice', 'text', 'multiple_choice']),
        kid_answer: z.string().max(2000).default(''),
        verdict: z.enum(['correct', 'partially_correct', 'incorrect', 'skipped']),
        feedback: z.string().nullable().optional(),
        hints_used: z.number().int().nonnegative().default(0),
        duration_ms: z.number().int().nonnegative().default(0),
        test_mode: z.boolean().default(false),
        evaluated_by: z.enum(['local', 'llm']),
        evaluation_model: z.string().nullable().optional(),
        evaluation_prompt_version: z.string().nullable().optional(),
        reviewed_at: z.string(),
      }),
    )
    .min(1)
    .max(200),
});

attemptRoutes.post(
  '/batch',
  rateLimit({ key: 'attempts_batch', per_hour: 60 }),
  idempotency,
  zValidator('json', AttemptBatchRequest),
  async (c) => {
    const { supabase } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const { attempts } = c.req.valid('json');

    const itemIds = [...new Set(attempts.map((a) => a.item_id))];
    const items = await supabase.from('items').select('id, learner_id').in('id', itemIds);
    if (items.error) {
      throw new ApiError('internal', 'Failed to load items', { cause: items.error.message });
    }
    const ownedByMe = new Set(
      ((items.data ?? []) as Array<{ id: string; learner_id: string }>)
        .filter((r) => r.learner_id === learner_id)
        .map((r) => r.id),
    );

    const states = await supabase
      .from('item_states')
      .select('*')
      .eq('learner_id', learner_id)
      .in('item_id', itemIds);
    const stateMap = new Map<string, ItemStateRow>();
    for (const s of (states.data ?? []) as ItemStateRow[]) stateMap.set(s.item_id, s);

    const accepted: string[] = [];
    const rejected: Array<{ client_attempt_id: string; reason: string }> = [];

    // Build the row payloads first so we can run a single bulk INSERT and a
    // single batched UPSERT instead of 2N sequential round-trips. A 200-row
    // batch used to do ~400 round-trips and would time out for users draining
    // a week of offline answers.
    const attemptRows: Array<Record<string, unknown>> = [];
    const stateRows: Array<Record<string, unknown>> = [];
    for (const a of attempts) {
      if (!ownedByMe.has(a.item_id)) {
        rejected.push({ client_attempt_id: a.client_attempt_id, reason: 'item_not_found' });
        continue;
      }
      attemptRows.push({
        learner_id,
        item_id: a.item_id,
        session_id: a.session_id ?? null,
        mode: a.mode,
        kid_answer: a.kid_answer,
        verdict: a.verdict === 'skipped' ? 'incorrect' : a.verdict,
        evaluated_by: a.evaluated_by,
        evaluation_model: a.evaluation_model ?? null,
        evaluation_prompt_version: a.evaluation_prompt_version ?? null,
        feedback: a.feedback ?? null,
        hints_used: a.hints_used,
        duration_ms: a.duration_ms,
        test_mode: a.test_mode,
      });
      const prev = stateMap.get(a.item_id) ?? null;
      const next = applyAttempt(prev, a.verdict, new Date(a.reviewed_at));
      stateRows.push({
        item_id: a.item_id,
        learner_id,
        ...next,
      });
      accepted.push(a.client_attempt_id);
    }

    if (attemptRows.length > 0) {
      const ins = await supabase.from('attempts').insert(attemptRows);
      if (ins.error) {
        console.error(`[attempts] bulk persist failed: ${ins.error.message}`);
      }
    }
    if (stateRows.length > 0) {
      // ON CONFLICT (item_id) DO UPDATE — relies on the unique index
      // item_states(item_id) which holds because each (learner_id, item_id)
      // is unique by schema. Supabase's upsert maps to a single SQL
      // INSERT … ON CONFLICT … RETURNING.
      const ups = await supabase.from('item_states').upsert(stateRows, { onConflict: 'item_id' });
      if (ups.error) {
        console.error(`[attempts] item_states upsert failed: ${ups.error.message}`);
      }
    }

    return c.json({ accepted, rejected });
  },
);
