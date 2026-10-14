// Choosing the forms before the call that writes them (issue #627) through the real API on a real
// Postgres. Vertex refuses a response schema past a measured size (`llm/schemaBudget.ts`). A
// practice run or a sheet reading therefore first asks which forms and figure types it needs,
// then goes out with a schema of only those.
//
//   - the main call's schema stays within the budget and offers only what was chosen; anything the
//     answer holds outside it is not kept (code enforces what the schema shows);
//   - a refused, failed or unreadable choice falls back to plain questions: the run still starts;
//   - the same request twice is one run and one choice; a run that fits asks for no choice;
//   - a main call Vertex refuses ends in model_unavailable, and is not repeated;
//   - a sheet is chosen for once, and read with the narrowed schema.
// requires live verification in Claude Code session (needs a running Postgres; the model is scripted)

import { randomUUID } from 'node:crypto';

import type { MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError, type JsonSchema } from '../llm/gateway.js';
import { schemaProperties, MAX_SCHEMA_PROPERTIES } from '../llm/schemaBudget.js';
import { offered } from '../modules/practice/formChoice.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const FRACTION = { type: 'fraction', shape: 'circle', fractions: [{ parts: 4, filled: 3 }] };
const CLOCK = { type: 'clock', c: [{ h: 7, m: 45 }], h24: false, ask: 'time' };

const item = (prompt: string, answer: string, extra: object = {}) => ({
  kind: 'numeric',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Brüche',
  difficulty: 2,
  source_excerpt: null,
  ...extra,
});

const ORDER = {
  type: 'order',
  prompt: 'Ordne die Brüche der Größe nach, den kleinsten zuerst.',
  elements: ['1/4', '1/2', '3/4'],
  numeric: 'ascending',
  topic: 'Brüche',
  difficulty: 2,
};

const SET = {
  usable: true,
  title: 'Brüche',
  subject: { name: 'Mathe', kind: 'math' },
  items: [
    item('Wie viel ist drei Viertel von 8?', '6', { figure: FRACTION }),
    item('Wie viel ist ein Viertel von 8?', '2'),
    // A figure that was not chosen: the question stays, the figure does not.
    item('Wie spät ist es auf der Uhr?', '7:45', { kind: 'short', figure: CLOCK, topic: 'Uhr' }),
  ],
  // A form that was not chosen: not kept.
  structured: [ORDER],
};

/** The figure types and structured kinds a schema offers. */
const shown = (schema: JsonSchema) => offered(schema);

describe.skipIf(!dbReady)('choosing the forms first (#627)', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-14T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(() => env.closeChecked());

  const start = (kind = 'practice', id = randomUUID()) =>
    l.api.post<SessionView>('/practice/topic', {
      client_request_id: id,
      kind,
      text: 'Brüche addieren, Klasse 6',
    });

  const stored = () =>
    env.db.query<{ prompt: string; figure: { type: string } | null }>(
      `select prompt, figure from items where learner_id = $1 order by prompt`,
      [l.learnerId],
    );

  it('sends only what was chosen, within the budget, and keeps nothing outside it', async () => {
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction'] } });
    env.llm.script('explain', { json: SET });
    const res = await start();
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();

    const [choice] = env.llm.choices;
    expect(env.llm.choices).toHaveLength(1);
    expect(choice?.tier).toBe('fast');
    expect(choice?.thinkingBudget).toBe(0);
    // It is asked with what the main call is asked: the same message.
    const [main] = env.llm.callsFor('explain');
    expect(choice?.contents).toEqual(main?.contents);

    expect(schemaProperties(main!.schema)).toBeLessThanOrEqual(MAX_SCHEMA_PROPERTIES);
    expect(shown(main!.schema)).toEqual({ forms: [], figures: ['fraction'] });

    const rows = await stored();
    expect(rows.map((r) => r.prompt)).toHaveLength(3);
    const figureOf = (p: string) => rows.find((r) => r.prompt.startsWith(p))?.figure ?? null;
    expect(figureOf('Wie viel ist drei')?.type).toBe('fraction');
    expect(figureOf('Wie spät')).toBeNull();
    const structured = await env.db.query(
      `select 1 from items where learner_id = $1 and kind = 'order'`,
      [l.learnerId],
    );
    expect(structured).toHaveLength(0);
  });

  it.each([
    ['refused', { error: new LlmError('refused', 'provider rejected the request (400)') }],
    ['down', { error: new LlmError('unavailable', 'provider down') }],
    ['unreadable', { json: { forms: ['no_such_form'], figures: [] } }],
  ] as const)('starts with plain questions when the choice is %s', async (_name, answer) => {
    env.llm.scriptChoice(answer);
    env.llm.script('explain', { json: SET });
    const res = await start();
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    const [main] = env.llm.callsFor('explain');
    expect(shown(main!.schema)).toEqual({ forms: [], figures: [] });
    expect(JSON.stringify(main!.schema)).not.toContain('"figure"');
    const rows = await stored();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.figure === null)).toBe(true);
  });

  it('ends in model_unavailable when Vertex refuses the main call, and asks once', async () => {
    env.llm.scriptChoice({ json: { forms: [], figures: [] } });
    env.llm.script('explain', {
      error: new LlmError('refused', 'provider rejected the request (400)'),
    });
    const res = await start();
    expect(res.status).toBe(503);
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    expect(env.llm.choices).toHaveLength(1);
    expect(await stored()).toHaveLength(0);
  });

  it('is one run and one choice for the same request twice', async () => {
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction'] } });
    env.llm.script('explain', { json: SET });
    const id = randomUUID();
    const first = await start('practice', id);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    await env.flushBackground();
    const again = await start('practice', id);
    expect(again.body.id).toBe(first.body.id);
    expect(env.llm.choices).toHaveLength(1);
    expect(env.llm.callsFor('explain')).toHaveLength(1);
  });

  it('chooses for a help run too, which offers figures and no forms', async () => {
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction'] } });
    env.llm.script('explain', { json: { ...SET, structured: [] } });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'help',
      text: SET.items.map((i) => i.prompt).join('\n'),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(env.llm.choices).toHaveLength(1);
    const [main] = env.llm.callsFor('explain');
    expect(shown(main!.schema)).toEqual({ forms: [], figures: ['fraction'] });
  });

  it('asks for no choice when the schema fits as it is', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Vokabeln',
        subject: { name: 'Französisch', kind: 'french' },
        items: [
          item('le chat', 'die Katze', {
            kind: 'vocab',
            prompt_lang: 'fr',
            lang: 'de',
            topic: 'Tiere',
          }),
        ],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      text: 'le chat — die Katze',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(env.llm.choices).toHaveLength(0);
  });

  it('chooses once for a sheet and reads it with the narrowed schema', async () => {
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction'] } });
    env.llm.script('extraction', {
      json: {
        is_learning_material: true,
        readable: true,
        pages: [],
        title: 'Brüche',
        subject: { name: 'Mathe', kind: 'math' },
        extracted_text: 'Brüche — Aufgaben 1 bis 3',
        items: SET.items,
        structured: [ORDER],
      },
    });
    env.llm.byDefault('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
    );
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
    await env.flushBackground();

    expect(env.llm.choices.filter((c) => c.purpose === 'extraction')).toHaveLength(1);
    const [reading] = env.llm.callsFor('extraction');
    expect(schemaProperties(reading!.schema)).toBeLessThanOrEqual(MAX_SCHEMA_PROPERTIES);
    expect(shown(reading!.schema).figures).toEqual(['fraction']);
    const rows = await stored();
    expect(rows.find((r) => r.prompt.startsWith('Wie spät'))?.figure ?? null).toBeNull();
    expect(rows.find((r) => r.prompt.startsWith('Wie viel ist drei'))?.figure?.type).toBe(
      'fraction',
    );
  });
});
