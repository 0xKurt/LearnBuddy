// requires live verification in Claude Code session (only HTTP is faked; no model calls).
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { loadConfig } from '../../config.js';
import { AzureOpenAIGateway } from '../azure.js';
import { OpenAIGateway } from '../openai.js';
import { request, usage, completion, http, sse, chunk } from './chat-fixtures.js';
import { toJsonSchema } from '../json-schema.js';
import { answerUpTo, partialString } from '../partial.js';

const config = loadConfig({
  DATABASE_URL: 'postgres://postgres@127.0.0.1:54316/postgres',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'azure',
  AZURE_OPENAI_PRICES: JSON.stringify({
    source: 'https://example.test/fictional-test-prices',
    readOn: '2026-10-23',
    models: {
      'gpt-5.4': { inputPerM: 2, outputPerM: 8 },
      'gpt-5.4-mini': { inputPerM: 0.5, outputPerM: 2 },
    },
  }),
  AZURE_OPENAI_ENDPOINT: 'https://lb-test.openai.azure.com',
  AZURE_OPENAI_KEY: 'not-a-real-key',
  AZURE_OPENAI_DEPLOYMENT: 'buddy',
  AZURE_OPENAI_DEPLOYMENT_FAST: 'small',
  AZURE_OPENAI_REGION: 'swedencentral',
  AZURE_OPENAI_DEPLOYMENT_TYPE: 'DataZoneStandard',
});
describe.each(['azure', 'openai'] as const)('%s HTTP gateway', (provider) => {
  const direct = loadConfig({
    DATABASE_URL: config.DATABASE_URL,
    SUPABASE_URL: config.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_TOKEN_SECRET: config.ADMIN_TOKEN_SECRET,
    LLM_BACKEND: 'openai',
    OPENAI_API_KEY: 'not-a-real-key',
  });
  const createGateway = (fetch: typeof globalThis.fetch) =>
    provider === 'azure' ? new AzureOpenAIGateway(config, fetch) : new OpenAIGateway(direct, fetch);
  const smart = provider === 'azure' ? 'buddy' : 'gpt-5.4-mini';
  const fast = provider === 'azure' ? 'small' : 'gpt-5.4-nano';
  it.each([
    ['gpt-5.4-2026-03-05', provider === 'azure' ? 2800 : 1320],
    ['gpt-5.4-mini-2026-03-17', provider === 'azure' ? 700 : 1320],
    ['unknown-model', provider === 'azure' ? 2800 : 1320],
  ])(
    'prices %s independently of the deployment alias without double billing reasoning',
    async (model, expected) => {
      const fetch = http({ ...completion(), model });
      const result = await createGateway(fetch).generate(request());
      expect(result.usage).toMatchObject({
        model,
        costMicros: expected,
        outputTokens: 70,
        thoughtTokens: 30,
        cachedTokens: 600,
      });
    },
  );

  it('retries a transient failure through the shared retry budget', async () => {
    const fetch = http();
    fetch.mockResolvedValueOnce(
      Response.json({ error: { code: 'server_error' } }, { status: 503 }),
    );
    const result = await createGateway(fetch).generate(request({ timeoutMs: 10_000 }));
    expect(result.attempts).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses too many images and oversized schemas before sending them', async () => {
    const fetch = http();
    const gateway = createGateway(fetch);
    await expect(
      gateway.generate(
        request({
          contents: [
            {
              role: 'user',
              parts: Array.from({ length: provider === 'azure' ? 11 : 21 }, () => ({
                inlineData: { mimeType: 'image/png' as const, data: 'YQ==' },
              })),
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ kind: 'refused', finishReason: 'INLINE_TOO_LARGE' });
    await expect(
      gateway.generate(
        request({
          schema: {
            type: 'object',
            properties: Object.fromEntries(
              Array.from({ length: provider === 'azure' ? 101 : 5001 }, (_, i) => [
                String(i),
                { type: 'string' },
              ]),
            ),
          },
        }),
      ),
    ).rejects.toMatchObject({ kind: 'refused' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends strict JSON, original messages and images to the configured deployment', async () => {
    const fetch = http();
    await createGateway(fetch).generate(
      request({
        contents: [
          { role: 'model', parts: [{ text: 'Vorher' }] },
          {
            role: 'user',
            parts: [{ text: 'Blatt' }, { inlineData: { mimeType: 'image/jpeg', data: 'YQ==' } }],
          },
        ],
      }),
    );
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      provider === 'azure'
        ? 'https://lb-test.openai.azure.com/openai/v1/chat/completions'
        : 'https://eu.api.openai.com/v1/chat/completions',
    );
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer not-a-real-key');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: smart,
      max_completion_tokens: 100,
      reasoning_effort: 'none',
      response_format: { type: 'json_schema', json_schema: { name: 'learnbuddy', strict: true } },
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'assistant', content: 'Vorher' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Blatt' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,YQ==', detail: 'high' },
            },
          ],
        },
      ],
      store: false,
    });
    expect(body).not.toHaveProperty('temperature');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['off', 'none'],
    ['minimal', 'low'],
    ['low', 'low'],
    ['medium', 'medium'],
    ['high', 'high'],
  ] as const)('maps neutral thinking %s to %s on the fast deployment', async (thinking, effort) => {
    const fetch = http();
    await createGateway(fetch).generate(request({ thinking, tier: 'fast' }));
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toMatchObject({
      model: fast,
      reasoning_effort: effort,
    });
  });

  it.skipIf(provider !== 'azure')(
    'supports an explicitly configured dated Azure API version',
    async () => {
      const fetch = http();
      await new AzureOpenAIGateway(
        { ...config, AZURE_OPENAI_API_VERSION: '2025-04-01-preview' },
        fetch,
      ).generate(request());
      expect(String(fetch.mock.calls[0]![0])).toBe(
        'https://lb-test.openai.azure.com/openai/deployments/buddy/chat/completions?api-version=2025-04-01-preview',
      );
      expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('api-key')).toBe('not-a-real-key');
    },
  );

  it('streams cumulative JSON usable by existing partial helpers and keeps trailing usage', async () => {
    const partials: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      sse([
        { choices: [], prompt_filter_results: [] },
        chunk('{"reply":"Grü'),
        chunk('ße","items":[{"x":null},'),
        chunk('{"x":2}]}', 'stop'),
        { choices: [], usage },
      ]),
    );
    const schema = toJsonSchema(
      z.object({ reply: z.string(), items: z.array(z.object({ x: z.number().optional() })) }),
    );
    const result = await createGateway(fetch).generate(
      request({ schema, onPartial: (s) => partials.push(s) }),
    );
    expect(partialString(partials[0]!, 'reply')).toEqual({ text: 'Grü', done: false });
    expect(answerUpTo(partials[1]!, 'items', 1)).toEqual({ reply: 'Grüße', items: [{}] });
    expect(result.json).toEqual({ reply: 'Grüße', items: [{}, { x: 2 }] });
    expect(result.usage).toMatchObject({
      inputTokens: 1000,
      outputTokens: 70,
      thoughtTokens: 30,
      cachedTokens: 600,
    });
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it.each([
    [429, 'rate_limit_exceeded', 'rate_limited'],
    [500, 'server_error', 'unavailable'],
    [400, 'content_filter', 'blocked'],
    [400, 'ResponsibleAIPolicyViolation', 'blocked'],
    [401, 'invalid_api_key', 'refused'],
    [400, 'invalid_request', 'refused'],
  ])('maps HTTP %i %s to %s without an SDK retry', async (status, code, kind) => {
    const fetch = http(
      { error: { code, message: 'private child text must not appear in our error' } },
      status,
    );
    const result = createGateway(fetch).generate(request());
    await expect(result).rejects.toMatchObject({ kind });
    await expect(result).rejects.not.toThrow(/private child/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['content_filter', 'blocked', 'content_filter'],
    ['length', 'invalid_output', 'MAX_TOKENS'],
  ])('maps finish reason %s and retains usage', async (reason, kind, finishReason) => {
    await expect(createGateway(http(completion(reason))).generate(request())).rejects.toMatchObject(
      { kind, finishReason, usage: { inputTokens: 1000 } },
    );
  });

  it('treats a refusal and missing candidates as blocked, malformed JSON as invalid output', async () => {
    await expect(
      createGateway(http(completion('stop', '', 'No'))).generate(request()),
    ).rejects.toMatchObject({ kind: 'blocked' });
    await expect(
      createGateway(http({ choices: [], usage })).generate(request()),
    ).rejects.toMatchObject({ kind: 'blocked' });
    await expect(
      createGateway(http(completion('stop', '{'))).generate(request()),
    ).rejects.toMatchObject({ kind: 'invalid_output' });
  });

  it('rejects a disconnected stream even if the JSON happens to be complete', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => sse([chunk('{"reply":"Hi"}')], false));
    await expect(
      createGateway(fetch).generate(request({ onPartial: () => {} })),
    ).rejects.toMatchObject({ kind: 'invalid_output' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not forward text in a filtered chunk or retry after a partial', async () => {
    const partial = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      sse([chunk('{"reply":"Hi'), chunk('filtered"}', 'content_filter'), { choices: [], usage }]),
    );
    await expect(
      createGateway(fetch).generate(request({ onPartial: partial })),
    ).rejects.toMatchObject({ kind: 'blocked', usage: { inputTokens: 1000 } });
    expect(partial).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('distinguishes caller cancellation from a timeout, aborting the HTTP request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const pending = createGateway(fetch).generate(request({ signal: controller.signal }));
    setTimeout(() => controller.abort(), 15);
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(createGateway(fetch).generate(request({ timeoutMs: 15 }))).rejects.toMatchObject({
      kind: 'timeout',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(
      createGateway(fetch).generate(request({ signal: controller.signal })),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['audio/mp4', 'application/pdf'] as const)(
    'refuses unsupported %s before HTTP',
    async (mimeType) => {
      const fetch = http();
      await expect(
        createGateway(fetch).generate(
          request({
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: 'YQ==' } }] }],
          }),
        ),
      ).rejects.toMatchObject({ kind: 'refused' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
