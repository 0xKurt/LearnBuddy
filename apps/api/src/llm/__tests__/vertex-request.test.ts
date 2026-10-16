// What actually goes over the wire to Vertex for one call (issue #283).
//
// The Vertex discovery document marks `responseJsonSchema` (and `responseMimeType`) deprecated:
// "Use `response_format` instead". Whether we can follow that is decided by the SDK we send
// through, not by the discovery document — so this test hands our real request (`paramsFor`)
// to the real `@google/genai` client and reads the HTTP body it builds. Only `fetch` is replaced:
// nothing leaves the machine, no credentials are needed (an API-key client builds the same
// Vertex body as the service-account one; only the auth header differs).
//
// Two things are pinned:
// 1. The structured-output part arrives exactly as built: `responseMimeType` and
//    `responseJsonSchema` deep-equal to the zod-derived schema — the SDK's `tJsonSchema` does
//    not rewrite it (checked on the two largest schemas we send).
// 2. A canary for the migration: today the SDK silently DROPS a `responseFormat` field on the
//    generate-content path. The day an SDK upgrade starts sending it, this test fails — that is
//    the moment to re-check issue #283 (docs/architecture.md §Model calls), not before.
//
// requires live verification in Claude Code session (fetch is faked; whether Vertex EU accepts
// `response_format` for gemini-3.6-flash, and with which schema subset, needs a live call)

import { GoogleGenAI } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buddyPrompt } from '../../modules/buddy/prompts.js';
import { registerLearning } from '../../modules/learning/register.js';
import { ExtractionResult } from '../../modules/materials/extract.js';
import type { JsonSchema, LlmRequest } from '../gateway.js';
import { toJsonSchema } from '../json-schema.js';
import { paramsFor } from '../vertex.js';

type Sent = { url: string; body: Record<string, unknown> };

/** The body the SDK would POST, captured; the call itself ends right there. */
async function wireBody(params: Parameters<GoogleGenAI['models']['generateContent']>[0]) {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (url: unknown, init: { body?: unknown } | undefined) => {
    sent.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    throw new Error('captured');
  });
  const client = new GoogleGenAI({ vertexai: true, apiKey: 'not-a-key' });
  await expect(client.models.generateContent(params)).rejects.toThrow();
  expect(sent).toHaveLength(1);
  return sent[0]!;
}

// The turn prompt is built from what the learning domain registers (issue #107).
registerLearning();
const TURN_STEP_SCHEMA = buddyPrompt().turnStepSchema;

const request = (schema: JsonSchema): LlmRequest => ({
  purpose: 'buddy_turn',
  tier: 'smart',
  promptVersion: 'test',
  system: 'SYSTEM',
  contents: [{ role: 'user', parts: [{ text: 'hallo' }] }],
  schema,
  maxOutputTokens: 1000,
  temperature: 0.3,
  timeoutMs: 10_000,
  thinking: 'off',
});

describe('the request Vertex receives (issue #283)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['buddy_turn (lookup round)', TURN_STEP_SCHEMA],
    ['extraction', toJsonSchema(ExtractionResult)],
    ['a small one', toJsonSchema(z.object({ ok: z.boolean().nullable() }))],
  ])('sends the %s schema verbatim as responseJsonSchema', async (_name, schema) => {
    expect(JSON.stringify(schema).length).toBeGreaterThan(20);
    const { url, body } = await wireBody(paramsFor(request(schema), 'gemini-3.6-flash', 5_000));
    expect(url).toContain('/models/gemini-3.6-flash:generateContent');
    const config = body.generationConfig as Record<string, unknown>;
    expect(config.responseMimeType).toBe('application/json');
    // Byte for byte what json-schema.ts derived from zod.
    expect(JSON.stringify(config.responseJsonSchema)).toBe(JSON.stringify(schema));
    expect(config).not.toHaveProperty('responseSchema');
    expect(config).not.toHaveProperty('responseFormat');
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'SYSTEM' }], role: 'user' });
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  // The neutral thinking levels (#646) go out as the budgets the call sites sent before, so the
  // wire is what it was; `minimal` is Gemini 3's own level, never a budget (#626: 512 asked, 885
  // spent).
  it.each([
    ['off', { thinkingBudget: 0 }],
    ['minimal', { thinkingLevel: 'MINIMAL' }],
    ['low', { thinkingBudget: 512 }],
    ['medium', { thinkingBudget: 1024 }],
    ['high', { thinkingBudget: 2048 }],
  ] as const)('sends thinking %s as %j', async (thinking, wire) => {
    const { body } = await wireBody(
      paramsFor({ ...request(TURN_STEP_SCHEMA), thinking }, 'gemini-3.6-flash', 5_000),
    );
    const config = body.generationConfig as Record<string, unknown>;
    expect(config.thinkingConfig).toEqual(wire);
  });

  // 3.8 Flash and Gemini 4 take a level only: no budget (400 INVALID_ARGUMENT), no MINIMAL, and
  // LOW is the least there is. MEDIUM and HIGH thought for minutes on a sheet (#647): all go LOW.
  it.each([
    ['gemini-3.8-flash', 'off', 'LOW'],
    ['gemini-3.8-flash', 'minimal', 'LOW'],
    ['gemini-3.8-flash', 'low', 'LOW'],
    ['gemini-3.8-flash', 'medium', 'LOW'],
    ['gemini-3.8-flash', 'high', 'LOW'],
    ['gemini-4-argon', 'high', 'LOW'],
  ] as const)(
    'sends %s thinking %s as level %s, never a budget',
    async (model, thinking, level) => {
      const { body } = await wireBody(
        paramsFor({ ...request(TURN_STEP_SCHEMA), thinking }, model, 5_000),
      );
      const config = body.generationConfig as Record<string, unknown>;
      expect(config.thinkingConfig).toEqual({ thinkingLevel: level });
    },
  );

  it('canary: the SDK still drops responseFormat — re-check #283 when this fails', async () => {
    const params = paramsFor(request(TURN_STEP_SCHEMA), 'gemini-3.6-flash', 5_000);
    const { body } = await wireBody({
      ...params,
      config: {
        ...params.config,
        // Not in the SDK's GenerateContentConfig type (2.25.0 … 2.27.0): spread in untyped.
        ...({
          responseFormat: [{ text: { mimeType: 'application/json', schema: { type: 'object' } } }],
        } as Record<string, unknown>),
      },
    });
    const config = body.generationConfig as Record<string, unknown>;
    expect(config).not.toHaveProperty('responseFormat');
    expect(JSON.stringify(body)).not.toMatch(/response_?[fF]ormat/);
  });
});
