// Worker endpoint that drains the extraction_jobs queue. Mounted OUTSIDE the
// learner-auth middleware (a worker has no learner context). Guarded by a
// shared secret. Called by the scheduled edge function / pg_cron. ADR 0003.

import { Hono } from 'hono';

import { getDeps } from '../lib/deps.js';
import { runExtraction } from '../lib/extraction.js';

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

materialWorkerRoutes.post('/drain', async (c) => {
  const { supabase, llm, now, env } = getDeps(c);

  const secret = env.EXTRACTION_WORKER_SECRET;
  if (!secret || c.req.header('x-worker-secret') !== secret) {
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
    // Claim atomically: only one worker may flip queued → running.
    const claim = await supabase
      .from('extraction_jobs')
      .update({
        status: 'running',
        attempts: job.attempts + 1,
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
        account_id: job.account_id,
        learner_id: job.learner_id,
        material_id: job.material_id,
        subject_id: job.subject_id,
        title: job.title,
        locale: job.locale,
        qualityScores: job.client_quality_scores ?? [],
      },
    );

    await supabase
      .from('extraction_jobs')
      .update({
        status: res.ok ? 'done' : 'failed',
        last_error: res.ok ? null : res.message,
        finished_at: now().toISOString(),
        updated_at: now().toISOString(),
      })
      .eq('id', job.id);

    results.push({
      material_id: job.material_id,
      ok: res.ok,
      ...(res.ok ? {} : { error: res.message }),
    });
  }

  return c.json({ processed: results.length, results });
});
