// requires live verification in Claude Code session (real SDKs; only HTTP/scripted answers replaced).
import { GoogleGenAI } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config.js';
import { ScriptedGateway } from '../../testing/fakes.js';
import { LlmError, type LlmGateway, type LlmPart, type LlmUsage } from '../gateway.js';
import { OpenAIGateway } from '../openai.js';
import { VertexGateway } from '../vertex.js';
import { request, completion, http, sse, chunk, usage } from './chat-fixtures.js';

const config = loadConfig({
  DATABASE_URL: 'postgres://postgres@127.0.0.1:54316/postgres',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'openai',
  OPENAI_API_KEY: 'not-a-real-key',
  GOOGLE_CLOUD_PROJECT: 'test',
});
const receipt: LlmUsage = {
  model: 'scripted',
  inputTokens: 1000,
  outputTokens: 100,
  thoughtTokens: 0,
  cachedTokens: 0,
  costMicros: 800,
  latencyMs: 1,
};
const vertex = (text: string, reason?: string) => ({
  candidates: [
    {
      index: 0,
      content: { role: 'model', parts: [{ text }] },
      ...(reason ? { finishReason: reason } : {}),
    },
  ],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 },
});
type Scenario =
  | 'ok'
  | 'blocked'
  | 'refused'
  | 'invalid'
  | 'truncated'
  | 'stream'
  | 'broken'
  | 'waiting'
  | 'cancel-stream';
function setup(name: 'fake' | 'vertex' | 'openai', scenario: Scenario) {
  const text = scenario === 'invalid' ? '{' : '{"reply":"Grüße"}';
  const reason =
    scenario === 'blocked' ? 'content_filter' : scenario === 'truncated' ? 'length' : 'stop';
  let response =
    name === 'vertex'
      ? Response.json(
          vertex(
            text,
            reason === 'content_filter' ? 'SAFETY' : reason === 'length' ? 'MAX_TOKENS' : 'STOP',
          ),
        )
      : Response.json(completion(reason, text));
  if (scenario === 'refused')
    response = Response.json(
      { error: { code: 400, message: 'bad schema', status: 'INVALID_ARGUMENT' } },
      { status: 400 },
    );
  if (['stream', 'broken', 'cancel-stream'].includes(scenario)) {
    response =
      name === 'vertex'
        ? sse(
            [
              vertex(scenario === 'broken' ? text : '{"reply":"Grü'),
              ...(scenario === 'broken'
                ? []
                : [
                    vertex('ße"}', 'STOP'),
                    { usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } },
                  ]),
            ],
            false,
          )
        : sse([
            { ...chunk(scenario === 'broken' ? text : '{"reply":"Grü'), usage },
            ...(scenario === 'broken' ? [] : [chunk('ße"}', 'stop'), { choices: [], usage }]),
          ]);
  }
  const fetch = http();
  fetch.mockImplementation((_url, init) =>
    scenario === 'waiting'
      ? new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        })
      : Promise.resolve(response.clone()),
  );
  vi.stubGlobal('fetch', fetch);
  let gateway: LlmGateway;
  if (name === 'openai') gateway = new OpenAIGateway(config, fetch);
  else if (name === 'vertex')
    gateway = new VertexGateway(
      config,
      () =>
        new GoogleGenAI({
          vertexai: true,
          apiKey: 'not-a-real-key',
          httpOptions: { retryOptions: { attempts: 1 } },
        }),
    );
  else {
    const fake = new ScriptedGateway();
    gateway = fake;
    if (scenario === 'waiting') fake.script('tutor', () => new Promise(() => {}));
    else if (['blocked', 'refused', 'invalid', 'truncated', 'broken'].includes(scenario))
      fake.script('tutor', {
        error: new LlmError(
          scenario === 'blocked'
            ? 'blocked'
            : scenario === 'refused'
              ? 'refused'
              : 'invalid_output',
          'scripted failure',
          scenario === 'refused' ? null : receipt,
          scenario === 'truncated' ? 'MAX_TOKENS' : null,
        ),
        ...(scenario === 'broken' ? { written: '{"reply":"Grü' } : {}),
      });
    else fake.script('tutor', { json: { reply: 'Grüße' } });
  }
  return { gateway, fetch };
}
afterEach(() => vi.unstubAllGlobals());

describe.each(['fake', 'vertex', 'openai'] as const)('%s LlmGateway contract', (name) => {
  it('preserves system, conversation, schema and output budget at its boundary', async () => {
    const { gateway, fetch } = setup(name, 'ok');
    const req = request({ maxOutputTokens: 123 });
    expect((await gateway.generate(req)).json).toEqual({ reply: 'Grüße' });
    if (gateway instanceof ScriptedGateway) expect(gateway.calls).toEqual([req]);
    else {
      const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
      if (name === 'openai')
        expect(body).toMatchObject({
          max_completion_tokens: 123,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: [{ type: 'text', text: 'Hallo' }] },
          ],
          response_format: { json_schema: { schema: req.schema, strict: true } },
        });
      else
        expect(body).toMatchObject({
          contents: req.contents,
          systemInstruction: { parts: [{ text: req.system }] },
          generationConfig: { maxOutputTokens: 123, responseJsonSchema: req.schema },
        });
    }
  });

  it.each(['blocked', 'refused', 'invalid', 'truncated'] as const)(
    'maps %s and retains the available cost receipt',
    async (scenario) => {
      const { gateway } = setup(name, scenario);
      const error = await gateway.generate(request()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LlmError);
      expect(error).toMatchObject({
        kind: scenario === 'invalid' || scenario === 'truncated' ? 'invalid_output' : scenario,
      });
      if (scenario !== 'refused') {
        expect((error as LlmError).usage?.inputTokens).toBe(1000);
        expect((error as LlmError).usage?.costMicros).toBeGreaterThan(0);
      }
      if (scenario === 'truncated') expect((error as LlmError).truncated).toBe(true);
    },
  );

  it('streams cumulative partial JSON and returns the complete answer', async () => {
    const { gateway } = setup(name, 'stream'),
      partials: string[] = [];
    const result = await gateway.generate(request({ onPartial: (raw) => partials.push(raw) }));
    expect(partials.length).toBeGreaterThan(1);
    expect(partials[0]).not.toBe(JSON.stringify(result.json));
    expect(JSON.parse(partials.at(-1)!)).toEqual(result.json);
  });

  it('rejects an incomplete stream and retains earlier usage', async () => {
    const { gateway } = setup(name, 'broken');
    await expect(gateway.generate(request({ onPartial: () => {} }))).rejects.toMatchObject({
      kind: 'invalid_output',
      usage: { inputTokens: 1000 },
    });
  });

  it('cancels before starting and aborts an in-flight transport', async () => {
    const { gateway, fetch } = setup(name, 'waiting');
    const stopped = AbortSignal.abort();
    await expect(gateway.generate(request({ signal: stopped }))).rejects.toMatchObject({
      kind: 'cancelled',
    });
    expect(fetch).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pending = gateway.generate(request({ signal: controller.signal, timeoutMs: 2000 }));
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    if (name !== 'fake') expect(fetch.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
  });

  it('stops streaming on cancellation and preserves already reported costs', async () => {
    const { gateway } = setup(name, 'cancel-stream');
    const controller = new AbortController(),
      partial = vi.fn(() => controller.abort());
    await expect(
      gateway.generate(request({ signal: controller.signal, onPartial: partial })),
    ).rejects.toMatchObject({ kind: 'cancelled', usage: { inputTokens: 1000 } });
    expect(partial).toHaveBeenCalledTimes(1);
  });

  it('refuses unsupported MIME before transport or consuming a scripted answer', async () => {
    const { gateway, fetch } = setup(name, 'ok');
    const part = { inlineData: { mimeType: 'image/tiff', data: 'YQ==' } } as unknown as LlmPart;
    await expect(
      gateway.generate(request({ contents: [{ role: 'user', parts: [part] }] })),
    ).rejects.toMatchObject({ kind: 'refused', usage: null });
    expect(fetch).not.toHaveBeenCalled();
    if (gateway instanceof ScriptedGateway) expect(gateway.calls).toEqual([]);
  });
});
