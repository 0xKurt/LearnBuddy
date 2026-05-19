// Factory that picks the right LLM backend at boot.
//
// - 'vertex' → real Gemini call via apps/api/src/lib/llm/vertex.ts.
// - 'fake'   → deterministic fixture-style output via apps/api/src/test/fake-llm.ts.
//
// Selection rules:
//   * If env.LLM_BACKEND is set, honor it (explicit opt-in/out).
//   * Else if NODE_ENV==='test', use 'fake'.
//   * Else if GOOGLE_CLOUD_PROJECT is set, use 'vertex'.
//   * Else THROW — in every non-test environment. A silent fake fallback in
//     dev/preview builds means a parent test-drives canned "Erklärung … (fake)"
//     tutoring and thinks the AI is broken. Fake is opt-in only
//     (LLM_BACKEND=fake), never an accident. CLAUDE.md §rule #5.
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
  // No silent fake outside tests — a dev/preview build serving canned
  // FakeLlmGateway tutoring is indistinguishable from "the AI is broken".
  // Fail loudly everywhere so the misconfiguration is caught at boot, not by
  // a frustrated user. Fake is explicit opt-in via LLM_BACKEND=fake.
  throw new Error(
    'LLM factory: no LLM backend resolvable. Set GOOGLE_CLOUD_PROJECT (real Vertex) ' +
      'in this environment, or set LLM_BACKEND=fake explicitly if you really want ' +
      'the deterministic fake. Refusing to silently serve fake tutoring.',
  );
}

export function createLlmGateway(env: Env): LLMGateway {
  const backend = pickBackend(env);
  if (backend === 'vertex') {
    ensureCredentialsFile(env);
    return new VertexLlmGateway(env);
  }
  return new FakeLlmGateway();
}
