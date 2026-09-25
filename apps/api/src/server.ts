// Node server (local development, or any non-serverless host).
//
// Development: `pnpm --filter @learnbuddy/api dev` reads apps/api/.env.local
// and, unless TICK_INTERVAL_SECONDS=0, runs the scheduler in-process so
// background work happens without pg_cron.

import { serve } from '@hono/node-server';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { runTick } from './modules/scheduler/tick.js';
import { logBackgroundFailure, productionDeps } from './production.js';

if (process.env.NODE_ENV !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });
}

const config = loadConfig();
const deps = productionDeps(config, (task) => {
  void task().catch(logBackgroundFailure);
});
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp(deps).fetch, port });
console.info(
  `[api] listening on :${port} (model: ${config.LLM_BACKEND}, push: ${config.PUSH_BACKEND})`,
);

const interval = config.TICK_INTERVAL_SECONDS ?? (config.NODE_ENV === 'production' ? 0 : 60);
if (interval > 0) {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    runTick(deps)
      .then((stats) => {
        if (stats.errors.length > 0) console.warn('[scheduler] finished with errors', stats.errors);
      })
      .catch(logBackgroundFailure)
      .finally(() => {
        running = false;
      });
  }, interval * 1000);
  console.info(`[scheduler] in-process every ${interval}s`);
}
