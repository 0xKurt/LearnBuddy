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
import { ScriptedGateway } from '../../testing/fakes.js';
import { openAIClient } from '../../llm/openai-client.js';
import { LlmError, type LlmGateway, type LlmRequest } from '../../llm/gateway.js';
import { VertexGateway } from '../../llm/vertex.js';
import { callModel } from '../../llm/call.js';
import { OpenAIAudioGateway } from '../audio.js';
const dbReady = await testDatabaseAvailable();
const json = { text: 'Gehörte Wörter.' };
const input = (purpose: 'pronounce' | 'transcribe'): LlmRequest => ({
  purpose,
  tier: 'fast',
  promptVersion: 'contract',
  system: 'Return the heard text as JSON.',
  contents: [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: Buffer.from('RIFFrecording').toString('base64'),
          },
        },
      ],
    },
  ],
  schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  maxOutputTokens: 100,
  temperature: 0,
  thinking: 'off',
  timeoutMs: 1000,
});
function setup(
  name: 'fake' | 'vertex' | 'openai',
  purpose: 'pronounce' | 'transcribe',
  scenario: MediaScenario,
) {
  const fetch = mediaHttp(
    scenario,
    Response.json(
      name === 'vertex'
        ? {
            candidates: [
              {
                index: 0,
                content: { role: 'model', parts: [{ text: JSON.stringify(json) }] },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
          }
        : purpose === 'transcribe'
          ? { text: json.text, usage: { input_tokens: 100, output_tokens: 20 } }
          : {
              choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(json) } }],
              usage: { prompt_tokens: 100, completion_tokens: 20 },
            },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const fake = new ScriptedGateway();
  if (name === 'fake' && scenario !== 'ok') {
    if (scenario === 'timeout' || scenario === 'cancelled')
      fake.script(purpose, () => new Promise(() => {}));
    else fake.script(purpose, { error: new LlmError(scenario, 'scripted') });
  } else fake.script(purpose, { json });
  const gateway: LlmGateway =
    name === 'fake'
      ? fake
      : name === 'openai'
        ? new OpenAIAudioGateway(openAIClient(mediaConfig, fetch), fake)
        : new VertexGateway(
            mediaConfig,
            () =>
              new GoogleGenAI({
                vertexai: true,
                apiKey: 'test',
                httpOptions: { retryOptions: { attempts: 1 } },
              }),
          );
  return { gateway, fetch };
}
afterEach(() => vi.unstubAllGlobals());
describe.each(['pronounce', 'transcribe'] as const)('%s audio seam', (purpose) => {
  describe.each(['fake', 'vertex', 'openai'] as const)('%s contract', (name) => {
    it('returns structured output and a nonzero usage receipt', async () => {
      const result = await setup(name, purpose, 'ok').gateway.generate(input(purpose));
      expect(result.json).toEqual(json);
      expect(result.usage.costMicros).toBeGreaterThan(0);
    });
    it.each(['timeout', 'rate_limited', 'refused'] as const)('classifies %s', async (scenario) => {
      await expect(
        setup(name, purpose, scenario).gateway.generate({ ...input(purpose), timeoutMs: 25 }),
      ).rejects.toMatchObject({ kind: scenario });
    });
    it('aborts before transport and during an in-flight call', async () => {
      const { gateway, fetch } = setup(name, purpose, 'cancelled');
      await expect(
        gateway.generate({ ...input(purpose), signal: AbortSignal.abort() }),
      ).rejects.toMatchObject({ kind: 'cancelled' });
      expect(fetch).not.toHaveBeenCalled();
      const controller = new AbortController();
      const pending = gateway.generate({ ...input(purpose), signal: controller.signal });
      setTimeout(() => controller.abort(), 20);
      await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
      if (name !== 'fake') expect(fetch.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
    });
    it.skipIf(!dbReady)('records the full receipt in the common cost ledger', async () => {
      const { gateway } = setup(name, purpose, 'ok');
      await withLearner(async (env, learner) => {
        const result = await callModel(
          { ...env.deps, llm: gateway },
          learner.learnerId,
          '2026-10-23',
          input(purpose),
        );
        expect(
          await env.db.one('select model,cost_micros from llm_calls where purpose=$1', [purpose]),
        ).toEqual({ model: result.usage.model, cost_micros: result.usage.costMicros });
      });
    });
  });
});
