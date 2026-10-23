// requires live verification in Claude Code session (only HTTP is faked; no model calls).
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { loadConfig } from '../../config.js';
import { buddyPrompt, turnSchemasFor } from '../../modules/buddy/prompts.js';
import { turnDecisionSchema, toolsFor } from '../../modules/buddy/registry.js';
import { replyProgress } from '../../modules/buddy/stream.js';
import { registerLearning } from '../../modules/learning/register.js';
import { setSchemaForModel } from '../../modules/practice/setProfiles.js';
import { StudyExtraction } from '../../modules/materials/sources.js';
import { DEMO_WORKSHEET } from '../../testing/scenarios/core-loop.js';
import {
  strictSchema,
  assertStrictSchema,
  restoreStrictJson,
  schemaObject,
} from '../chat-schema.js';
import { OpenAIGateway } from '../openai.js';
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
const respond = {
  lookups: [],
  concern: false,
  also_asked: false,
  reply: 'Hallo',
  options: null,
  asks_permission: false,
};
const toolCall = (name: string, args: unknown, id = 'call_1') => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});
const toolResponse = (name: string, args: unknown, id?: string) => ({
  ...completion('tool_calls'),
  choices: [
    {
      index: 0,
      finish_reason: 'tool_calls',
      message: { role: 'assistant', content: null, tool_calls: [toolCall(name, args, id)] },
    },
  ],
});
const turn = () =>
  request({ purpose: 'buddy_turn', schema: buddyPrompt().turnStepSchema, maxOutputTokens: 2048 });

describe('direct gateway decisions', () => {
  it('offers exactly the real act functions plus respond, all strict, without a large response_format', async () => {
    const fetch = http(toolResponse('respond', respond));
    const result = await new OpenAIGateway(config, fetch).generate(turn());
    const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(body.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual([
      ...toolsFor('turn'),
      'respond',
    ]);
    expect(body).toMatchObject({
      tool_choice: 'required',
      parallel_tool_calls: false,
      store: false,
      prompt_cache_retention: 'in_memory',
    });
    expect(body).not.toHaveProperty('response_format');
    for (const tool of body.tools) {
      expect(tool.function.strict).toBe(true);
      expect(() =>
        assertStrictSchema(tool.function.parameters, { properties: 100, depth: 5 }),
      ).not.toThrow();
    }
    expect(result.json).toEqual({ ...respond, actions: [] });
    expect(turnDecisionSchema().safeParse(result.json).success).toBe(true);
  });

  it('stages ordered acts, restores optional nulls, and sums all rounds without double billing reasoning', async () => {
    const fetch = http(toolResponse('respond', respond));
    fetch
      .mockResolvedValueOnce(Response.json(toolResponse('open_area', { area: 'library' })))
      .mockResolvedValueOnce(
        Response.json(toolResponse('open_area', { area: 'practice' }, 'call_2')),
      );
    const result = await new OpenAIGateway(config, fetch).generate(turn());
    const parsed = turnDecisionSchema().parse(result.json);
    expect(parsed.actions).toEqual([
      { tool: 'open_area', args: { area: 'library' } },
      { tool: 'open_area', args: { area: 'practice' } },
    ]);
    expect(result).toMatchObject({
      attempts: 3,
      usage: {
        costMicros: 3960,
        inputTokens: 3000,
        outputTokens: 210,
        thoughtTokens: 90,
        cachedTokens: 1800,
      },
    });
    const second = JSON.parse(String(fetch.mock.calls[1]![1]?.body));
    expect(second.messages.at(-1)).toMatchObject({
      role: 'tool',
      content: '{"status":"staged","applied":false}',
    });
    expect(second.max_completion_tokens).toBe(1948);
  });

  it('respects a narrowed offered-tool schema and rejects unknown, unavailable and malformed functions', async () => {
    for (const response of [
      toolResponse('forget', {}),
      toolResponse('unknown', {}),
      toolResponse('open_area', { area: 'bogus' }),
      toolResponse('respond', { ...respond, concern: 'false' }),
    ]) {
      const fetch = http(response);
      await expect(
        new OpenAIGateway(config, fetch).generate({
          ...turn(),
          schema: turnSchemasFor(['open_area']).step,
        }),
      ).rejects.toMatchObject({ kind: 'invalid_output' });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects missing respond, parallel calls and an interrupted function stream', async () => {
    const multi = toolResponse('respond', respond);
    multi.choices[0]!.message.tool_calls.push(toolCall('open_area', { area: 'library' }));
    for (const response of [completion(), multi]) {
      await expect(
        new OpenAIGateway(config, http(response)).generate(turn()),
      ).rejects.toMatchObject({ kind: 'invalid_output' });
    }
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      sse(
        [
          {
            ...chunk(''),
            choices: [
              {
                index: 0,
                delta: { tool_calls: [{ index: 0, ...toolCall('respond', respond) }] },
                finish_reason: null,
              },
            ],
          },
        ],
        false,
      ),
    );
    await expect(
      new OpenAIGateway(config, fetch).generate({ ...turn(), onPartial: () => {} }),
    ).rejects.toMatchObject({ kind: 'invalid_output' });
  });

  it('stops at six acts plus respond, forcing the final call and retaining usage on failure', async () => {
    const fetch = http(toolResponse('open_area', { area: 'library' }));
    await expect(new OpenAIGateway(config, fetch).generate(turn())).rejects.toMatchObject({
      kind: 'invalid_output',
      attempts: 7,
      usage: { inputTokens: 7000, costMicros: 9240 },
    });
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(JSON.parse(String(fetch.mock.calls[6]![1]?.body)).tool_choice).toEqual({
      type: 'function',
      function: { name: 'respond' },
    });
  });

  it('marks missing receipts as unknown cost, including after a paid staged act', async () => {
    const missing = { ...toolResponse('respond', respond), usage: undefined };
    const fetch = http(missing);
    fetch.mockResolvedValueOnce(Response.json(toolResponse('open_area', { area: 'library' })));
    await expect(new OpenAIGateway(config, fetch).generate(turn())).rejects.toMatchObject({
      kind: 'invalid_output',
      finishReason: 'missing_usage',
      attempts: 2,
      usage: { inputTokens: 1000, costMicros: 1320 },
    });
    await expect(new OpenAIGateway(config, http(missing)).generate(turn())).rejects.toMatchObject({
      finishReason: 'missing_usage',
      usage: null,
    });
  });

  it('reassembles fragmented function arguments as safe cumulative turn JSON', async () => {
    const raw = JSON.stringify(respond);
    const cut = raw.indexOf('Hallo') + 2;
    const events = [
      {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call',
                  function: { name: 'respond', arguments: raw.slice(0, cut) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, function: { arguments: raw.slice(cut) } }] },
            finish_reason: 'tool_calls',
          },
        ],
      },
      { choices: [], usage },
    ];
    const partials: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async () => sse(events));
    const result = await new OpenAIGateway(config, fetch).generate({
      ...turn(),
      onPartial: (raw) => partials.push(raw),
    });
    expect(replyProgress(partials[0]!, new Set())).toMatchObject({
      text: 'Ha',
      done: false,
      speakable: true,
    });
    expect(replyProgress(partials[1]!, new Set())).toMatchObject({ text: 'Hallo', done: true });
    expect(result.json).toEqual({ ...respond, actions: [] });
    expect(result.usage.inputTokens).toBe(1000);
  });

  it.each(['gpt-4.1-mini', 'gpt-4.1-nano'] as const)(
    'omits reasoning effort for %s and uses its own regional price',
    async (model) => {
      const fetch = http({ ...completion(), model: `${model}-2025-04-14` });
      const result = await new OpenAIGateway(
        { ...config, OPENAI_MODEL_FAST: model },
        fetch,
      ).generate(request({ tier: 'fast', thinking: 'high' }));
      const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
      expect(body).not.toHaveProperty('reasoning_effort');
      expect(body.temperature).toBe(0.3);
      expect(result.usage.costMicros).toBe(model === 'gpt-4.1-mini' ? 560 : 140);
    },
  );
});

describe('deep JSON contracts', () => {
  const contract = z.object({
    rows: z.array(
      z.object({ child: z.object({ nested: z.object({ value: z.number().int().min(2) }) }) }),
    ),
  });
  const good = { rows: [{ child: { nested: { value: 2 } } }] };
  const deep = () =>
    request({
      purpose: 'explain',
      schema: toJsonSchema(contract),
      validateOutput: (json) => contract.safeParse(json).success,
      maxOutputTokens: 1000,
    });

  it('repairs once using the exact Zod bounds, buffering streaming until validation', async () => {
    const partials: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>();
    fetch
      .mockResolvedValueOnce(
        sse([
          chunk(JSON.stringify({ rows: [{ child: { nested: { value: 1 } } }] }), 'stop'),
          { choices: [], usage },
        ]),
      )
      .mockResolvedValueOnce(sse([chunk(JSON.stringify(good), 'stop'), { choices: [], usage }]));
    const result = await new OpenAIGateway(config, fetch).generate({
      ...deep(),
      onPartial: (raw) => partials.push(raw),
    });
    expect(result.json).toEqual(good);
    expect(partials).toEqual([JSON.stringify(good)]);
    expect(result).toMatchObject({ attempts: 2, usage: { costMicros: 2640 } });
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('does not publish malformed data after the repair, lose costs or repair a refusal', async () => {
    const fetch = http(completion('stop', '{}'));
    // Non-stream request to isolate the repair limit.
    await expect(new OpenAIGateway(config, fetch).generate(deep())).rejects.toMatchObject({
      kind: 'invalid_output',
      attempts: 2,
      usage: { inputTokens: 2000 },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const refused = http(completion('stop', '', 'held back'));
    await expect(new OpenAIGateway(config, refused).generate(deep())).rejects.toMatchObject({
      kind: 'blocked',
      attempts: 1,
    });
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('requires a domain validator and shares the token budget between repair rounds', async () => {
    const fetch = http(completion('stop', '{}'));
    await expect(
      new OpenAIGateway(config, fetch).generate({ ...deep(), validateOutput: undefined }),
    ).rejects.toMatchObject({ kind: 'refused' });
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      new OpenAIGateway(config, fetch).generate({ ...deep(), maxOutputTokens: 100 }),
    ).rejects.toMatchObject({ kind: 'invalid_output', finishReason: 'MAX_TOKENS', attempts: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the real explain/extraction contracts and nested practice data intact', async () => {
    const generated = setSchemaForModel('practice', null).parse({
      usable: true,
      title: 'Brüche',
      subject: null,
      items: [],
    });
    const study = StudyExtraction.parse({
      ...DEMO_WORKSHEET,
      source: 'sheet',
      marked: [],
      other_subject: null,
    });
    for (const [purpose, schema, json] of [
      ['explain', setSchemaForModel('practice', null), generated],
      ['extraction', StudyExtraction, study],
    ] as const) {
      const fetch = http(completion('stop', JSON.stringify(json)));
      const result = await new OpenAIGateway(config, fetch).generate(
        request({
          purpose,
          schema: toJsonSchema(schema),
          validateOutput: (value) => schema.safeParse(value).success,
          maxOutputTokens: 1000,
        }),
      );
      expect(schema.safeParse(result.json).success).toBe(true);
    }
  });
});

it('checks the actual turn budget and round-trips optional versus explicit nulls', () => {
  const schema = buddyPrompt().turnStepSchema;
  const strict = strictSchema(schema);
  expect(() => assertStrictSchema(strict, { properties: 5000, depth: 10 })).not.toThrow();
  expect(schemaObject(strict.properties)).toBe(true);
  expect(
    restoreStrictJson(
      toJsonSchema(z.object({ optional: z.number().optional(), explicit: z.number().nullable() })),
      { optional: null, explicit: null },
    ),
  ).toEqual({ explicit: null });
});
