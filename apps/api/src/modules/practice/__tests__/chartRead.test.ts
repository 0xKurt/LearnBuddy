// Chart questions (issues #245, #246): the key is computed from the chart's data and the
// model's must agree — or the question is not asked. Rule 0 in both directions.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { monthNames, numberKeyTolerance } from '../chartRead.js';
import { ItemDraft, itemsOneByOne, usableItems } from '../items.js';

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

const base = {
  kind: 'numeric',
  prompt: 'Wie hoch ist der Jahresniederschlag in Berlin?',
  answer: '571',
  accepted_answers: [],
  unit: 'mm',
  choices: null,
  correct_choice: null,
  topic: 'Klimadiagramme',
  difficulty: 2,
  source_excerpt: null,
  hints: [],
  worked_solution: null,
  prompt_lang: 'de',
  figure: berlin,
  read: { q: 'sum', s: 1, i: 0, j: 0 },
};

const draft = (over: Record<string, unknown> = {}) => ItemDraft.parse({ ...base, ...over });
const one = (over: Record<string, unknown> = {}, locale?: string) =>
  usableItems([draft(over)], { locale });

describe('a number read off a chart', () => {
  it('keeps a key that is the computed value, and sets the reading tolerance', () => {
    const [item] = one();
    expect(item?.answer).toBe('571');
    // Twelve columns, each read to ±4 mm: √12 · 4 ≈ 13.9 mm.
    expect(item?.tolerance).toBeCloseTo(4 * Math.sqrt(12), 6);
  });

  it('accepts the computed value rounded to the precision the key is written in', () => {
    const mean = { read: { q: 'mean', s: 0, i: 0, j: 0 }, unit: '°C' };
    expect(one({ ...mean, answer: '9.8' })).toHaveLength(1);
    expect(one({ ...mean, answer: '10' })).toHaveLength(1);
  });

  it('drops a key that disagrees with the data (the model added wrongly)', () => {
    expect(one({ answer: '617' })).toHaveLength(0);
    expect(one({ read: { q: 'mean', s: 0, i: 0, j: 0 }, answer: '11' })).toHaveLength(0);
  });

  it('never lets the model choose its own tolerance', () => {
    const [item] = one({ tolerance: 100 });
    expect(item?.tolerance).toBeCloseTo(4 * Math.sqrt(12), 6);
  });

  it('drops a key rounded so coarsely that it says nothing', () => {
    expect(numberKeyTolerance('0', 0.48, 0.02)).toBeUndefined();
    expect(numberKeyTolerance('0.5', 0.48, 0.02)).toBe(0.05);
    expect(numberKeyTolerance('5', 5, 0)).toBeNull();
    expect(numberKeyTolerance('13', 12.5, 0)).toBe(0.5);
    expect(numberKeyTolerance('viel', 12.5, 0)).toBeUndefined();
  });

  it('counts humid months exactly', () => {
    const humid = { figure: rome, read: { q: 'arid', s: 0, i: 0, j: 0 }, unit: null };
    const [item] = one({ ...humid, prompt: 'Wie viele aride Monate hat Rom?', answer: '4' });
    expect(item?.tolerance).toBeNull();
    expect(one({ ...humid, answer: '3' })).toHaveLength(0);
  });

  it('drops a number asked about a chart without saying what it reads', () => {
    expect(one({ read: null })).toHaveLength(0);
  });

  it('drops a reading that is not a question about a number', () => {
    expect(one({ kind: 'short' })).toHaveLength(0);
  });

  it('drops a reading the chart cannot give, or without a chart', () => {
    expect(one({ read: { q: 'slope', s: 0, i: 0, j: 0 } })).toHaveLength(0);
    expect(one({ read: { q: 'value', s: 1, i: 12, j: 0 } })).toHaveLength(0);
    expect(one({ figure: null })).toHaveLength(0);
  });
});

describe('a label read off a chart', () => {
  const wettest = {
    kind: 'short',
    prompt: 'In welchem Monat fällt in Berlin der meiste Niederschlag?',
    answer: 'Juni',
    unit: null,
    read: { q: 'argmax', s: 1, i: 0, j: 0 },
  };

  it('accepts the month at the computed position, in long and short form', () => {
    const [item] = one(wettest);
    expect(item?.answer).toBe('Juni');
    expect(item?.accepted_answers).toEqual(['Jun']);
  });

  it('drops the wrong month', () => {
    expect(one({ ...wettest, answer: 'August' })).toHaveLength(0);
  });

  it('drops a month the drawing cannot settle (July 19.4 °C, August 19.1 °C)', () => {
    expect(
      one({ ...wettest, answer: 'Juli', read: { q: 'argmax', s: 0, i: 0, j: 0 } }),
    ).toHaveLength(0);
  });

  it('replaces whatever else the model accepted with the ways to write the label', () => {
    const [item] = one({ ...wettest, accepted_answers: ['Juli'] });
    expect(item?.accepted_answers).toEqual(['Jun']);
  });

  it('checks a multiple-choice label against the option it points at', () => {
    const mc = {
      ...wettest,
      kind: 'multiple_choice',
      choices: ['Januar', 'Juni', 'August'],
      correct_choice: 1,
    };
    expect(one(mc)).toHaveLength(1);
    expect(one({ ...mc, correct_choice: 2, answer: 'August' })).toHaveLength(0);
  });

  it('names months in the question’s own language', () => {
    expect(monthNames('de', 6)).toEqual(['Juli', 'Jul']);
    expect(monthNames('en', 6)).toEqual(['July', 'Jul']);
    expect(monthNames('fr', 6)).toContain('juillet');
    expect(monthNames(null, 6)).toEqual([]);
  });
});

describe('a fixed choice: the options are written by code', () => {
  const humidAt = {
    kind: 'multiple_choice',
    prompt: 'Ist der Juli in Rom humid oder arid?',
    answer: 'arid',
    unit: null,
    figure: rome,
    choices: ['humid', 'arid'],
    correct_choice: 1,
    read: { q: 'humid_at', s: 0, i: 6, j: 0 },
  };

  it('keeps a right index and writes the options in the question’s language', () => {
    const [item] = one({ ...humidAt, choices: ['feucht', 'trocken'], answer: 'trocken' });
    expect(item?.choices).toEqual(['humid', 'arid']);
    expect(item?.answer).toBe('arid');
    const [en] = one({ ...humidAt, prompt_lang: 'en', prompt: 'Is July humid or arid in Rome?' });
    expect(en?.choices).toEqual(['Humid', 'Arid']);
  });

  it('drops a wrong index', () => {
    expect(one({ ...humidAt, correct_choice: 0, answer: 'humid' })).toHaveLength(0);
  });

  it('takes the learner’s language when the question names none, and drops it with neither', () => {
    expect(one({ ...humidAt, prompt_lang: null }, 'it')[0]?.choices).toEqual(['Umido', 'Arido']);
    expect(one({ ...humidAt, prompt_lang: null })).toHaveLength(0);
  });

  const pyramid = {
    type: 'pyramid',
    a0: 0,
    w: 10,
    m: [10, 9, 7.5, 6, 4.5, 3, 1.5],
    f: [10, 9, 7.5, 6, 4.5, 3, 1.5],
    u: '%',
  };

  it('computes a pyramid’s type and rejects a model that names another', () => {
    const type = {
      kind: 'multiple_choice',
      prompt: 'Welchen Typ hat diese Bevölkerungspyramide?',
      answer: 'Pyramide',
      unit: null,
      figure: pyramid,
      choices: ['Pyramide', 'Glocke', 'Urne'],
      correct_choice: 0,
      read: { q: 'type', s: 0, i: 0, j: 0 },
    };
    expect(one(type)[0]?.choices).toEqual(['Pyramide', 'Glocke', 'Urne']);
    expect(one({ ...type, correct_choice: 2, answer: 'Urne' })).toHaveLength(0);
  });
});

describe('a chart the model got wrong costs its question', () => {
  const list = itemsOneByOne(ItemDraft, 10);
  const pie = (v: number[]) => ({
    ...base,
    prompt: 'Welchen Anteil hat Partei B?',
    answer: '30',
    unit: '%',
    figure: { type: 'pie_chart', half: false, l: ['A', 'B', 'C'], v },
    read: { q: 'value', s: 0, i: 1, j: 0 },
  });

  it('keeps a pie that adds up to 100 %', () => {
    expect(usableItems(list.parse([pie([50, 30, 20])]))).toHaveLength(1);
  });

  it('drops the question when the slices do not add up (never stretched to 100)', () => {
    expect(list.parse([pie([50, 30, 18])])).toHaveLength(0);
    expect(usableItems([ItemDraft.parse(pie([50, 30, 18]))])).toHaveLength(0);
  });

  it('drops the question when the chart does not even parse', () => {
    const broken = { ...pie([50, 50]), figure: { type: 'pie_chart', half: false, l: ['A'] } };
    expect(list.parse([broken])).toHaveLength(0);
  });

  it('drops a box plot that disagrees with its own data list', () => {
    const box = (v: number[]) => ({
      ...base,
      prompt: 'Wie groß ist der Median?',
      answer: '5',
      unit: null,
      figure: { type: 'box_plot', u: '', b: [{ l: 'A', v }], raw: [9, 1, 8, 2, 7, 3, 6, 4, 5] },
      read: { q: 'value', s: 0, i: 2, j: 0 },
    });
    expect(list.parse([box([1, 3, 5, 7, 9])])).toHaveLength(1);
    expect(list.parse([box([1, 2, 5, 8, 9])])).toHaveLength(0);
  });

  it('still drops only the drawing for any other broken figure (audit H-15)', () => {
    const fraction = {
      ...base,
      kind: 'short',
      answer: 'drei Viertel',
      figure: { type: 'fraction', shape: 'circle', fractions: [] },
      read: null,
    };
    const [item] = list.parse([fraction]);
    expect(item?.figure).toBeNull();
  });

  it('keeps a question that only interprets a chart, without a reading', () => {
    const zone = {
      ...base,
      kind: 'multiple_choice',
      prompt: 'Zu welcher Klimazone gehört Berlin?',
      answer: 'gemäßigte Zone',
      unit: null,
      choices: ['Tropen', 'Subtropen', 'gemäßigte Zone'],
      correct_choice: 2,
      read: null,
    };
    expect(usableItems([draft(zone)])).toHaveLength(1);
  });

  it('refuses a reading the schema cannot hold', () => {
    const bad = { ...base, read: { q: 'median', s: 0, i: 0, j: 0 } };
    expect(list.parse([bad])).toHaveLength(0);
    expect(z.array(z.unknown()).parse([bad])).toHaveLength(1);
  });
});

describe('the walkthrough’s charts (tests/web/charts.spec.ts)', () => {
  it('all pass the checks, so the browser sees every chart type', async () => {
    const { CHART_ITEMS } = await import('../../../testing/scenarios/learning-modes.js');
    const kept = usableItems(itemsOneByOne(ItemDraft, 25).parse(CHART_ITEMS), { locale: 'de' });
    expect(kept.map((i) => i.figure?.type)).toEqual([
      'climate_chart',
      'line_chart',
      'pie_chart',
      'box_plot',
      'histogram',
      'scatter_plot',
      'pyramid',
    ]);
  });
});
