// Primary-school figures (issue #254): every figure draws without crashing, and what a screen
// reader hears is what the drawing shows — where the hands stand, which pieces lie there, how
// many dots and blocks — never the time, the sum or the number a question asks her to read off.
//
// What this layer cannot see: geometry (jsdom lays nothing out). That every figure fits a 360 px
// and a 390 px phone, light and dark, is tests/web/primary-figures.spec.ts.

import type { PrimaryFigure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { describePrimary, PrimaryBody } from '../PrimaryFigures.js';

const FIGURES: PrimaryFigure[] = [
  { type: 'clock', c: [{ h: 7, m: 45 }], h24: false, ask: 'time' },
  {
    type: 'clock',
    c: [
      { h: 7, m: 45 },
      { h: 8, m: 32 },
    ],
    h24: false,
    ask: 'span',
  },
  {
    type: 'money',
    p: [
      { d: '20ct', n: 2 },
      { d: '5€', n: 1 },
      { d: '2€', n: 1 },
    ],
    ask: 'sum',
  },
  { type: 'dot_field', field: 'twenty', n: [8, 6], ask: 'count' },
  { type: 'dot_field', field: 'hundred', n: [37], ask: 'count' },
  { type: 'base_ten', h: 2, t: 13, o: 7, ask: 'count' },
];

/** The key and its values, readable when nested: `figure.hand_on(n=9)`. */
const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}(${Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')})`;

describe('PrimaryBody', () => {
  it.each(FIGURES.map((f, i) => [`${f.type} ${i}`, f] as const))('draws a %s', (_, figure) => {
    const { container } = renderInApp(<PrimaryBody figure={figure} width={266} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('writes the value on every coin and note', () => {
    const { container } = renderInApp(<PrimaryBody figure={FIGURES[2]!} width={266} />);
    const text = container.textContent ?? '';
    expect(text).toContain('5 €');
    expect(text).toContain('2 €');
    expect(text.match(/20 ct/g)).toHaveLength(2);
  });
});

describe('describePrimary', () => {
  it('says where the hands stand, not what time it is', () => {
    const said = describePrimary(FIGURES[0]!, t);
    expect(said).toContain('figure.hand_between(a=7,b=8)');
    expect(said).toContain('figure.hand_on(n=9)');
    expect(said).not.toContain('7:45');
  });

  it('a minute between the marks: the strokes after the last number', () => {
    const said = describePrimary(FIGURES[1]!, t);
    expect(said).toContain('figure.clock_span');
    expect(said).toContain('figure.hand_after(count=2,n=6)');
  });

  it('names the pieces, largest first, never their sum', () => {
    const said = describePrimary(FIGURES[2]!, t);
    expect(said.indexOf('figure.euro(n=5)')).toBeLessThan(said.indexOf('figure.euro(n=2)'));
    expect(said.indexOf('figure.euro(n=2)')).toBeLessThan(said.indexOf('figure.cent(n=20)'));
    expect(said).toContain('figure.coins');
    expect(said).toContain('figure.notes');
    expect(said).not.toMatch(/7[.,]40/);
  });

  it('the dots per colour and the blocks per kind', () => {
    expect(describePrimary(FIGURES[3]!, t)).toContain('figure.dots_then(count=6)');
    const blocks = describePrimary(FIGURES[5]!, t);
    expect(blocks).toContain('figure.rods(count=13)');
    expect(blocks).not.toContain('237');
  });
});
