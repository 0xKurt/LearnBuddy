// Trees next to a question (issue #256): every kind draws without crashing, and what a screen
// reader hears is the figure in words — every branch, person and transition — and nothing a
// question asks for (no path probability, no mode, no genotype, no verdict on the word).
//
// Geometry (fit at 360 and 390 px, light and dark) is tests/web/trees.spec.ts.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { describeTree, TreeBody } from '../TreeFigures.js';

type TreeFig = Extract<Figure, { type: 'tree' | 'pedigree' | 'automaton' }>;

const node = (p: number, l: string, e: string) => ({ p, l, e });
const person = (s: 'm' | 'f', a: boolean, fa = -1, mo = -1) => ({ s, a, fa, mo });

const FIGURES: TreeFig[] = [
  {
    type: 'tree',
    pr: true,
    n: [
      node(-1, '', ''),
      node(0, 'rot', '3/5'),
      node(0, 'blau', '?'),
      node(1, 'rot', '1/2'),
      node(1, 'blau', '1/2'),
    ],
    ask: 'edge',
    at: [],
  },
  {
    type: 'tree',
    pr: false,
    n: [node(-1, '8', ''), node(0, '3', '0'), node(0, '10', '1')],
    ask: 'none',
    at: [],
  },
  {
    type: 'pedigree',
    p: [person('m', false), person('f', false), person('f', true, 0, 1), person('m', false, 0, 1)],
    md: 'ar',
    ask: 'mode',
    at: 0,
  },
  {
    type: 'automaton',
    s: [
      { l: 'q0', f: true },
      { l: 'q1', f: false },
    ],
    t: [
      { a: 0, b: 1, c: '1' },
      { a: 1, b: 0, c: '1' },
      { a: 0, b: 0, c: '0' },
    ],
    w: '11',
  },
];

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

describe('TreeBody', () => {
  it.each(FIGURES.map((f, i) => [`${f.type} ${i}`, f] as const))('draws a %s', (_, figure) => {
    const { container } = renderInApp(<TreeBody figure={figure} width={266} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  // Its height follows its levels, not its width: narrowed alone it stayed as tall, and a card that
  // had to give room on 360×740 could not (#402). Shrunk, it is drawn smaller, every part alike.
  it.each(FIGURES.map((f, i) => [`${f.type} ${i}`, f] as const))(
    'shrinks a %s as a whole, laid out at its full width',
    (_, figure) => {
      const full = renderInApp(<TreeBody figure={figure} width={266} />).container;
      const height = Number(full.querySelector('svg')?.getAttribute('height'));
      const half = renderInApp(<TreeBody figure={figure} width={133} scale={0.5} />).container;
      const svg = half.querySelector('svg');
      expect(Number(svg?.getAttribute('height'))).toBe(Math.round(height / 2));
      expect(svg?.getAttribute('viewBox')).toBe(`0 0 266 ${height}`);
    },
  );
});

describe('describeTree', () => {
  it('reads every branch of a probability tree, the "?" as a word, no path probability', () => {
    const said = describeTree(FIGURES[0] as TreeFig, t);
    expect(said).toContain('"from":"figure.tree_root","to":"rot","label":"3/5"');
    expect(said).toContain('"to":"blau","label":"figure.tree_unknown"');
    expect(said).not.toContain('3/10');
  });

  it('names a plain tree’s root by its label', () => {
    expect(describeTree(FIGURES[1] as TreeFig, t)).toContain('"from":"8","to":"3","label":"0"');
  });

  it('reads every person of a pedigree with generation and parents, and no mode', () => {
    const said = describeTree(FIGURES[2] as TreeFig, t);
    expect(said).toContain('figure.pedigree {"gens":2}');
    expect(said).toContain('figure.pedigree_woman {"n":3,"gen":"II"}, figure.pedigree_affected');
    expect(said).toContain('figure.pedigree_child {"fa":1,"mo":2}');
    expect(said).not.toMatch(/rezessiv|recessive|ar\b/);
  });

  it('reads an automaton’s start, final states and transitions, not whether the word is accepted', () => {
    const said = describeTree(FIGURES[3] as TreeFig, t);
    expect(said).toContain('figure.automaton {"start":"q0","finals":"q0"}');
    expect(said).toContain('figure.automaton_move {"from":"q1","to":"q0","symbols":"1"}');
    expect(said).not.toContain('11');
  });
});
