// requires live verification in Claude Code session (only HTTP is faked).
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadConfig } from '../../config.js';
import { buddyPrompt } from '../../modules/buddy/prompts.js';
import { turnDecisionSchema } from '../../modules/buddy/registry.js';
import { replyProgress } from '../../modules/buddy/stream.js';
import { registerLearning } from '../../modules/learning/register.js';
import { setSchemaForModel } from '../../modules/practice/setProfiles.js';
import { StudyExtraction } from '../../modules/materials/sources.js';
import { DEMO_WORKSHEET } from '../../testing/scenarios/core-loop.js';
import { strictSchema, assertStrictSchema } from '../chat-schema.js';
import { OpenAIGateway, OPENAI_PROFILE } from '../openai.js';
import { toJsonSchema } from '../json-schema.js';
import { request, usage, completion, http, sse, chunk } from './chat-fixtures.js';

registerLearning();
const config = loadConfig({
  DATABASE_URL: 'postgres://postgres@127.0.0.1:54316/postgres',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'openai',
  OPENAI_API_KEY: 'not-a-real-key',
});
const answer = {
  lookups: [],
  concern: false,
  also_asked: false,
  actions: [],
  reply: 'Hallo',
  options: null,
  asks_permission: false,
};
const turn = () =>
  request({
    purpose: 'buddy_turn',
    schema: buddyPrompt().turnStepSchema,
    maxOutputTokens: 2048,
    thinking: 'minimal',
  });

describe('direct strict decisions (#893)', () => {
  it('avoids the measured HTTP 400 for function tools with reasoning on the real Buddy schema', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      // EU receipt 23.10.2026: tools + low reasoning is rejected before inference.
      return body.tools && body.reasoning_effort !== 'none'
        ? Response.json(
            {
              error: {
                type: 'invalid_request_error',
                param: 'reasoning_effort',
                code: null,
                message:
                  "Function tools with reasoning_effort are not supported for gpt-5.4-mini in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
              },
            },
            { status: 400 },
          )
        : Response.json(completion('stop', JSON.stringify(answer)));
    });
    const result = await new OpenAIGateway(config, fetch).generate(turn());
    const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(body).toMatchObject({
      reasoning_effort: 'low',
      store: false,
      prompt_cache_retention: 'in_memory',
      response_format: {
        type: 'json_schema',
        json_schema: { strict: true, schema: strictSchema(turn().schema) },
      },
    });
    expect(body).not.toHaveProperty('tools');
    expect(turnDecisionSchema().safeParse(result.json).success).toBe(true);
    expect(result.attempts).toBe(1);
  });

  it('streams the real turn incrementally without function assembly', async () => {
    const raw = JSON.stringify(answer),
      cut = raw.indexOf('Hallo') + 2;
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      sse([chunk(raw.slice(0, cut)), chunk(raw.slice(cut), 'stop'), { choices: [], usage }]),
    );
    const partials: string[] = [];
    const result = await new OpenAIGateway(config, fetch).generate({
      ...turn(),
      onPartial: (s) => partials.push(s),
    });
    expect(replyProgress(partials[0]!, new Set())).toMatchObject({
      text: 'Ha',
      done: false,
      speakable: true,
    });
    expect(result.json).toEqual(answer);
  });

  it.each([
    [
      'explain',
      setSchemaForModel('practice', null),
      { usable: true, title: 'Brüche', subject: null, items: [] },
    ],
    [
      'extraction',
      StudyExtraction,
      { ...DEMO_WORKSHEET, source: 'sheet', marked: [], other_subject: null },
    ],
  ] as const)(
    'sends the whole real %s schema in one strict request',
    async (purpose, contract, value) => {
      const json = contract.parse(value),
        schema = toJsonSchema(contract);
      const fetch = http(completion('stop', JSON.stringify(json)));
      expect(() =>
        assertStrictSchema(strictSchema(schema), OPENAI_PROFILE.structuredOutput),
      ).not.toThrow();
      const result = await new OpenAIGateway(config, fetch).generate(
        request({ purpose, schema, validateOutput: (v) => contract.safeParse(v).success }),
      );
      expect(result.json).toEqual(json);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).response_format).toEqual({
        type: 'json_schema',
        json_schema: { name: 'learnbuddy', strict: true, schema: strictSchema(schema) },
      });
    },
  );

  it('keeps domain validation but never spends another request on JSON repair', async () => {
    const contract = z.object({ value: z.number().int().min(2) });
    const fetch = http(completion('stop', '{"value":1}'));
    await expect(
      new OpenAIGateway(config, fetch).generate(
        request({
          purpose: 'explain',
          schema: toJsonSchema(contract),
          validateOutput: (v) => contract.safeParse(v).success,
          maxOutputTokens: 1000,
        }),
      ),
    ).rejects.toMatchObject({ kind: 'invalid_output', attempts: 1, usage: { inputTokens: 1000 } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps HTTP request rejection distinct from safety refusal in diagnostics', async () => {
    await expect(
      new OpenAIGateway(
        config,
        http({ error: { code: null, param: 'reasoning_effort' } }, 400),
      ).generate(request()),
    ).rejects.toMatchObject({
      kind: 'refused',
      finishReason: 'HTTP_400',
      message: 'provider rejected request (400)',
    });
  });

  it('sends inline PDFs as file content, preserving accompanying text and images', async () => {
    const fetch = http();
    await new OpenAIGateway(config, fetch).generate(
      request({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Read this worksheet' },
              { inlineData: { mimeType: 'application/pdf', data: 'JVBERi0=' } },
              { inlineData: { mimeType: 'image/jpeg', data: 'YQ==' } },
            ],
          },
        ],
      }),
    );
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).messages[1].content).toEqual([
      { type: 'text', text: 'Read this worksheet' },
      {
        type: 'file',
        file: { filename: 'material.pdf', file_data: 'data:application/pdf;base64,JVBERi0=' },
      },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YQ==', detail: 'high' } },
    ]);
  });

  it('marks missing receipts as unknown cost', async () => {
    await expect(
      new OpenAIGateway(config, http({ ...completion(), usage: undefined })).generate(request()),
    ).rejects.toMatchObject({ finishReason: 'missing_usage', usage: null, attempts: 1 });
  });
});
