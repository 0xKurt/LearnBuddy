// Production wiring of the dependencies (Node server and Vercel function).

import { SupabaseAuthVerifier } from './auth/verifier.js';
import type { Config } from './config.js';
import type { Deps } from './deps.js';
import { createDb } from './lib/db.js';
import { DisabledGateway } from './llm/gateway.js';
import { VertexGateway } from './llm/vertex.js';
import { DisabledPush, ExpoPush } from './push/transport.js';
import { SupabaseStorage } from './storage/gateway.js';

export function productionDeps(config: Config, background: Deps['background']): Deps {
  return {
    config,
    db: createDb(config.DATABASE_URL),
    now: () => new Date(),
    auth: new SupabaseAuthVerifier(config),
    storage: new SupabaseStorage(config),
    llm: config.LLM_BACKEND === 'vertex' ? new VertexGateway(config) : new DisabledGateway(),
    push:
      config.PUSH_BACKEND === 'expo' ? new ExpoPush(config.EXPO_ACCESS_TOKEN) : new DisabledPush(),
    background,
  };
}

/** Background work must never crash the process; failures stay visible in the logs and the jobs table. */
export function logBackgroundFailure(err: unknown): void {
  console.error(
    '[api] background task failed',
    err instanceof Error ? `${err.name}: ${err.message.slice(0, 300)}` : 'unknown',
  );
}
