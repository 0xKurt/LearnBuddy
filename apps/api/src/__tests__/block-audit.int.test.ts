// The STATE measurement (issue #168) measures the request, it does not join it.
//
// A measurement that changes the prompt is worthless: the prompt version would move, the
// prefix cache would reset, and every number afterwards would be about the instrumentation.
// So this runs the same turn twice through the real pipeline — once with no audit registered,
// once with one — and compares what the gateway was handed, serialized: system prompt,
// response schema, every content part, every parameter. Byte for byte, or the measurement is
// measuring itself.
//
// requires live verification in Claude Code session (needs a running Postgres; model scripted)

import { afterEach, describe, expect, it } from 'vitest';

import { setStateAudit, type StateSample } from '../modules/buddy/blocks.js';
import { testDatabaseAvailable } from '../testing/database.js';
import type { LlmRequest } from '../llm/gateway.js';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const ids = {
  first: '00000000-0000-4000-8000-0000000b0001',
  second: '00000000-0000-4000-8000-0000000b0002',
};

/** A turn that leaves state behind (a test with a day, something to remember). */
const FIRST = {
  reply: 'Alles klar, dann üben wir bis Freitag.',
  options: null,
  concern: false,
  also_asked: false,
  asks_permission: false,
  actions: [
    {
      tool: 'plan_exam',
      args: {
        title: 'Mathearbeit Brüche',
        subject: 'Mathe',
        subject_kind: 'math',
        day: { kind: 'weekday', weekday: 5, weeks_ahead: 0 },
        topics: ['Brüche'],
        quote: 'am Freitag eine Mathearbeit über Brüche',
      },
    },
    {
      tool: 'remember',
      args: {
        kind: 'fact',
        about: 'learning',
        statement: 'Geht in die 7. Klasse',
        quote: 'in der 7. Klasse',
        until: { kind: 'unknown' },
      },
    },
  ],
};

const SECOND = {
  reply: 'Klar — sag Bescheid, wenn du anfangen willst.',
  options: null,
  concern: false,
  also_asked: false,
  asks_permission: false,
  actions: [],
};

/** Everything the provider is handed, in the order it is handed over (vertex.ts `params`). */
function sent(req: LlmRequest): string {
  return JSON.stringify({
    purpose: req.purpose,
    tier: req.tier,
    promptVersion: req.promptVersion,
    system: req.system,
    contents: req.contents,
    schema: req.schema,
    maxOutputTokens: req.maxOutputTokens,
    temperature: req.temperature,
    thinkingBudget: req.thinkingBudget,
  });
}

/** One learner, two turns, the request of the second one — the one with state behind it. */
async function measuredTurn(): Promise<{ env: TestEnv; request: string }> {
  const env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
  const learner = await onboard(env, { relation: 'child', name: 'Lina', birthDate: '2014-03-10' });
  env.llm.script('buddy_turn', { json: FIRST }, { json: SECOND });
  await learner.api.post('/buddy/messages', {
    client_message_id: ids.first,
    text: 'Ich bin in der 7. Klasse und schreibe am Freitag eine Mathearbeit über Brüche.',
  });
  await learner.api.post('/buddy/messages', {
    client_message_id: ids.second,
    text: 'Und wie fange ich am besten an?',
  });
  const calls = env.llm.callsFor('buddy_turn');
  expect(calls).toHaveLength(2);
  return { env, request: sent(calls[1]!) };
}

describe.skipIf(!dbReady)('the STATE measurement does not change the request', () => {
  afterEach(() => setStateAudit(null));

  it('sends the same bytes with the audit registered and without it', async () => {
    const plain = await measuredTurn();
    const plainRequest = plain.request;
    await plain.env.close();

    const samples: StateSample[] = [];
    setStateAudit((s) => samples.push(s));
    const audited = await measuredTurn();
    const auditedRequest = audited.request;
    await audited.env.close();

    expect(auditedRequest).toBe(plainRequest);
    // And the audit really saw something: both turns, with the sections of a real state.
    expect(samples.length).toBeGreaterThanOrEqual(2);
    const last = samples.at(-1)!.blocks;
    expect(last.map((b) => b.name)).toContain('goals');
    expect(last.every((b) => b.chars > 0)).toBe(true);
    // Its own state block, reassembled, is exactly what the request carried.
    expect(auditedRequest).toContain(
      JSON.stringify(last.map((b) => b.text).join('\n\n')).slice(1, -1),
    );
  });
});
