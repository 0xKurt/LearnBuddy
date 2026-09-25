// Everything a request handler or background job needs from the outside
// world. Production wiring lives in server.ts / the Vercel entry; tests pass
// a real Postgres plus in-memory adapters for auth, storage, model and push.

import type { AuthVerifier } from './auth/verifier.js';
import type { Config } from './config.js';
import type { Db } from './lib/db.js';
import type { LlmGateway } from './llm/gateway.js';
import type { PushTransport } from './push/transport.js';
import type { StorageGateway } from './storage/gateway.js';

export type Deps = {
  config: Config;
  db: Db;
  /** The only clock. SQL never decides "due" or "expired" with now(). */
  now: () => Date;
  auth: AuthVerifier;
  storage: StorageGateway;
  llm: LlmGateway;
  push: PushTransport;
  /**
   * Starts work that should not hold up the response (Vercel waitUntil,
   * detached in the Node server). Only an accelerator: the same work is
   * always queued as a job first, so the scheduler does it if this never runs.
   */
  background: (task: () => Promise<void>) => void;
};
