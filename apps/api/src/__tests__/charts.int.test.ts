// Charts next to a question (issues #245, #246; docs/architecture.md §Practice, Charts): the
// model writes the data and says what a question reads off it, code computes the key and
// rejects what disagrees, and every answer is judged by the rules — no model call per answer.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const berlin = {
  type: 'climate_chart',
  place: 'Berlin',
  alt: 34,
  t: [0.6, 1.4, 4.6, 9.4, 14.4, 17.4, 19.4, 19.1, 14.9, 9.9, 5.0, 1.9],
  p: [42, 33, 41, 37, 54, 69, 56, 58, 45, 37, 44, 55],
};

const rome = {
  type: 'climate_chart',
  place: 'Rom',
  alt: 46,
  t: [7.5, 8.5, 11, 14, 18, 22, 25, 25, 22, 17, 12, 9],
  p: [80, 70, 60, 50, 30, 15, 10, 20, 70, 110, 110, 95],
};

const item = (over: Record<string, unknown>) => ({
  kind: 'numeric',
  prompt: 'Frage',
  answer: '0',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Klimadiagramme',
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  source_excerpt: null,
  figure: berlin,
  read: null,
  ...over,
});

const read = (q: string, s = 0, i = 0, j = 0) => ({ q, s, i, j });

/** What the model wrote: five sound questions and three it got wrong. */
const SET = {
  usable: true,
  title: 'Klimadiagramme auswerten',
  subject: { name: 'Erdkunde', kind: 'geography' },
  items: [
    item({
      prompt: 'Wie hoch ist der Jahresniederschlag in Berlin?',
      answer: '571',
      unit: 'mm',
      read: read('sum', 1),
    }),
    item({
      prompt: 'Wie hoch ist die Jahresmitteltemperatur in Berlin?',
      answer: '9.8',
      unit: '°C',
      read: read('mean', 0),
    }),
    item({
      kind: 'short',
      prompt: 'In welchem Monat fällt in Berlin der meiste Niederschlag?',
      answer: 'Juni',
      read: read('argmax', 1),
    }),
    item({
      kind: 'multiple_choice',
      prompt: 'Ist der Juli in Rom humid oder arid?',
      answer: 'arid',
      choices: ['humid', 'arid'],
      correct_choice: 1,
      figure: rome,
      read: read('humid_at', 0, 6),
    }),
    item({
      prompt: 'Wie viele aride Monate hat Rom?',
      answer: '4',
      figure: rome,
      read: read('arid'),
    }),
    // Wrong key: the model counted three arid months.
    item({
      prompt: 'Wie viele Monate sind in Rom arid?',
      answer: '3',
      figure: rome,
      read: read('arid'),
    }),
    // Not readable: July and August differ by 0.3 °C on a 10 °C grid.
    item({
      kind: 'short',
      prompt: 'Welcher Monat ist in Berlin am wärmsten?',
      answer: 'Juli',
      read: read('argmax', 0),
    }),
    // A number about the chart without saying what it reads: its key cannot be checked.
    item({ prompt: 'Wie groß ist die Temperaturamplitude in Berlin?', answer: '18.8' }),
  ],
};

async function answer(l: Learner, session: SessionView, itemId: string, given: string | number) {
  return l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    ...(typeof given === 'number' ? { choice: given } : { text: given }),
  });
}

describe.skipIf(!dbReady)('charts', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T14:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2013-02-10',
      pin: '4826',
    });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('„Üb mit mir Klimadiagramme“: five questions, each judged by code', async () => {
    env.llm.script('explain', async (req) => {
      // The generator is told what a chart is and what a reading is.
      expect(req.system).toContain('climate_chart');
      expect(req.system).toContain('"read"');
      return SET;
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Üb mit mir Klimadiagramme',
    });
    expect(res.status).toBe(201);
    // The first questions come at once, the rest while she works (issue #220): read the
    // session once everything is prepared.
    await env.flushBackground();
    const session = (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
    const items = session.items.map((i) => i.item);
    // The three the model got wrong are not there; the five sound ones are, with their charts.
    expect(items.map((i) => i.prompt).sort()).toEqual(
      [
        'Ist der Juli in Rom humid oder arid?',
        'In welchem Monat fällt in Berlin der meiste Niederschlag?',
        'Wie hoch ist der Jahresniederschlag in Berlin?',
        'Wie hoch ist die Jahresmitteltemperatur in Berlin?',
        'Wie viele aride Monate hat Rom?',
      ].sort(),
    );
    for (const i of items) expect(i.figure?.type).toBe('climate_chart');
    // The options of a fixed choice are code's, in her language.
    const humid = items.find((i) => i.kind === 'multiple_choice');
    expect(humid?.choices).toEqual(['humid', 'arid']);

    const byPrompt = (p: string) => {
      const found = items.find((i) => i.prompt.startsWith(p));
      if (!found) throw new Error(`missing: ${p}`);
      return found.id;
    };
    const before = env.llm.calls.length;
    // A careful reading of the columns, not the exact sum: within what the drawing allows.
    const sum = await answer(l, session, byPrompt('Wie hoch ist der Jahresn'), '565');
    expect(sum.body.verdict).toBe('correct');
    const mean = await answer(l, session, byPrompt('Wie hoch ist die Jahresm'), '9,6');
    expect(mean.body.verdict).toBe('correct');
    // The short form of the month is right too.
    const month = await answer(l, session, byPrompt('In welchem Monat'), 'Jun');
    expect(month.body.verdict).toBe('correct');
    const choice = await answer(l, session, byPrompt('Ist der Juli'), 0);
    expect(choice.body.verdict).toBe('incorrect');
    // A count is exact: three is wrong, and the rules say so without asking anyone.
    const count = await answer(l, session, byPrompt('Wie viele aride'), '3');
    expect(count.body.verdict).toBe('incorrect');
    expect(env.llm.calls.slice(before).map((c) => c.purpose)).toEqual([]);

    const turns = await env.db.query<{ evaluated_by: string }>(
      `select evaluated_by from practice_turns
        where session_id = $1 and role = 'learner' order by seq`,
      [session.id],
    );
    expect(turns.map((t) => t.evaluated_by)).toEqual(['rule', 'rule', 'rule', 'rule', 'rule']);
  });

  it('shows every statistics chart the model got right and none it got wrong', async () => {
    const stat = (figure: Record<string, unknown>, over: Record<string, unknown>) =>
      item({ figure, topic: 'Statistik', ...over });
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Diagramme lesen',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          stat(
            { type: 'pie_chart', half: false, l: ['Bus', 'Rad', 'Auto'], v: [45, 35, 20] },
            {
              prompt: 'Wie groß ist der Mittelpunktswinkel für „Bus“?',
              answer: '162',
              unit: '°',
              read: read('angle', 0, 0),
            },
          ),
          // 98 %: the slices do not add up, so neither chart nor question is shown.
          stat(
            { type: 'pie_chart', half: false, l: ['Bus', 'Rad', 'Auto'], v: [45, 35, 18] },
            {
              prompt: 'Welchen Anteil hat das Rad?',
              answer: '35',
              unit: '%',
              read: read('value', 0, 1),
            },
          ),
          stat(
            {
              type: 'box_plot',
              u: 'cm',
              b: [{ l: '7a', v: [138, 146, 152, 158, 171] }],
              raw: [],
            },
            {
              prompt: 'Wie groß ist der Median?',
              answer: '152',
              unit: 'cm',
              read: read('value', 0, 2),
            },
          ),
          stat(
            {
              type: 'scatter_plot',
              x: [0, 1, 2, 3, 4],
              y: [1.1, 2.9, 5.2, 6.8, 9],
              fit: true,
              xt: 'Zeit in s',
              yt: 'Weg in m',
            },
            {
              prompt: 'Wie groß ist die Steigung der Ausgleichsgeraden?',
              answer: '1.97',
              read: read('slope'),
            },
          ),
          stat(
            {
              type: 'pyramid',
              a0: 0,
              w: 10,
              m: [10, 9, 7.5, 6, 4.5, 3, 1.5],
              f: [10, 9, 7.5, 6, 4.5, 3, 1.5],
              u: '%',
            },
            {
              kind: 'multiple_choice',
              prompt: 'Welchen Typ hat die Bevölkerungspyramide?',
              answer: 'Urne',
              choices: ['Pyramide', 'Glocke', 'Urne'],
              // The model says urn; the shape (broad base) is a pyramid.
              correct_choice: 2,
              read: read('type'),
            },
          ),
          stat(
            {
              type: 'histogram',
              x0: 0,
              w: 1,
              v: [0.06, 0.25, 0.37, 0.24, 0.08],
              xt: 'k',
              yt: 'P(X = k)',
            },
            { prompt: 'Wie groß ist P(X = 2)?', answer: '0.37', read: read('value', 0, 2) },
          ),
        ],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Diagramme lesen',
    });
    expect(res.status).toBe(201);
    await env.flushBackground();
    const session = (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
    const types = session.items.map((i) => i.item.figure?.type).sort();
    expect(types).toEqual(['box_plot', 'histogram', 'pie_chart', 'scatter_plot']);
    const slope = session.items.find((i) => i.item.figure?.type === 'scatter_plot');
    expect(slope).toBeDefined();
    // Read off the drawn line: 2 is as good as the computed 1.97.
    const r = await answer(l, session, slope!.item.id, '2');
    expect(r.body.verdict).toBe('correct');
  });
});
