// POST /explain — short tutoring explanation (P4). Doc 06 §P4.
//
// Body: { topic, style, context?, item_id? }. Returns plain text in JSON.
// Pre-debit 3 credits per Doc 08; settle to actual cost; refund on failure.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { refund, settle, tryDebit } from '../lib/credits.js';
import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const ExplainRequest = z.object({
  topic: z.string().min(2).max(280),
  style: z.enum(['simpler', 'step-by-step', 'analogy']).default('step-by-step'),
  context: z.string().max(2000).optional(),
  item_id: z.string().uuid().optional(),
});

const EXPLAIN_ESTIMATE = 3; // Doc 08 §estimated-costs-per-action

export const explainRoutes = new Hono();
explainRoutes.use('*', requireAuth, requireLearnerContext);

explainRoutes.post(
  '/',
  rateLimit({ key: 'explain', per_day: 60 }),
  zValidator('json', ExplainRequest),
  async (c) => {
    const { supabase, llm } = getDeps(c);
    const { account_id } = c.get('auth');
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const input = c.req.valid('json');

    const learnerRow = await supabase
      .from('learners')
      .select('grade_level, ui_locale')
      .eq('id', learner_id)
      .maybeSingle();
    if (learnerRow.error || !learnerRow.data) {
      throw new ApiError('not_found', 'Learner not found');
    }
    const learner = learnerRow.data as { grade_level: number | null; ui_locale: string | null };
    const gradeLevel = learner.grade_level ?? 7;
    const locale = (learner.ui_locale ?? 'de') as 'de' | 'en' | 'fr' | 'es' | 'it';

    const debit = {
      estimate: EXPLAIN_ESTIMATE,
      reason: 'explain',
      learner_id,
      reference_id: input.item_id,
    };
    await tryDebit(supabase, account_id, debit);

    try {
      const result = await llm.explain({
        topic: input.topic,
        context: input.context,
        locale,
        gradeLevel,
        style: input.style,
      });
      const actualCredits = Math.max(1, Math.round(result.usage.cost_usd_micros / 100));
      await settle(supabase, account_id, debit, actualCredits, result.usage);
      return c.json({ text: result.text, credits_used: actualCredits });
    } catch (err) {
      await refund(supabase, account_id, debit);
      throw err instanceof ApiError
        ? err
        : new ApiError('evaluation_failed', err instanceof Error ? err.message : 'Explain failed');
    }
  },
);
