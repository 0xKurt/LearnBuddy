// Attempts routes. Doc 04 §POST /attempts, /attempts/batch, /attempts/:id/finalize.
//
// Slice D2 ships /attempts (single answer evaluation via P3). If the client
// already evaluated locally and is confident (`client_local_verdict`), we
// skip the LLM and just record. Otherwise we call llm.evaluateAnswer and
// debit 1 credit. Doc 08 §estimated-costs-per-action.
//
// /attempts/batch lands in E1 (sync drain from the mobile offline outbox).
// /attempts/:id/finalize is voice-flow polish; stub for now.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { refund, settle, tryDebit } from '../lib/credits.js';
import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { notImplemented } from '../lib/errors.js';
import type { EvaluateInput } from '../lib/llm/gateway.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const AttemptRequest = z.object({
  session_id: z.string().uuid().optional(),
  item_id: z.string().uuid(),
  mode: z.enum(['voice', 'text', 'multiple_choice']),
  kid_answer: z.string().max(2000),
  parsed_learner_latex: z.string().max(2000).nullable().optional(),
  prior_hints_given: z.array(z.string()).default([]),
  duration_ms: z.number().int().nonnegative().default(0),
  test_mode: z.boolean().default(false),
  client_local_verdict: z.enum(['correct']).nullable().optional(),
});

const ATTEMPT_ESTIMATE = 1; // Doc 08

export const attemptRoutes = new Hono();
attemptRoutes.use('*', requireAuth, requireLearnerContext);

attemptRoutes.post(
  '/',
  rateLimit({ key: 'attempts_create', per_hour: 600 }),
  zValidator('json', AttemptRequest),
  async (c) => {
    const { supabase, llm } = getDeps(c);
    const { account_id } = c.get('auth');
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const input = c.req.valid('json');

    // Load the item (and verify ownership via learner_id match).
    const itemRow = await supabase
      .from('items')
      .select('*')
      .eq('id', input.item_id)
      .is('archived_at', null)
      .maybeSingle();
    if (itemRow.error || !itemRow.data) {
      throw new ApiError('not_found', 'Item not found');
    }
    const item = itemRow.data as Record<string, unknown> & {
      learner_id: string;
      question: string;
      expected_answer: string;
      acceptable_answers: string[];
      answer_kind: EvaluateInput['answerKind'];
      mc_options: string[] | null;
      mc_correct_index: number | null;
      units: string | null;
      latex_expected: string | null;
      latex_acceptable: string[] | null;
      fill_blank_template: string | null;
      fill_blank_answers: string[] | null;
      diagram_label_index: number | null;
    };
    if (item.learner_id !== learner_id) {
      throw new ApiError('not_found', 'Item not found');
    }

    // Fast path: client is confident → record + return without LLM cost.
    if (input.client_local_verdict === 'correct') {
      await persistAttempt(supabase, {
        learner_id,
        item_id: input.item_id,
        session_id: input.session_id ?? null,
        mode: input.mode,
        verdict: 'correct',
        kid_answer: input.kid_answer,
        feedback: null,
        hints_used: input.prior_hints_given.length,
        duration_ms: input.duration_ms,
        evaluated_by: 'local',
        evaluation_model: null,
        evaluation_prompt_version: null,
        test_mode: input.test_mode,
      });
      return c.json({
        verdict: 'correct',
        feedback: null,
        next_hint: null,
        credits_used: 0,
      });
    }

    const learnerRow = await supabase
      .from('learners')
      .select('grade_level, ui_locale')
      .eq('id', learner_id)
      .maybeSingle();
    const learner =
      (learnerRow.data as { grade_level: number | null; ui_locale: string | null } | null) ?? null;
    const gradeLevel = learner?.grade_level ?? 7;
    const locale = (learner?.ui_locale ?? 'de') as EvaluateInput['locale'];

    const debit = {
      estimate: ATTEMPT_ESTIMATE,
      reason: 'evaluation',
      learner_id,
      reference_id: input.item_id,
    };
    await tryDebit(supabase, account_id, debit);

    try {
      const result = await llm.evaluateAnswer({
        question: item.question,
        expectedAnswer: item.expected_answer,
        acceptableAnswers: item.acceptable_answers ?? [],
        answerKind: item.answer_kind,
        kidAnswer: input.kid_answer,
        parsedLearnerLatex: input.parsed_learner_latex ?? undefined,
        locale,
        gradeLevel,
        priorHints: input.prior_hints_given,
      });
      const actualCredits = Math.max(1, Math.round(result.usage.cost_usd_micros / 100));
      await settle(supabase, account_id, debit, actualCredits, result.usage);
      await persistAttempt(supabase, {
        learner_id,
        item_id: input.item_id,
        session_id: input.session_id ?? null,
        mode: input.mode,
        verdict: result.verdict,
        kid_answer: input.kid_answer,
        feedback: result.feedback,
        hints_used: input.prior_hints_given.length,
        duration_ms: input.duration_ms,
        evaluated_by: 'llm',
        evaluation_model: result.usage.model,
        evaluation_prompt_version: result.usage.prompt_version,
        test_mode: input.test_mode,
      });
      return c.json({
        verdict: result.verdict,
        feedback: result.feedback,
        next_hint: result.next_hint,
        credits_used: actualCredits,
      });
    } catch (err) {
      await refund(supabase, account_id, debit);
      throw err instanceof ApiError
        ? err
        : new ApiError('evaluation_failed', err instanceof Error ? err.message : 'Evaluate failed');
    }
  },
);

attemptRoutes.post(
  '/batch',
  rateLimit({ key: 'attempts_batch', per_hour: 60 }),
  (c) => notImplemented(c, 'POST /attempts/batch'), // E1
);

attemptRoutes.post(
  '/:client_id/finalize',
  (c) => notImplemented(c, 'POST /attempts/:client_id/finalize (SSE)'), // E2 (voice polish)
);

async function persistAttempt(
  supabase: ReturnType<typeof getDeps>['supabase'],
  row: {
    learner_id: string;
    item_id: string;
    session_id: string | null;
    mode: 'voice' | 'text' | 'multiple_choice';
    verdict: 'correct' | 'partially_correct' | 'incorrect';
    kid_answer: string;
    feedback: string | null;
    hints_used: number;
    duration_ms: number;
    evaluated_by: 'local' | 'llm';
    evaluation_model: string | null;
    evaluation_prompt_version: string | null;
    test_mode: boolean;
  },
): Promise<void> {
  const ins = await supabase.from('attempts').insert({
    learner_id: row.learner_id,
    item_id: row.item_id,
    session_id: row.session_id,
    mode: row.mode,
    kid_answer: row.kid_answer,
    verdict: row.verdict,
    evaluated_by: row.evaluated_by,
    evaluation_model: row.evaluation_model,
    evaluation_prompt_version: row.evaluation_prompt_version,
    feedback: row.feedback,
    hints_used: row.hints_used,
    duration_ms: row.duration_ms,
    test_mode: row.test_mode,
  });
  if (ins.error) {
    console.error(`[attempts] persist failed: ${ins.error.message}`);
  }
}
