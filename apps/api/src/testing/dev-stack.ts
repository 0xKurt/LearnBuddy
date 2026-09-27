// Local stack for trying the real app in a browser without Supabase or a
// model account: the real API and scheduler on a throwaway copy of the real
// schema (local Postgres), plus stand-ins for the outside world —
//   /auth/v1/*        a minimal Supabase Auth (GoTrue) for sign-up / sign-in / refresh
//   /dev-storage/*    the photo upload target
//   model             scripted answers for one scenario (or none: LB_DEV_MODEL=disabled)
// Test tooling only (src/testing is not part of the build). Never deploy it.
//
//   pnpm --filter @learnbuddy/api dev:stack
//   → API and auth on http://localhost:8787 (PORT to change)
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { serve } from '@hono/node-server';

import { loadConfig } from '../config.js';
import type { Deps } from '../deps.js';
import { createDb } from '../lib/db.js';
import { DisabledGateway } from '../llm/gateway.js';
import { DisabledPush } from '../push/transport.js';
import { runTick } from '../modules/scheduler/tick.js';
import { createTestDatabase, testDatabaseAvailable } from './database.js';
import { createDevApp, DevAuth, DevStorage } from './dev-app.js';
import { ScriptedGateway } from './fakes.js';
import { scriptCoreLoop } from './scenarios/core-loop.js';
import { scriptLearningModes } from './scenarios/learning-modes.js';
import { scriptTour } from './scenarios/tour.js';

const PORT = Number(process.env.PORT ?? 8787);
const BASE = `http://localhost:${PORT}`;

async function main(): Promise<void> {
  if (!(await testDatabaseAvailable()))
    throw new Error('No local Postgres (see LB_TEST_DATABASE_URL)');
  const database = await createTestDatabase();
  const db = createDb(database.url, { max: 8 });
  const config = loadConfig({
    NODE_ENV: 'development',
    DATABASE_URL: database.url,
    SUPABASE_URL: BASE,
    SUPABASE_SERVICE_ROLE_KEY: 'dev-service-role-key-not-used',
    TICK_SECRET: 'dev-tick-secret-0123456789abcdef',
    ADMIN_TOKEN_SECRET: 'dev-admin-secret-0123456789abcdef0123',
    LLM_BACKEND: 'disabled',
    PUSH_BACKEND: 'disabled',
  });
  const auth = new DevAuth(db);
  const storage = new DevStorage(BASE);
  const scripted = new ScriptedGateway();
  const model = process.env.LB_DEV_MODEL === 'disabled' ? new DisabledGateway() : scripted;
  if (model === scripted) {
    scriptCoreLoop(scripted);
    scriptLearningModes(scripted);
    scriptTour(scripted);
  }
  const deps: Deps = {
    config,
    db,
    now: () => new Date(),
    auth,
    storage,
    llm: model,
    push: new DisabledPush(),
    background: (task) => {
      void task().catch((err: unknown) => console.error('[dev-stack] background', err));
    },
  };

  const outer = createDevApp(deps, auth, storage);

  serve({ fetch: outer.fetch, port: PORT });
  console.info(
    `[dev-stack] API + auth on ${BASE} · database ${database.url} · model ${model === scripted ? 'scripted (core loop)' : 'disabled'}`,
  );

  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runTick(deps)
      .then((s) => {
        if (s.errors.length) console.warn('[dev-stack] tick errors', s.errors);
      })
      .catch((err: unknown) => console.error('[dev-stack] tick', err))
      .finally(() => {
        running = false;
      });
  }, 5000);

  const stop = async () => {
    clearInterval(timer);
    const left = scripted.pending();
    if (left > 0 || scripted.unexpected.length > 0) {
      console.info(
        `[dev-stack] scripted answers left: ${left}; unscripted calls: ${scripted.unexpected.map((u) => u.purpose).join(', ') || 'none'}`,
      );
    }
    await db.close();
    await database.drop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

void main();
