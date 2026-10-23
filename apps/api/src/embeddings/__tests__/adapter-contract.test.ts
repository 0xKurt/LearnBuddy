// requires live verification in Claude Code session (real SDK/HTTP boundary and Postgres).
import { GoogleGenAI } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mediaConfig,
  mediaHttp,
  withLearner,
  type MediaScenario,
} from '../../llm/__tests__/media-fixtures.js';
import { testDatabaseAvailable } from '../../testing/database.js';
import { FakeEmbeddings } from '../../testing/fakes.js';
import { openAIClient } from '../../llm/openai-client.js';
import { LlmError } from '../../llm/gateway.js';
import type { EmbeddingGateway, EmbedRequest } from '../../llm/embeddings.js';
import { VertexEmbeddings } from '../../llm/vertex-embeddings.js';
import { callEmbedding } from '../../llm/call.js';
import { OpenAIEmbeddings } from '../openai.js';
const dbReady = await testDatabaseAvailable();
const input: EmbedRequest = {
  task: 'RETRIEVAL_DOCUMENT',
  texts: ['Pflanzen brauchen Licht.'],
  timeoutMs: 1000,
};
function setup(name: 'fake' | 'vertex' | 'openai', scenario: MediaScenario) {
  const dimensions = name === 'openai' ? 1536 : 768;
  const vector = Array.from({ length: dimensions }, (_, i) => (i === 0 ? 1 : 0));
  const fetch = mediaHttp(
    scenario,
    Response.json(
      name === 'vertex'
        ? { predictions: [{ embeddings: { values: vector, statistics: { token_count: 20 } } }] }
        : { data: [{ index: 0, embedding: vector }], usage: { prompt_tokens: 20 } },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  let gateway: EmbeddingGateway;
  if (name === 'vertex')
    gateway = new VertexEmbeddings(
      mediaConfig,
      () =>
        new GoogleGenAI({
          vertexai: true,
          apiKey: 'test',
          httpOptions: { retryOptions: { attempts: 1 } },
        }),
    );
  else if (name === 'openai') gateway = new OpenAIEmbeddings(openAIClient(mediaConfig, fetch));
  else {
    const fake = new FakeEmbeddings();
    if (scenario === 'timeout' || scenario === 'cancelled') fake.waitForAbort = true;
    else if (scenario !== 'ok') fake.failNext(new LlmError(scenario, 'scripted'));
    gateway = fake;
  }
  return { gateway, fetch, dimensions };
}
afterEach(() => vi.unstubAllGlobals());
describe.each(['fake', 'vertex', 'openai'] as const)('%s EmbeddingGateway contract', (name) => {
  it('returns one finite unit vector per text and a nonzero cost receipt', async () => {
    const { gateway, dimensions } = setup(name, 'ok');
    const result = await gateway.embed(input);
    expect(result.vectors).toHaveLength(1);
    expect(result.vectors[0]).toHaveLength(dimensions);
    expect(result.vectors[0]!.every(Number.isFinite)).toBe(true);
    expect(result.vectors[0]!.reduce((sum, n) => sum + n * n, 0)).toBeCloseTo(1);
    expect(result.usage.costMicros).toBeGreaterThan(0);
    expect(result.usage.model).toBeTruthy();
  });
  it.each(['timeout', 'rate_limited', 'refused'] as const)('classifies %s', async (scenario) => {
    await expect(
      setup(name, scenario).gateway.embed({ ...input, timeoutMs: 25 }),
    ).rejects.toMatchObject({ kind: scenario });
  });
  it('aborts before transport and during an in-flight call', async () => {
    const { gateway, fetch } = setup(name, 'cancelled');
    await expect(gateway.embed({ ...input, signal: AbortSignal.abort() })).rejects.toMatchObject({
      kind: 'cancelled',
    });
    expect(fetch).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pending = gateway.embed({ ...input, signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    if (name !== 'fake') expect(fetch.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
  });
  it.skipIf(!dbReady)('records the model and cost in the shared ledger', async () => {
    const { gateway } = setup(name, 'ok');
    await withLearner(async (env, learner) => {
      const result = await callEmbedding(
        { db: env.db, embeddings: gateway },
        learner.learnerId,
        '2026-10-23',
        input,
      );
      expect(
        await env.db.one("select model,cost_micros from llm_calls where purpose='embedding'"),
      ).toEqual({ model: result.usage.model, cost_micros: result.usage.costMicros });
    });
  });
});
