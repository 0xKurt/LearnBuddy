// Factory that picks the right LLM backend at boot.
//
// - 'vertex' → real Gemini call via apps/api/src/lib/llm/vertex.ts.
// - 'fake'   → deterministic fixture-style output via apps/api/src/test/fake-llm.ts.
//
// Selection rules:
//   * If env.LLM_BACKEND is set, honor it.
//   * Else if NODE_ENV==='test', use 'fake'.
//   * Else if GOOGLE_CLOUD_PROJECT is set, use 'vertex'.
//   * Else fall back to 'fake' with a console.warn so the dev sees it.
//
// Also handles the Vercel cold-start dance for GOOGLE_APPLICATION_CREDENTIALS_JSON
// — writes the JSON string to a tempfile and sets the env var the SDK reads.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Env } from '../env.js';
import { FakeLlmGateway } from '../../test/fake-llm.js';
import type { LLMGateway } from './gateway.js';
import { VertexLlmGateway } from './vertex.js';

function ensureCredentialsFile(env: Env): void {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return; // already pointing at a file
  if (!env.GOOGLE_APPLICATION_CREDENTIALS_JSON) return; // nothing to do
  const path = join(tmpdir(), 'vertex-sa.json');
  writeFileSync(path, env.GOOGLE_APPLICATION_CREDENTIALS_JSON, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
}

function pickBackend(env: Env): 'vertex' | 'fake' {
  if (env.LLM_BACKEND) return env.LLM_BACKEND;
  if (env.NODE_ENV === 'test') return 'fake';
  if (env.GOOGLE_CLOUD_PROJECT) return 'vertex';
  // CLAUDE.md §rule #5 — never ship fake content in a production path. If
  // the env is missing in prod, that's a deployment misconfiguration; crash
  // loudly rather than serve "Wir bereiten dein Material vor" placeholders.
  if (env.NODE_ENV === 'production') {
    throw new Error(
      "LLM factory: GOOGLE_CLOUD_PROJECT missing in production. Set it in the deployment environment (or explicitly LLM_BACKEND=fake if you really want the fake in prod, which you don't).",
    );
  }
  console.warn(
    '[LLM] No GOOGLE_CLOUD_PROJECT configured — falling back to FakeLlmGateway. Set LLM_BACKEND=vertex once GCP env is in place.',
  );
  return 'fake';
}

export function createLlmGateway(env: Env): LLMGateway {
  const backend = pickBackend(env);
  if (backend === 'vertex') {
    ensureCredentialsFile(env);
    return new VertexLlmGateway(env);
  }
  return new FakeLlmGateway();
}
