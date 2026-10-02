// POST /perf — the device's summed-up waiting times (issue #169); what is kept is in service.ts.

import { PerfReport } from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';

import { depsOf, requireAccount, requireUser, type AppEnv } from '../../http/context.js';
import { readBody } from '../../http/validate.js';
import { recordPerf } from './service.js';

export const perfRoutes = new Hono<AppEnv>();

perfRoutes.post('/perf', requireUser, requireAccount, async (c) => {
  const report = await readBody(c, PerfReport);
  const rows = await recordPerf(depsOf(c), report);
  return c.json({ ok: true, rows });
});
