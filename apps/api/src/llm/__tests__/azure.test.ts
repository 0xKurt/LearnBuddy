// requires live verification in Claude Code session (only HTTP is faked; no model calls).
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { loadConfig } from '../../config.js';
import { AzureOpenAIGateway } from '../azure.js';
import type { LlmRequest } from '../gateway.js';
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
const request = (overrides: Partial<LlmRequest> = {}): LlmRequest => ({
  purpose: 'tutor',
  tier: 'smart',
  promptVersion: 'test',
  system: 'SYSTEM',
  contents: [{ role: 'user', parts: [{ text: 'Hallo' }] }],
  schema: toJsonSchema(z.object({ reply: z.string() })),
  maxOutputTokens: 100,
  temperature: 0.3,
  timeoutMs: 200,
  thinking: 'off',
  ...overrides,
});
const usage = {
  prompt_tokens: 1000,
  completion_tokens: 100,
  total_tokens: 1100,
  prompt_tokens_details: { cached_tokens: 600 },
  completion_tokens_details: { reasoning_tokens: 30 },
};
const completion = (
  reason = 'stop',
  content = '{"reply":"Hallo"}',
  refusal: string | null = null,
) => ({
  id: 'test',
  object: 'chat.completion',
  created: 0,
  model: 'gpt-5.4-2026-03-05',
  usage,
  choices: [{ index: 0, finish_reason: reason, message: { role: 'assistant', content, refusal } }],
});
function http(body: unknown = completion(), status = 200) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}
function sse(events: unknown[], done = true) {
  const body =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
    (done ? 'data: [DONE]\n\n' : '');
  // Deliberately split inside SSE lines and UTF-8 characters: the SDK must assemble them.
  const bytes = new TextEncoder().encode(body);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
const chunk = (content: string, finish_reason: string | null = null) => ({
  id: 'test',
  object: 'chat.completion.chunk',
  created: 0,
  model: 'gpt-5.4-2026-03-05',
  choices: [{ index: 0, delta: { content }, finish_reason }],
});

describe('Azure HTTP gateway', () => {
  it.each([
    ['gpt-5.4-2026-03-05', 2800],
    ['gpt-5.4-mini-2026-03-17', 700],
    ['unknown-model', 2800],
  ])(
    'prices %s independently of the deployment alias without double billing reasoning',
    async (model, expected) => {
      const fetch = http({ ...completion(), model });
      const result = await new AzureOpenAIGateway(config, fetch).generate(request());
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
    const result = await new AzureOpenAIGateway(config, fetch).generate(
      request({ timeoutMs: 10_000 }),
    );
    expect(result.attempts).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses too many images and oversized schemas before sending them', async () => {
    const fetch = http();
    const gateway = new AzureOpenAIGateway(config, fetch);
    await expect(
      gateway.generate(
        request({
          contents: [
            {
              role: 'user',
              parts: Array.from({ length: 11 }, () => ({
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
              Array.from({ length: 101 }, (_, i) => [String(i), { type: 'string' }]),
            ),
          },
        }),
      ),
    ).rejects.toMatchObject({ kind: 'refused' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends strict JSON, original messages and images to the configured deployment', async () => {
    const fetch = http();
    await new AzureOpenAIGateway(config, fetch).generate(
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
    expect(String(url)).toBe('https://lb-test.openai.azure.com/openai/v1/chat/completions');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'buddy',
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
    await new AzureOpenAIGateway(config, fetch).generate(request({ thinking, tier: 'fast' }));
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toMatchObject({
      model: 'small',
      reasoning_effort: effort,
    });
  });

  it('supports an explicitly configured dated Azure API version', async () => {
    const fetch = http();
    await new AzureOpenAIGateway(
      { ...config, AZURE_OPENAI_API_VERSION: '2025-04-01-preview' },
      fetch,
    ).generate(request());
    expect(String(fetch.mock.calls[0]![0])).toBe(
      'https://lb-test.openai.azure.com/openai/deployments/buddy/chat/completions?api-version=2025-04-01-preview',
    );
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('api-key')).toBe('not-a-real-key');
  });

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
    const result = await new AzureOpenAIGateway(config, fetch).generate(
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
    const result = new AzureOpenAIGateway(config, fetch).generate(request());
    await expect(result).rejects.toMatchObject({ kind });
    await expect(result).rejects.not.toThrow(/private child/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['content_filter', 'blocked', 'content_filter'],
    ['length', 'invalid_output', 'MAX_TOKENS'],
  ])('maps finish reason %s and retains usage', async (reason, kind, finishReason) => {
    await expect(
      new AzureOpenAIGateway(config, http(completion(reason))).generate(request()),
    ).rejects.toMatchObject({ kind, finishReason, usage: { inputTokens: 1000 } });
  });

  it('treats a refusal and missing candidates as blocked, malformed JSON as invalid output', async () => {
    await expect(
      new AzureOpenAIGateway(config, http(completion('stop', '', 'No'))).generate(request()),
    ).rejects.toMatchObject({ kind: 'blocked' });
    await expect(
      new AzureOpenAIGateway(config, http({ choices: [], usage })).generate(request()),
    ).rejects.toMatchObject({ kind: 'blocked' });
    await expect(
      new AzureOpenAIGateway(config, http(completion('stop', '{'))).generate(request()),
    ).rejects.toMatchObject({ kind: 'invalid_output' });
  });

  it('rejects a disconnected stream even if the JSON happens to be complete', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => sse([chunk('{"reply":"Hi"}')], false));
    await expect(
      new AzureOpenAIGateway(config, fetch).generate(request({ onPartial: () => {} })),
    ).rejects.toMatchObject({ kind: 'invalid_output' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not forward text in a filtered chunk or retry after a partial', async () => {
    const partial = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      sse([chunk('{"reply":"Hi'), chunk('filtered"}', 'content_filter'), { choices: [], usage }]),
    );
    await expect(
      new AzureOpenAIGateway(config, fetch).generate(request({ onPartial: partial })),
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
    const pending = new AzureOpenAIGateway(config, fetch).generate(
      request({ signal: controller.signal }),
    );
    setTimeout(() => controller.abort(), 15);
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(
      new AzureOpenAIGateway(config, fetch).generate(request({ timeoutMs: 15 })),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(
      new AzureOpenAIGateway(config, fetch).generate(request({ signal: controller.signal })),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['audio/mp4', 'application/pdf'] as const)(
    'refuses unsupported %s before HTTP',
    async (mimeType) => {
      const fetch = http();
      await expect(
        new AzureOpenAIGateway(config, fetch).generate(
          request({
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: 'YQ==' } }] }],
          }),
        ),
      ).rejects.toMatchObject({ kind: 'refused' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
