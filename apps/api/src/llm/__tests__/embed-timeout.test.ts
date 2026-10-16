// A query embedding has its own bound (#673): the provider is not waited on past `timeoutMs`, the
// call ends as a timeout and the search goes on with its other lists. Only `fetch` is replaced
// (like the wire test, vertex-request.test.ts): the provider never answers, and the real SDK must
// give up on its own signal.

import { GoogleGenAI } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../../config.js';
import { LlmError } from '../gateway.js';
import { VertexEmbeddings } from '../vertex-embeddings.js';

const config = loadConfig({
  DATABASE_URL: 'postgres://127.0.0.1/x',
  SUPABASE_URL: 'http://x.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'disabled',
});

/** The gateway with an API-key client, so no credentials are looked up (only fetch is faked). */
function gateway(): VertexEmbeddings {
  const g = new VertexEmbeddings(config);
  Object.assign(g, { client: new GoogleGenAI({ vertexai: true, apiKey: 'not-a-key' }) });
  return g;
}

describe('the query embedding is bounded (#673)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives up after timeoutMs when the provider does not answer', async () => {
    vi.stubGlobal('fetch', (_url: unknown, init: { signal?: AbortSignal } | undefined) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    });
    const started = performance.now();
    const err = await gateway()
      .embed({ task: 'RETRIEVAL_QUERY', texts: ['Brüche'], timeoutMs: 50 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).kind).toBe('timeout');
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
