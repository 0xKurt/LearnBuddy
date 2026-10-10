// Charts next to a question (issues #245, #246): every chart type draws without crashing, and
// what a screen reader hears is the chart's data in words — every value it shows, and nothing a
// question asks her to read off it (no sum, no warmest month, no pyramid type).
//
// What this layer cannot see: geometry (jsdom lays nothing out). That every chart fits a 360 px
// and a 390 px phone, light and dark, is tests/web/charts.spec.ts.

import type { ChartFigure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { TICK_CHAR } from '../../../../../packages/shared-math/src/charts.js';
import { renderInApp } from '../../../testing/render.js';
import { ChartBody, describeChart } from '../ChartFigures.js';

const CHARTS: ChartFigure[] = [
  {
    type: 'climate_chart',
    place: 'Berlin',
    alt: 34,
    t: [0.6, 1.4, 4.6, 9.4, 14.4, 17.4, 19.4, 19.1, 14.9, 9.9, 5.0, 1.9],
    p: [42, 33, 41, 37, 54, 69, 56, 58, 45, 37, 44, 255],
  },
  {
    type: 'line_chart',
    x: ['0', '1', '2', '3'],
    xt: 'Zeit in s',
    s: [
      { n: 'Weg', u: 'm', v: [0, 2, 8, 18], bar: false, r: false },
      { n: 'Tempo', u: 'm/s', v: [0, 4, 8, 12], bar: true, r: true },
    ],
  },
  { type: 'pie_chart', half: true, l: ['A', 'B', 'C'], v: [50, 30, 20] },
  {
    type: 'box_plot',
    u: 'cm',
    b: [{ l: '7a', v: [138, 146, 152, 158, 171] }],
    raw: [],
  },
  { type: 'histogram', x0: -0.5, w: 1, v: [0.25, 0.5, 0.25], xt: 'k', yt: 'P' },
  { type: 'scatter_plot', x: [0, 1, 2], y: [1, 3, 5], fit: true, xt: 'x', yt: 'y' },
  { type: 'pyramid', a0: 0, w: 10, m: [9, 8, 6, 4], f: [9, 8, 7, 5], u: '%' },
];

/** The key and its values, so a test can see what reached the sentence. */
const t = (key: string, values: Record<string, string | number> = {}) =>
  key === 'figure.months'
    ? 'Januar,Februar,März,April,Mai,Juni,Juli,August,September,Oktober,November,Dezember'
    : `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

describe('ChartBody', () => {
  it.each(CHARTS.map((c) => [c.type, c] as const))('draws a %s', (_, chart) => {
    const { container } = renderInApp(<ChartBody figure={chart} width={266} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

/** Where each tick label with this text stands across the drawing, by its `x`. */
function labelX(container: HTMLElement, text: string): number[] {
  return Array.from(container.querySelectorAll('text'))
    .filter((el) => el.textContent === text)
    .map((el) => Number(el.getAttribute('x')));
}

describe('the labels at the ends of a measured axis (#387)', () => {
  // The census of the material walkthrough: the last year stood on the plot's end, its half past
  // the drawing — "2020" read "202" on 390×844.
  const census: ChartFigure = {
    type: 'line_chart',
    x: ['2000', '2010', '2020'],
    xt: 'Jahr',
    s: [{ n: 'Einwohner', u: 'Mio.', v: [3.4, 3.5, 3.7], bar: false, r: false }],
  };
  const scatter: ChartFigure = {
    type: 'scatter_plot',
    x: [1000, 1500, 2000],
    y: [1, 2, 3],
    fit: false,
    xt: '',
    yt: '',
  };

  // Classes half a unit wide are labelled at their boundaries: the last one on the plot's end.
  const histogram: ChartFigure = {
    type: 'histogram',
    x0: 1000,
    w: 0.5,
    v: [1, 2, 1],
    xt: '',
    yt: '',
  };

  it.each([
    ['a line chart', census, '2020'],
    ['a scatter plot', scatter, '2000'],
    ['a histogram', histogram, '1001,5'],
  ])('keeps the last one of %s whole inside the drawing', (_, chart, last) => {
    const width = 266;
    const { container } = renderInApp(<ChartBody figure={chart} width={width} />);
    const at = labelX(container, last);
    expect(at.length).toBeGreaterThan(0);
    for (const x of at) expect(x + (last.length * TICK_CHAR) / 2).toBeLessThanOrEqual(width);
  });
});

describe('describeChart', () => {
  it('reads a climate chart month by month, without its sum or its warmest month', () => {
    const said = describeChart(CHARTS[0] as ChartFigure, t);
    expect(said).toContain('Berlin');
    expect(said).toMatch(/Juli 19[.,]4 °C/);
    expect(said).toContain('Dezember 255 mm');
    // 776 mm a year: what a question asks her to add up, so the description does not.
    expect(said).not.toContain('776');
  });

  it('names a pyramid’s groups and halves, never its type', () => {
    const said = describeChart(CHARTS[6] as ChartFigure, t);
    expect(said).toContain('figure.age_group');
    expect(said).toContain('0–9');
    expect(said).toContain('9 %');
    expect(said).not.toMatch(/pyramid_type|bell|urn/i);
  });

  it('says every value of every chart', () => {
    for (const chart of CHARTS) expect(describeChart(chart, t).length).toBeGreaterThan(10);
    expect(describeChart(CHARTS[2] as ChartFigure, t)).toContain('figure.half_pie_chart');
    expect(describeChart(CHARTS[5] as ChartFigure, t)).toContain('figure.fit_line');
  });
});
