// Worker endpoint that drains the extraction_jobs queue. Mounted OUTSIDE the
// learner-auth middleware (a worker has no learner context). Guarded by a
// shared secret. Called by pg_cron (migration 0020) every 60 s in prod;
// the drain logic itself also runs fire-and-forget right after a POST
// /materials enqueue so local dev (where pg_cron doesn't reach localhost)
// processes the new job immediately. ADR 0003.

import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';

import { getDeps } from '../lib/deps.js';
import { drainExtractionJobs } from '../lib/extraction-drain.js';

export const materialWorkerRoutes = new Hono();

function constantTimeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires same-length buffers. Return false immediately on
  // length mismatch (length itself is not secret), then compare bytes.
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

materialWorkerRoutes.post('/drain', async (c) => {
  const { supabase, llm, now, env } = getDeps(c);

  // Always run constantTimeEqual against the provided header, even if the
  // env var is unset — coercing the missing secret to '' keeps the rejection
  // path timing-uniform, so an attacker can't probe whether the worker secret
  // is configured by measuring response latency.
  const secret = env.EXTRACTION_WORKER_SECRET ?? '';
  const provided = c.req.header('x-worker-secret') ?? '';
  if (secret.length === 0 || !constantTimeEqual(provided, secret)) {
    return c.json({ error: { code: 'unauthenticated', message: 'bad worker secret' } }, 401);
  }

  try {
    const result = await drainExtractionJobs({ supabase, llm, now });
    return c.json(result);
  } catch (err) {
    return c.json(
      { error: { code: 'internal', message: err instanceof Error ? err.message : String(err) } },
      500,
    );
  }
});
