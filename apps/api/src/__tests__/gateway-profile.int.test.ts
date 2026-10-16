// Another gateway plugs in through its profile, without a call site changing (issue #646): a
// model that cannot hear gets no recording — the call is refused before it is sent, recorded, and
// costs her nothing — and a provider that serves larger schemas gets the whole schema of a run,
// with no choosing call before it. Only the model is scripted.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callModel } from '../llm/call.js';
import { LlmError } from '../llm/gateway.js';
import { schemaProperties } from '../llm/schemaBudget.js';
import { VERTEX_PROFILE } from '../llm/vertex.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('a gateway with another profile (#646)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-15T08:00:00Z' });
    lena = await onboard(env, { name: 'Lena' });
  });
  afterEach(() => env.closeChecked());

  it('refuses a recording a model cannot hear before it is sent, and gives her allowance back', async () => {
    env.llm.profile = { ...VERTEX_PROFILE, name: 'deaf', media: new Set(['image', 'pdf']) };
    const err = await callModel(env.deps, lena.learnerId, '2026-10-15', {
      purpose: 'transcribe',
      tier: 'fast',
      promptVersion: 'test',
      system: 'Write down what she said.',
      contents: [
        { role: 'user', parts: [{ inlineData: { mimeType: 'audio/mp4', data: 'AAAA' } }] },
      ],
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      maxOutputTokens: 100,
      temperature: 0,
      timeoutMs: 5_000,
      thinking: 'off',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).kind).toBe('refused');
    expect((err as LlmError).message).toBe('deaf does not read audio');
    expect(env.llm.calls).toEqual([]);
    const row = await env.db.one<{ outcome: string; error_code: string }>(
      `select outcome, error_code from llm_calls where learner_id = $1`,
      [lena.learnerId],
    );
    expect(row).toEqual({ outcome: 'error', error_code: 'refused' });
    const used = await env.db.maybeOne<{ calls: number }>(
      `select calls from usage_daily where learner_id = $1 and kind = 'transcribe'`,
      [lena.learnerId],
    );
    expect(used?.calls ?? 0).toBe(0);
  });

  // A request over what the provider takes inline is a certain error there (#688, KI-Audit K17):
  // refused here, recorded, never sent, and her allowance given back.
  it('refuses a request whose inline media exceed what the gateway takes, before it is sent', async () => {
    env.llm.profile = { ...VERTEX_PROFILE, name: 'narrow', maxInlineBytes: 16 };
    const err = await callModel(env.deps, lena.learnerId, '2026-10-15', {
      purpose: 'extraction',
      tier: 'smart',
      promptVersion: 'test',
      system: 'Read the sheet.',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Photo 1 of 2:' },
            { inlineData: { mimeType: 'image/jpeg', data: 'A'.repeat(12) } },
            { text: 'Photo 2 of 2:' },
            { inlineData: { mimeType: 'application/pdf', data: 'B'.repeat(8) } },
          ],
        },
      ],
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      maxOutputTokens: 100,
      temperature: 0,
      timeoutMs: 5_000,
      thinking: 'off',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).kind).toBe('refused');
    expect((err as LlmError).message).toBe('narrow takes 16 bytes inline, this request carries 20');
    expect(env.llm.calls).toEqual([]);
    const used = await env.db.maybeOne<{ calls: number }>(
      `select calls from usage_daily where learner_id = $1 and kind = 'extraction'`,
      [lena.learnerId],
    );
    expect(used?.calls ?? 0).toBe(0);
  });

  it('sends the whole schema of a run to a provider that serves it, with no choice first', async () => {
    env.llm.profile = {
      ...VERTEX_PROFILE,
      name: 'roomy',
      structuredOutput: { ...VERTEX_PROFILE.structuredOutput, maxSchemaProperties: 100_000 },
    };
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Brüche',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          {
            kind: 'short',
            prompt: 'Wie heißt die Zahl unter dem Bruchstrich?',
            answer: 'Nenner',
            accepted_answers: [],
            unit: null,
            choices: null,
            correct_choice: null,
            topic: 'Brüche',
            difficulty: 1,
            source_excerpt: null,
          },
        ],
        structured: [],
      },
    });
    const res = await lena.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'test',
      text: 'Brüche',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    expect(env.llm.choices).toEqual([]);
    const [run] = env.llm.callsFor('explain');
    // Past what Vertex serves (#627): on Vertex this run would have gone out narrowed.
    expect(schemaProperties(run!.schema)).toBeGreaterThan(
      VERTEX_PROFILE.structuredOutput.maxSchemaProperties,
    );
  });
});
