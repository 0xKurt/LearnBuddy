// Worker endpoint that drains the extraction_jobs queue. Mounted OUTSIDE the
// learner-auth middleware (a worker has no learner context). Guarded by a
// shared secret. Called by the scheduled edge function / pg_cron. ADR 0003.

import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';

import { getDeps } from '../lib/deps.js';
import { runExtraction, VISION_ESTIMATE } from '../lib/extraction.js';

export const materialWorkerRoutes = new Hono();

type JobRow = {
  id: string;
  material_id: string;
  learner_id: string;
  account_id: string;
  subject_id: string;
  status: string;
  attempts: number;
  locale: string;
  title: string | null;
  client_quality_scores: Array<{ position: number }>;
};

const MAX_PER_DRAIN = 3; // bound wall-clock per invocation

function constantTimeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires same-length buffers. Return false immediately on
  // length mismatch (length itself is not secret), then compare bytes.
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

materialWorkerRoutes.post('/drain', async (c) => {
  const { supabase, llm, now, env } = getDeps(c);

  const secret = env.EXTRACTION_WORKER_SECRET;
  const provided = c.req.header('x-worker-secret') ?? '';
  if (!secret || !constantTimeEqual(provided, secret)) {
    return c.json({ error: { code: 'unauthenticated', message: 'bad worker secret' } }, 401);
  }

  const queued = await supabase
    .from('extraction_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true });
  if (queued.error) {
    return c.json({ error: { code: 'internal', message: queued.error.message } }, 500);
  }
  const jobs = ((queued.data ?? []) as JobRow[]).slice(0, MAX_PER_DRAIN);

  const results: Array<{ material_id: string; ok: boolean; error?: string }> = [];
  for (const job of jobs) {
    // Claim atomically: only one worker may flip queued → running. We also
    // re-stamp credit_estimate from the in-process constant so the sweep's
    // refund (migration 0020 reads j.credit_estimate) can never drift out of
    // sync with the value the route used at debit time — single source of
    // truth is VISION_ESTIMATE in extraction.ts.
    const claim = await supabase
      .from('extraction_jobs')
      .update({
        status: 'running',
        attempts: job.attempts + 1,
        credit_estimate: VISION_ESTIMATE,
        started_at: now().toISOString(),
        updated_at: now().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'queued')
      .select('id');
    const claimed = ((claim.data as Array<{ id: string }> | null) ?? []).length > 0;
    if (claim.error || !claimed) continue; // another worker took it

    const res = await runExtraction(
      { supabase, llm, now },
      {
        job_id: job.id,
        account_id: job.account_id,
        learner_id: job.learner_id,
        material_id: job.material_id,
        subject_id: job.subject_id,
        title: job.title,
        locale: job.locale,
        qualityScores: job.client_quality_scores ?? [],
      },
    );

    if (!res.ok) {
      // runExtraction's bail() already called markFailed + refund on the
      // material. Flip the job to 'failed' only if it's still 'running' —
      // if the sweep got here first the job is already 'failed' and this
      // no-ops (0 rows updated).
      await supabase
        .from('extraction_jobs')
        .update({
          status: 'failed',
          last_error: res.message,
          finished_at: now().toISOString(),
          updated_at: now().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'running');
    }
    // On success: runExtraction committed the job to 'done' atomically (inside
    // the function) before calling settle. Nothing left to do here.

    results.push({
      material_id: job.material_id,
      ok: res.ok,
      ...(res.ok ? {} : { error: res.message }),
    });
  }

  return c.json({ processed: results.length, results });
});
