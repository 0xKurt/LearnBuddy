// Diagrams next to a question (issue #247): every kind draws without crashing, a gap shows its
// letter and never its answer, and what a screen reader hears is the diagram in words — its kind,
// every arrow with its label, a gap by its letter.
//
// Layout and fit are packages/shared-math/src/__tests__/diagram.test.ts; the drawing at 360 and
// 390 px, light and dark, is tests/web/diagrams.spec.ts.

import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { DiagramBody, describeDiagram, type DiagramFig } from '../DiagramFigures.js';

const arrow = (a: number, b: number, l = '') => ({ a, b, l });

const water: DiagramFig = {
  type: 'diagram',
  k: 'cycle',
  n: ['Verdunstung', '?', 'Niederschlag', '?'],
  e: [arrow(0, 1), arrow(1, 2), arrow(2, 3), arrow(3, 0)],
  g: [],
};

const FIGURES: DiagramFig[] = [
  water,
  {
    type: 'diagram',
    k: 'chain',
    n: ['Gras', 'Hase', 'Fuchs'],
    e: [arrow(0, 1, 'frisst'), arrow(1, 2)],
    g: [],
  },
  {
    type: 'diagram',
    k: 'tree',
    n: ['Staatsgewalt', 'Legislative', 'Exekutive', 'Judikative'],
    e: [arrow(0, 1), arrow(0, 2), arrow(0, 3)],
    g: [],
  },
  {
    type: 'diagram',
    k: 'free',
    n: ['Haushalte', 'Unternehmen'],
    e: [arrow(0, 1, 'Arbeit'), arrow(1, 0, 'Lohn')],
    g: [
      { c: 0, r: 0 },
      { c: 0, r: 1 },
    ],
  },
];

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

describe('DiagramBody', () => {
  it.each(FIGURES.map((f) => [f.k, f] as const))('draws a %s', (_, figure) => {
    const { container } = renderInApp(<DiagramBody figure={figure} width={266} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('draws a gap as its letter', () => {
    const { container } = renderInApp(<DiagramBody figure={water} width={266} />);
    const text = container.textContent ?? '';
    expect(text).toContain('A');
    expect(text).toContain('B');
    expect(text).not.toContain('?');
  });
});

describe('describeDiagram', () => {
  it('says the kind, every arrow and a gap by its letter', () => {
    const said = describeDiagram(water, t);
    expect(said).toContain('figure.diagram {"kind":"figure.diagram_cycle","n":4}');
    expect(said).toContain(
      'figure.arrow_to {"a":"Verdunstung","b":"figure.diagram_gap {\\"letter\\":\\"A\\"}"}',
    );
    expect(said).not.toContain('?');
  });

  it('reads an arrow’s label', () => {
    const said = describeDiagram(FIGURES[1] as DiagramFig, t);
    expect(said).toContain('figure.arrow_to_label {"a":"Gras","b":"Hase","label":"frisst"}');
    expect(said).toContain('figure.arrow_to {"a":"Hase","b":"Fuchs"}');
  });
});
