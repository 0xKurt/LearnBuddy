// Problem-template practice runs. Doc 04 §POST /templates/:id/practice-run.
//
// Slice D3 wiring. The mobile client generates the actual variants
// client-side using @learnbuddy/shared-math (mathjs evaluator), so this
// endpoint is bookkeeping: it creates a `practice_runs` row that the mobile
// app later PATCHes with results (problems_correct, avg_time_ms, etc.) when
// the run ends.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { notImplemented } from '../lib/errors.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const StartRunRequest = z.object({
  problems_generated: z.number().int().min(1).max(50).default(10),
});

const FinalizeRunRequest = z.object({
  problems_generated: z.number().int().min(0).max(50),
  problems_correct: z.number().int().min(0).max(50),
  avg_time_ms: z.number().int().nonnegative().nullable().optional(),
  ended_at: z.string(),
});

export const templateRoutes = new Hono();
templateRoutes.use('*', requireAuth, requireLearnerContext);

/** Verify template belongs to authed learner. */
async function ownedTemplate(
  supabase: ReturnType<typeof getDeps>['supabase'],
  learner_id: string,
  template_id: string,
): Promise<{ id: string; learner_id: string }> {
  const t = await supabase
    .from('problem_templates')
    .select('id, learner_id')
    .eq('id', template_id)
    .is('archived_at', null)
    .maybeSingle();
  if (t.error) {
    throw new ApiError('internal', 'Failed to load template', { cause: t.error.message });
  }
  if (!t.data || (t.data as { learner_id: string }).learner_id !== learner_id) {
    throw new ApiError('not_found', 'Template not found');
  }
  return t.data as { id: string; learner_id: string };
}

templateRoutes.post(
  '/:id/practice-run',
  rateLimit({ key: 'practice_run_create', per_day: 50 }),
  zValidator('json', StartRunRequest),
  async (c) => {
    const { supabase, now } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const template_id = c.req.param('id');
    const body = c.req.valid('json');

    await ownedTemplate(supabase, learner_id, template_id);

    const ins = await supabase
      .from('practice_runs')
      .insert({
        learner_id,
        template_id,
        problems_generated: body.problems_generated,
        problems_correct: 0,
        avg_time_ms: null,
        difficulty_adjustment: 0,
        started_at: now().toISOString(),
        ended_at: null,
      })
      .select('*')
      .single();
    if (ins.error || !ins.data) {
      throw new ApiError('internal', 'Failed to start practice run', {
        cause: ins.error?.message ?? 'no row',
      });
    }
    return c.json(ins.data, 201);
  },
);

templateRoutes.patch(
  '/:id/practice-run/:run_id',
  zValidator('json', FinalizeRunRequest),
  async (c) => {
    const { supabase } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const template_id = c.req.param('id');
    const run_id = c.req.param('run_id');
    const body = c.req.valid('json');

    await ownedTemplate(supabase, learner_id, template_id);

    const accuracy =
      body.problems_generated === 0 ? 0 : body.problems_correct / body.problems_generated;
    let difficulty_adjustment = 0;
    if (accuracy >= 0.9) difficulty_adjustment = +1;
    else if (accuracy < 0.5) difficulty_adjustment = -1;

    const upd = await supabase
      .from('practice_runs')
      .update({
        problems_generated: body.problems_generated,
        problems_correct: body.problems_correct,
        avg_time_ms: body.avg_time_ms ?? null,
        difficulty_adjustment,
        ended_at: body.ended_at,
      })
      .eq('id', run_id)
      .eq('template_id', template_id)
      .eq('learner_id', learner_id)
      .select('*')
      .maybeSingle();
    if (upd.error) {
      throw new ApiError('internal', 'Failed to finalize practice run', {
        cause: upd.error.message,
      });
    }
    if (!upd.data) throw new ApiError('not_found', 'Practice run not found');
    return c.json(upd.data);
  },
);

templateRoutes.delete('/:id', async (c) => {
  const { supabase, now } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const template_id = c.req.param('id');

  await ownedTemplate(supabase, learner_id, template_id);

  const upd = await supabase
    .from('problem_templates')
    .update({ archived_at: now().toISOString() })
    .eq('id', template_id);
  if (upd.error) {
    throw new ApiError('internal', 'Failed to archive template', { cause: upd.error.message });
  }
  return c.json({ id: template_id, archived: true });
});

// notImplemented kept for the unused signature warning silence — D3 implements
// the three above; future polish slices add list/get endpoints if needed.
void notImplemented;
