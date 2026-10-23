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

import { DAILY_LIMITS } from '../config.js';
import { LlmError, type JsonSchema } from '../llm/gateway.js';
import { schemaProperties, MAX_SCHEMA_PROPERTIES } from '../llm/schemaBudget.js';
import { chosenFor, offered } from '../modules/practice/formChoice.js';
import { FIRST_BATCH, REST_WINDOW_MS } from '../modules/practice/generate.js';
import { explainSchemaFor } from '../modules/practice/setProfiles.js';
import { sheetReader } from '../modules/materials/reader.js';
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
    // A figure that was not chosen: the question was written to be read off it, so it goes.
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
    expect(choice?.thinking).toBe('off');
    // It is asked with what the main call is asked: the same message.
    const [main] = env.llm.callsFor('explain');
    expect(choice?.contents).toEqual(main?.contents);

    expect(schemaProperties(main!.schema)).toBeLessThanOrEqual(MAX_SCHEMA_PROPERTIES);
    expect(shown(main!.schema)).toEqual({ forms: [], figures: ['fraction'] });

    // The main call is told what it can use, and only that (#627).
    expect(main?.system).toContain('IN THIS ANSWER ONLY THESE CAN BE USED');
    expect(main?.system).toContain('figures — fraction; task forms besides plain questions — none');
    expect(choice?.system).not.toContain('IN THIS ANSWER');

    const rows = await stored();
    expect(rows.map((r) => r.prompt).sort()).toEqual([
      'Wie viel ist drei Viertel von 8?',
      'Wie viel ist ein Viertel von 8?',
    ]);
    expect(rows.find((r) => r.prompt.startsWith('Wie viel ist drei'))?.figure?.type).toBe(
      'fraction',
    );
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
    expect(main?.system).toContain('NO FIGURE CAN BE DRAWN');
    expect(main?.system).toContain('answerable from its text alone');
    // A question written with a figure anyway leans on a drawing she would not see: it goes, and
    // only the plain question survives.
    const rows = await stored();
    expect(rows.map((r) => r.prompt)).toEqual(['Wie viel ist ein Viertel von 8?']);
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

  it('counts a run once against her daily limit: the choice is metered with it', async () => {
    const day = '2026-10-14';
    await env.db.query(
      `insert into usage_daily (learner_id, day, kind, calls) values ($1, $2, 'explain', $3)`,
      [l.learnerId, day, DAILY_LIMITS.explain - 1],
    );
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction'] } });
    env.llm.script('explain', { json: SET });
    const last = await start();
    expect(last.status, JSON.stringify(last.body)).toBe(201);
    await env.flushBackground();
    const used = async () =>
      (
        await env.db.one<{ calls: number }>(
          `select calls from usage_daily where learner_id = $1 and day = $2 and kind = 'explain'`,
          [l.learnerId, day],
        )
      ).calls;
    // The last run of the day ran whole: its choice took nothing of the limit.
    expect(await used()).toBe(DAILY_LIMITS.explain);
    const forms = await env.db.query(
      `select 1 from llm_calls where learner_id = $1 and purpose = 'forms'`,
      [l.learnerId],
    );
    expect(forms).toHaveLength(1);
    // Once the limit is used up, nothing is asked: no choice without the run it belongs to.
    const over = await start();
    expect(over.status).toBe(429);
    expect(env.llm.choices).toHaveLength(1);
    expect(await used()).toBe(DAILY_LIMITS.explain);
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

    expect(env.llm.choices.filter((c) => chosenFor(c) === 'extraction')).toHaveLength(1);
    const [reading] = env.llm.callsFor('extraction');
    expect(schemaProperties(reading!.schema)).toBeLessThanOrEqual(MAX_SCHEMA_PROPERTIES);
    expect(shown(reading!.schema).figures).toEqual(['fraction']);
    const rows = await stored();
    expect(rows.some((r) => r.prompt.startsWith('Wie spät'))).toBe(false);
    expect(reading?.system).toContain('figures — fraction');
    // Both calls still see the same photo; neither pays for rules it cannot use (#869).
    const choice = env.llm.choices.find((c) => chosenFor(c) === 'extraction')!;
    expect(choice.contents).toEqual(reading!.contents);
    expect(choice.contents[0]!.parts.some((p) => 'inlineData' in p)).toBe(true);
    expect(choice.system.length).toBeLessThan(4_000);
    expect(reading!.system.length).toBeLessThan(22_000);
    expect(reading!.system).not.toContain('A map (stumme Karte)');
    expect(reading!.system).not.toContain('Reading texts ("reading")');
    expect(reading!.system).toContain('SOURCE —');
    expect(rows.find((r) => r.prompt.startsWith('Wie viel ist drei'))?.figure?.type).toBe(
      'fraction',
    );
  });

  // ---------------------------------------------------------------- #664, #665 (audit F10, F11)

  const READING = {
    is_learning_material: true,
    readable: true,
    pages: [],
    title: 'Brüche',
    subject: { name: 'Mathe', kind: 'math' },
    extracted_text: 'Brüche — Aufgaben 1 bis 3',
    items: SET.items,
    structured: [],
    more_items: false,
  };

  it.each([false, true])(
    'keeps a narrowed prompt for lean and continued readings (homework=%s)',
    async (homework) => {
      env.llm.scriptChoice({ json: { forms: ['cloze'], figures: [] } });
      env.llm.byDefault('extraction', { json: READING });
      const { read } = await sheetReader(env.deps, l.learnerId, {
        homework,
        parts: [{ text: 'Page 1' }, { inlineData: { mimeType: 'image/jpeg', data: 'AA==' } }],
        now: env.deps.now(),
      });
      await read(false, '');
      await read(true, 'Read the remaining tasks.');
      expect(env.llm.choices).toHaveLength(1);
      expect(env.llm.choices[0]!.system.length).toBeLessThan(4_000);
      const calls = env.llm.callsFor('extraction');
      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call.system.length).toBeLessThan(22_000);
        expect(call.system).toContain('type "cloze"');
        expect(call.system).not.toContain('type "match"');
        expect(call.system).not.toContain('Figures: add');
        expect(call.system.includes('SOURCE —')).toBe(!homework);
      }
      expect(calls[1]!.system).toContain('KEEP IT SHORT');
      expect(calls[1]!.system).toContain('Read the remaining tasks.');
      expect(calls[1]!.contents).toEqual(calls[0]!.contents);
    },
  );

  /** Her sheet, photographed and read; returns the sheet as the app shows it. */
  async function readSheet(): Promise<MaterialView> {
    env.llm.byDefault('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
    );
    for (const u of created.body.uploads) env.storage.put(u.path);
    expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const view = await l.api.get<{ material: MaterialView }>(
      `/materials/${created.body.material.id}/items`,
    );
    return view.body.material;
  }

  it('says a sheet is not read completely when a task was dropped for a figure not chosen (#664)', async () => {
    // The Zweitaudit probe: a schema-valid figure of a form that was not chosen. Two plain
    // tasks and the fraction one stay, the clock task goes — and the sheet must say so.
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction'] } });
    env.llm.script('extraction', { json: READING });
    const sheet = await readSheet();
    expect(sheet.status).toBe('ready');
    expect((await stored()).some((r) => r.prompt.startsWith('Wie spät'))).toBe(false);
    expect(sheet.items_incomplete).toBe(true);
  });

  it('a sheet read without any choice is never complete, though nothing was dropped (#664)', async () => {
    env.llm.scriptChoice({ error: new LlmError('unavailable', 'provider down') });
    env.llm.script('extraction', {
      json: { ...READING, items: [item('Wie viel ist ein Viertel von 8?', '2')] },
    });
    const sheet = await readSheet();
    expect(sheet.status).toBe('ready');
    expect(sheet.items_incomplete).toBe(true);
    const [reading] = env.llm.callsFor('extraction');
    expect(reading!.system).toContain('NO FIGURE CAN BE DRAWN');
    expect(reading!.system).not.toContain('Figures: add');
    expect(reading!.system).not.toContain('type "cloze"');
  });

  it('a sheet whose every task fits the choice stays complete (#664)', async () => {
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction', 'clock'] } });
    env.llm.script('extraction', { json: READING });
    const sheet = await readSheet();
    expect(sheet.items_incomplete).toBe(false);
  });

  it('a continuation that brings nothing new does not make the sheet complete (#664)', async () => {
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction', 'clock'] } });
    // The first reading says there is more; the next one repeats itself and still says more.
    env.llm.script('extraction', { json: { ...READING, more_items: true } });
    env.llm.script('extraction', { json: { ...READING, more_items: false } });
    const sheet = await readSheet();
    expect(env.llm.callsFor('extraction')).toHaveLength(2);
    expect(sheet.items_incomplete).toBe(true);
  });

  it('keeps "more is coming" for the whole budget of the call, counted from its start (#665)', async () => {
    // The Zweitaudit probe: the choice takes 15 s, the first questions stand 12 s into the main
    // call. At 27 s the main call may still write for 13 s, so the run is still preparing.
    let release = () => undefined as void;
    const until = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    try {
      env.llm.scriptChoice(async () => {
        env.clock.advance(15_000);
        return { forms: [], figures: ['fraction', 'clock'] };
      });
      const many = Array.from({ length: 6 }, (_, i) => item(`Frage ${i + 1}`, `${i + 1}`));
      env.llm.script('explain', {
        json: { ...SET, items: many, structured: [] },
        pauseAfter: { key: 'items', n: FIRST_BATCH, until },
      });
      const started = await start();
      expect(started.status, JSON.stringify(started.body)).toBe(201);
      expect(started.body.preparing).toBe(true);
      env.clock.advance(12_000); // 27 s after the start
      const at27 = await l.api.get<SessionView>(`/practice/sessions/${started.body.id}`);
      expect(at27.body.preparing).toBe(true);
      // Past the main call's own budget it stops waiting, as before.
      env.clock.advance(REST_WINDOW_MS - 12_000 + 1_000);
      const after = await l.api.get<SessionView>(`/practice/sessions/${started.body.id}`);
      expect(after.body.preparing).toBe(false);
    } finally {
      release();
      await env.flushBackground();
    }
  });

  it('with one run left, twenty starts at once make at most one choice and one run (#665)', async () => {
    const day = '2026-10-14';
    await env.db.query(
      `insert into usage_daily (learner_id, day, kind, calls) values ($1, $2, 'explain', $3)`,
      [l.learnerId, day, DAILY_LIMITS.explain - 1],
    );
    env.llm.byDefault('explain', { json: SET });
    const results = await Promise.all(Array.from({ length: 20 }, () => start()));
    await env.flushBackground();
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(19);
    expect(env.llm.choices).toHaveLength(1);
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    // The choice is paid for with the run it belongs to: its cost is in the day's cost.
    const costs = await env.db.query<{ purpose: string; cost: number }>(
      `select purpose, sum(cost_micros)::int as cost from llm_calls
        where learner_id = $1 group by purpose`,
      [l.learnerId],
    );
    // The run's own calls; what is prepared for it afterwards (its hints) is booked as its own.
    const total = costs
      .filter((c) => c.purpose === 'forms' || c.purpose === 'explain')
      .reduce((n, c) => n + c.cost, 0);
    const booked = await env.db.one<{ cost_micros: number }>(
      `select cost_micros::int from usage_daily where learner_id = $1 and day = $2 and kind = 'explain'`,
      [l.learnerId, day],
    );
    expect(costs.find((c) => c.purpose === 'forms')!.cost).toBeGreaterThan(0);
    expect(booked.cost_micros).toBe(total);
  });

  it('gives her allowance back when the run fails before its call writes anything (#665)', async () => {
    env.llm.scriptChoice({ json: { forms: [], figures: [] } });
    env.llm.script('explain', { error: new LlmError('unavailable', 'provider down') });
    expect((await start()).status).toBe(503);
    const used = await env.db.maybeOne<{ calls: number }>(
      `select calls from usage_daily where learner_id = $1 and kind = 'explain'`,
      [l.learnerId],
    );
    expect(used?.calls ?? 0).toBe(0);
  });

  it.each([
    ['an answer that is no object', { json: 'fraction' }],
    ['only names it was not offered', { json: { forms: ['poster'], figures: ['hologram'] } }],
    ['a refusal', { error: new LlmError('refused', 'provider rejected the request (400)') }],
  ] as const)('falls back to plain questions on %s, and the main call says so', async (_n, a) => {
    env.llm.scriptChoice(a);
    env.llm.script('explain', { json: SET });
    expect((await start()).status).toBe(201);
    await env.flushBackground();
    const [main] = env.llm.callsFor('explain');
    expect(shown(main!.schema)).toEqual({ forms: [], figures: [] });
    expect(main?.system).toContain('NO FIGURE CAN BE DRAWN');
  });

  it('a choice of everything is cut to what fits, in the order it was ranked (#665)', async () => {
    const full = offered(explainSchemaFor('practice', null));
    env.llm.scriptChoice({ json: full });
    env.llm.script('explain', { json: SET });
    expect((await start()).status).toBe(201);
    await env.flushBackground();
    const [main] = env.llm.callsFor('explain');
    expect(schemaProperties(main!.schema)).toBeLessThanOrEqual(MAX_SCHEMA_PROPERTIES);
    const sent = shown(main!.schema);
    expect(sent.figures.length + sent.forms.length).toBeGreaterThan(0);
    expect(sent.figures.length + sent.forms.length).toBeLessThan(
      full.figures.length + full.forms.length,
    );
    // The first ranked of each list always fits.
    expect(sent.figures[0]).toBe(full.figures[0]);
  });
});
