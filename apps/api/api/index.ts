// Vercel function: every /v1/* and /api/* request (vercel.json rewrites them all here; the
// original path stays in the request URL, and createApp routes /v1 and /api alike).
import { attachDatabasePool, waitUntil } from '@vercel/functions';
import { handle } from 'hono/vercel';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { logBackgroundFailure, productionDeps } from '../src/production.js';

// The instance closes the pool's idle connections before it is suspended, so a minute of idle
// keep-alive (lib/db.ts POOL_IDLE_MS) leaves no connection dangling at the pooler (#671).
const deps = productionDeps(
  loadConfig(),
  (task) => {
    waitUntil(task().catch(logBackgroundFailure));
  },
  attachDatabasePool,
);
const app = createApp(deps);

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
