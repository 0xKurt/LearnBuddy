import { describe, expect, it } from 'vitest';

import {
  categoriesFit,
  chartProblem,
  climateAxes,
  fiveNumberVariants,
  humidity,
  niceAxis,
  numericX,
  precipUnits,
  pyramidShape,
  readChart,
  regression,
  type BoxPlot,
  type ClimateChart,
  type LineChart,
  type PieChart,
  type Pyramid,
  type ReadQuestion,
  type ScatterPlot,
} from '../charts.js';

const read = (q: ReadQuestion, s = 0, i = 0, j = 0) => ({ q, s, i, j });

// A Central European station, as an atlas prints it (rounded).
const berlin: ClimateChart = {
  type: 'climate_chart',
  place: 'Berlin',
  alt: 34,
  t: [0.6, 1.4, 4.6, 9.4, 14.4, 17.4, 19.4, 19.1, 14.9, 9.9, 5.0, 1.9],
  p: [42, 33, 41, 37, 54, 69, 56, 58, 45, 37, 44, 55],
};

// A Mediterranean station: dry summers, so some months are arid.
const rome: ClimateChart = {
  type: 'climate_chart',
  place: 'Rom',
  alt: 46,
  t: [7.5, 8.5, 11, 14, 18, 22, 25, 25, 22, 17, 12, 9],
  p: [80, 70, 60, 50, 30, 15, 10, 20, 70, 110, 110, 95],
};

const line = (over: Partial<LineChart> = {}): LineChart => ({
  type: 'line_chart',
  x: ['0', '1', '2', '3', '4'],
  xt: 'Zeit in s',
  s: [{ n: 'Weg', u: 'm', v: [0, 2, 8, 18, 32], bar: false, r: false }],
  ...over,
});

const pie = (v: number[], half = false): PieChart => ({
  type: 'pie_chart',
  half,
  l: v.map((_, k) => `Partei ${k + 1}`),
  v,
});

const pyramid = (totals: number[]): Pyramid => ({
  type: 'pyramid',
  a0: 0,
  w: 10,
  m: totals.map((x) => x / 2),
  f: totals.map((x) => x / 2),
  u: '%',
});

describe('axes', () => {
  it('rounds to 1-2-5 steps that cover the data', () => {
    expect(niceAxis(3, 47, 5)).toMatchObject({ lo: 0, hi: 50, step: 10 });
    expect(niceAxis(0.1, 0.9, 5).step).toBeCloseTo(0.2);
    expect(niceAxis(0.1, 0.9, 5).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('gives a flat series room instead of a zero-height axis', () => {
    const a = niceAxis(5, 5);
    expect(a.lo).toBeLessThan(5);
    expect(a.hi).toBeGreaterThan(5);
  });

  it('tells numbers on the x-axis from categories', () => {
    expect(numericX(['0', '2,5', '-1'])).toEqual([0, 2.5, -1]);
    expect(numericX(['1990', 'Jan'])).toBeNull();
  });

  it('measures category labels against the narrowest phone', () => {
    expect(categoriesFit(['J', 'F', 'M', 'A', 'M2', 'J2', 'J3', 'A2', 'S', 'O', 'N', 'D'])).toBe(
      true,
    );
    const months3 = [
      'Jan',
      'Feb',
      'Mär',
      'Apr',
      'Mai',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Dez',
    ];
    expect(categoriesFit(months3)).toBe(false);
    expect(categoriesFit(months3.slice(0, 6))).toBe(true);
  });
});

describe('chartProblem — the model writes data, code checks it', () => {
  it('accepts a well-formed line chart', () => {
    expect(chartProblem(line())).toBeNull();
  });

  it('rejects a series that is not as long as its labels', () => {
    expect(chartProblem(line({ s: [{ n: 'Weg', u: 'm', v: [0, 2], bar: false, r: false }] }))).toBe(
      'length_mismatch',
    );
  });

  it('allows one column series, not two', () => {
    const s = [
      { n: 'A', u: 'mm', v: [1, 2, 3, 4, 5], bar: true, r: false },
      { n: 'B', u: 'mm', v: [1, 2, 3, 4, 5], bar: true, r: false },
    ];
    expect(chartProblem(line({ s }))).toBe('two_bar_series');
  });

  it('keeps one unit per axis and a second axis only for a second unit', () => {
    const mixed = [
      { n: 'A', u: 'm', v: [1, 2, 3, 4, 5], bar: false, r: false },
      { n: 'B', u: 's', v: [1, 2, 3, 4, 5], bar: false, r: false },
    ];
    expect(chartProblem(line({ s: mixed }))).toBe('axis_units');
    const sameTwice = [
      { n: 'A', u: 'm', v: [1, 2, 3, 4, 5], bar: false, r: false },
      { n: 'B', u: 'm', v: [1, 2, 3, 4, 5], bar: false, r: true },
    ];
    expect(chartProblem(line({ s: sameTwice }))).toBe('axis_units');
    const onlyRight = [{ n: 'A', u: 'm', v: [1, 2, 3, 4, 5], bar: false, r: true }];
    expect(chartProblem(line({ s: onlyRight }))).toBe('axis_units');
    const two = [
      { n: 'Umsatz', u: '€', v: [1, 2, 3, 4, 5], bar: true, r: false },
      { n: 'Kunden', u: '', v: [5, 4, 3, 2, 1], bar: false, r: true },
    ];
    expect(chartProblem(line({ s: two }))).toBeNull();
  });

  it('rejects a measured x that goes backwards', () => {
    expect(chartProblem(line({ x: ['0', '2', '1', '3', '4'] }))).toBe('x_not_increasing');
  });

  it('rejects category labels that would collide on a 360 px phone', () => {
    const x = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August'];
    const s = [{ n: 'T', u: '°C', v: [1, 2, 3, 4, 5, 6, 7, 8], bar: false, r: false }];
    expect(chartProblem(line({ x, s }))).toBe('labels_too_long');
  });

  it('rejects twice the same category', () => {
    expect(chartProblem(line({ x: ['A', 'B', 'A', 'C', 'D'] }))).toBe('duplicate_labels');
  });

  it('holds a pie to 100 % (one rounded decimal per slice is fine, 98 % is not)', () => {
    expect(chartProblem(pie([50, 30, 20]))).toBeNull();
    expect(chartProblem(pie([33.3, 33.3, 33.4]))).toBeNull();
    expect(chartProblem(pie([33.3, 33.3, 33.3]))).toBeNull();
    expect(chartProblem(pie([50, 30, 18]))).toBe('pie_sum');
    expect(chartProblem(pie([50, 30, 25]))).toBe('pie_sum');
  });

  it('holds a box plot to min ≤ Q1 ≤ median ≤ Q3 ≤ max', () => {
    const box = (v: number[]): BoxPlot => ({
      type: 'box_plot',
      u: '',
      b: [{ l: 'A', v }],
      raw: [],
    });
    expect(chartProblem(box([1, 3, 5, 7, 9]))).toBeNull();
    expect(chartProblem(box([1, 6, 5, 7, 9]))).toBe('box_order');
    expect(chartProblem(box([4, 4, 4, 4, 4]))).toBe('box_order');
  });

  it('computes the five numbers from a data list and rejects a box that disagrees', () => {
    const raw = [9, 1, 8, 2, 7, 3, 6, 4, 5];
    const box = (v: number[]): BoxPlot => ({ type: 'box_plot', u: '', b: [{ l: 'A', v }], raw });
    // n = 9: halves without the median give 2.5 / 7.5, with it 3 / 7 (also the empirical rank).
    expect(chartProblem(box([1, 2.5, 5, 7.5, 9]))).toBeNull();
    expect(chartProblem(box([1, 3, 5, 7, 9]))).toBeNull();
    expect(chartProblem(box([1, 2, 5, 8, 9]))).toBe('box_raw');
    expect(chartProblem(box([1, 3, 6, 7, 9]))).toBe('box_raw');
  });

  it('gives a data list to exactly one box', () => {
    const c: BoxPlot = {
      type: 'box_plot',
      u: '',
      b: [
        { l: 'A', v: [1, 3, 5, 7, 9] },
        { l: 'B', v: [1, 3, 5, 7, 9] },
      ],
      raw: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    };
    expect(chartProblem(c)).toBe('box_raw');
  });

  it('needs a spread in x for a scatter plot', () => {
    const c: ScatterPlot = {
      type: 'scatter_plot',
      x: [2, 2, 2],
      y: [1, 2, 3],
      fit: true,
      xt: '',
      yt: '',
    };
    expect(chartProblem(c)).toBe('flat_x');
    expect(chartProblem({ ...c, x: [1, 2] })).toBe('length_mismatch');
  });

  it('keeps a pyramid symmetric in its groups and within a human life', () => {
    expect(chartProblem({ ...pyramid([10, 9, 8, 7]), f: [1, 2, 3] })).toBe('length_mismatch');
    expect(chartProblem({ ...pyramid([10, 9, 8, 7]), a0: 100, w: 10 })).toBe('too_old');
    expect(chartProblem(pyramid([0, 0, 0, 0]))).toBe('empty');
  });
});

describe('the climate chart', () => {
  it('scales mm 1 : 2 against °C and compresses above 100 mm tenfold', () => {
    expect(precipUnits(20)).toBe(10);
    expect(precipUnits(100)).toBe(50);
    expect(precipUnits(300)).toBe(60);
    expect(climateAxes(berlin)).toEqual({ lo: 0, hi: 40 });
    expect(climateAxes({ ...berlin, t: berlin.t.map((t) => t - 15) }).lo).toBe(-20);
  });

  it('decides humid and arid from the 1 : 2 scale, and refuses a month on the line', () => {
    expect(humidity(19.4, 56)).toBe('humid');
    expect(humidity(25, 10)).toBe('arid');
    expect(humidity(20, 41)).toBeNull();
  });

  it('computes what a question reads off it', () => {
    expect(readChart(berlin, read('sum', 1))).toMatchObject({ kind: 'number', value: 571 });
    const mean = readChart(berlin, read('mean', 0));
    expect(mean?.kind).toBe('number');
    if (mean?.kind === 'number') {
      expect(mean.value).toBeCloseTo(118 / 12, 9);
      // Twelve readings of ±2 °C average out: about ±0.58 °C for the mean.
      expect(mean.tol).toBeCloseTo(2 / Math.sqrt(12), 5);
    }
    expect(readChart(berlin, read('range', 0))).toMatchObject({ value: 19.4 - 0.6, tol: 4 });
    expect(readChart(berlin, read('value', 1, 5))).toMatchObject({ value: 69, tol: 4 });
    expect(readChart(berlin, read('humid'))).toMatchObject({ kind: 'number', value: 12, tol: 0 });
    // May to August: the columns end below the temperature line.
    expect(readChart(rome, read('arid'))).toMatchObject({ kind: 'number', value: 4 });
    expect(readChart(rome, read('humid_at', 0, 6))).toEqual({
      kind: 'choice',
      options: ['humid', 'arid'],
      correct: 1,
    });
  });

  it('does not name a warmest month the drawing cannot tell apart', () => {
    // July 19.4 °C and August 19.1 °C: 0.3 °C apart on a 10 °C grid.
    expect(readChart(berlin, read('argmax', 0))).toBeNull();
    // Nor a coldest one: January 0.6 °C, February 1.4 °C.
    expect(readChart(berlin, read('argmin', 0))).toBeNull();
    // Wettest: June 69 mm against August 58 mm.
    expect(readChart(berlin, read('argmax', 1))).toEqual({ kind: 'label', index: 5 });
  });

  it('does not count humid months when one sits on the line', () => {
    const edge = {
      ...berlin,
      p: berlin.p.map((p, k) => (k === 6 ? 40 : p)),
      t: berlin.t.map((t, k) => (k === 6 ? 20 : t)),
    };
    expect(readChart(edge, read('humid'))).toBeNull();
    expect(readChart(edge, read('humid_at', 0, 6))).toBeNull();
    expect(readChart(edge, read('humid_at', 0, 0))).toMatchObject({ correct: 0 });
  });

  it('reads compressed columns with a tenfold tolerance', () => {
    const wet = { ...berlin, p: berlin.p.map((p, k) => (k === 6 ? 300 : p)) };
    expect(readChart(wet, read('value', 1, 6))).toMatchObject({ value: 300, tol: 40 });
  });
});

describe('readChart — what is and is not a reading', () => {
  it('refuses a question the chart cannot answer and a position past its end', () => {
    expect(readChart(pie([50, 50]), read('sum'))).toBeNull();
    expect(readChart(line(), read('value', 0, 7))).toBeNull();
    expect(readChart(line(), read('value', 1, 0))).toBeNull();
    expect(readChart(line(), read('diff', 0, 2, 2))).toBeNull();
    expect(readChart(berlin, read('slope'))).toBeNull();
  });

  it('refuses to read a chart that breaks a rule', () => {
    expect(readChart(pie([50, 30, 18]), read('value', 0, 0))).toBeNull();
  });

  it('reads a line chart with the tolerance of its own grid', () => {
    // 0…32 m → ticks of 10 m, read to ±2 m.
    expect(readChart(line(), read('value', 0, 3))).toEqual({ kind: 'number', value: 18, tol: 2 });
    expect(readChart(line(), read('diff', 0, 1, 4))).toEqual({ kind: 'number', value: 30, tol: 4 });
    expect(readChart(line(), read('argmax'))).toEqual({ kind: 'label', index: 4 });
  });

  it('reads a pie exactly (the shares are printed) and computes centre angles', () => {
    expect(readChart(pie([25, 40, 35]), read('value', 0, 1))).toEqual({
      kind: 'number',
      value: 40,
      tol: 0,
    });
    expect(readChart(pie([25, 40, 35]), read('angle', 0, 0))).toMatchObject({ value: 90 });
    expect(readChart(pie([25, 40, 35], true), read('angle', 0, 0))).toMatchObject({ value: 45 });
    expect(readChart(pie([25, 40, 35]), read('argmin'))).toEqual({ kind: 'label', index: 0 });
    expect(readChart(pie([40, 40, 20]), read('argmax'))).toBeNull();
  });

  it('reads a box plot: a value, the range, the interquartile range', () => {
    const c: BoxPlot = {
      type: 'box_plot',
      u: 'cm',
      b: [{ l: '7a', v: [120, 135, 142, 150, 168] }],
      raw: [],
    };
    expect(readChart(c, read('value', 0, 2))).toMatchObject({ value: 142 });
    expect(readChart(c, read('range'))).toMatchObject({ value: 48 });
    expect(readChart(c, read('iqr'))).toMatchObject({ value: 15 });
    expect(readChart(c, read('value', 0, 5))).toBeNull();
    expect(readChart(c, read('value', 1, 0))).toBeNull();
  });

  it('computes the least-squares line, and reads it only when it is drawn', () => {
    const c: ScatterPlot = {
      type: 'scatter_plot',
      x: [0, 1, 2, 3, 4],
      y: [1, 3, 5, 7, 9],
      fit: true,
      xt: 't in s',
      yt: 's in m',
    };
    expect(regression(c.x, c.y)).toEqual({ slope: 2, intercept: 1 });
    expect(readChart(c, read('slope'))).toMatchObject({ value: 2 });
    expect(readChart(c, read('intercept'))).toMatchObject({ value: 1 });
    expect(readChart({ ...c, fit: false }, read('slope'))).toBeNull();
  });
});

describe('the population pyramid', () => {
  it('names its type from the shape', () => {
    expect(pyramidShape(pyramid([20, 18, 15, 12, 9, 6, 3]))).toBe('pyramid');
    expect(pyramidShape(pyramid([12, 12, 12, 12, 11, 8, 4]))).toBe('bell');
    expect(pyramidShape(pyramid([7, 8, 11, 13, 13, 12, 8]))).toBe('urn');
  });

  it('names no type between the bands', () => {
    // young / middle = 1.15: neither a clear pyramid nor a clear bell.
    expect(pyramidShape(pyramid([11.5, 11.5, 10, 10, 8, 6, 3]))).toBeNull();
  });

  it('asks the type as a fixed choice, and only when it is clear', () => {
    expect(readChart(pyramid([20, 18, 15, 12, 9, 6, 3]), read('type'))).toEqual({
      kind: 'choice',
      options: ['pyramid', 'bell', 'urn'],
      correct: 0,
    });
    expect(readChart(pyramid([11.5, 11.5, 10, 10, 8, 6, 3]), read('type'))).toBeNull();
  });
});

describe('fiveNumberVariants', () => {
  it('knows the schoolbook definitions of the quartiles', () => {
    const v = fiveNumberVariants([1, 2, 3, 4, 5, 6, 7, 8]);
    // n = 8: halves give 2.5 / 6.5; the empirical rank n/4 = 2 is whole → (x2 + x3) / 2 = 2.5.
    expect(v).toContainEqual([1, 2.5, 4.5, 6.5, 8]);
    expect(fiveNumberVariants([1, 2, 3])).toEqual([]);
  });
});
