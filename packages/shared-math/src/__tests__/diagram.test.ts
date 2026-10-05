// Diagrams (issue #247): the structure rules, the layouts and the fit on the narrowest phone.
// Every layout is checked for what a learner would see: no box over another, no arrow through a
// box, no label over a box or a label, every text inside its box — at 360 px (`TREE_WIDTH`) for
// up to eight boxes, and the same drawing at a wider phone.

import { describe, expect, it } from 'vitest';

import {
  diagramLayout,
  diagramProblem,
  diagramShows,
  BOX_FONT,
  gapLetters,
  wrapWords,
  type Diagram,
  type DiagramBox,
  type DiagramLayout,
} from '../diagram.js';
import { textWidth } from '../labelBoxes.js';
import { TREE_WIDTH } from '../trees.js';

const arrow = (a: number, b: number, l = '') => ({ a, b, l });

const diagram = (k: Diagram['k'], n: string[], e: Diagram['e'], g: Diagram['g'] = []): Diagram => ({
  type: 'diagram',
  k,
  n,
  e,
  g,
});

const water = diagram(
  'cycle',
  ['Verdunstung', '?', 'Niederschlag', '?'],
  [arrow(0, 1), arrow(1, 2), arrow(2, 3), arrow(3, 0)],
);

const foodChain = diagram(
  'chain',
  ['Gras', 'Hase', 'Fuchs', 'Adler'],
  [arrow(0, 1), arrow(1, 2), arrow(2, 3)],
);

const powers = diagram(
  'tree',
  ['Staatsgewalt', 'Legislative', 'Exekutive', 'Judikative'],
  [arrow(0, 1), arrow(0, 2), arrow(0, 3)],
);

/** Regelkreis Blutzucker on a 2 × 3 grid: the sensor reports back to the controller. */
const control = diagram(
  'free',
  ['Sollwert', 'Regler', 'Stellglied', 'Blutzucker', 'Messfühler'],
  [arrow(0, 1), arrow(1, 2), arrow(2, 3), arrow(3, 4), arrow(4, 1, 'Istwert')],
  [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 1, r: 1 },
    { c: 1, r: 2 },
    { c: 0, r: 1 },
  ],
);

type Rect = { x: number; y: number; w: number; h: number };
const meet = (p: Rect, q: Rect) =>
  p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

/** What a learner would see go wrong in a layout at `width`. */
function flaws(layout: DiagramLayout, width: number): string[] {
  const out: string[] = [];
  layout.boxes.forEach((b, i) => {
    if (b.x < 0 || b.x + b.w > width || b.y < 0 || b.y + b.h > layout.height) out.push(`box ${i}`);
    for (const line of b.lines) {
      if (textWidth(line, BOX_FONT) > b.w) out.push(`text ${i}`);
    }
    layout.boxes.forEach((o, j) => {
      if (j > i && meet(b, o)) out.push(`boxes ${i} ${j}`);
    });
  });
  return out;
}

describe('diagram structure (Regel 0: rejected, never repaired)', () => {
  it('holds for the schoolbook diagrams', () => {
    for (const d of [water, foodChain, powers, control]) expect(diagramProblem(d)).toBeNull();
  });

  it('rejects arrows to boxes that do not exist, loops and doubled arrows', () => {
    expect(diagramProblem({ ...foodChain, e: [...foodChain.e.slice(0, 2), arrow(2, 5)] })).toBe(
      'structure',
    );
    expect(diagramProblem({ ...foodChain, e: [...foodChain.e, arrow(1, 1)] })).toBe('structure');
    expect(diagramProblem({ ...control, e: [...control.e, arrow(0, 1)] })).toBe('structure');
  });

  it('rejects a box without an arrow, two pieces and a text shown twice', () => {
    const orphan = diagram(
      'free',
      ['A', 'B', 'C'],
      [arrow(0, 1)],
      [
        { c: 0, r: 0 },
        { c: 1, r: 0 },
        { c: 2, r: 0 },
      ],
    );
    expect(diagramProblem(orphan)).toBe('structure');
    const pieces = diagram(
      'free',
      ['A', 'B', 'C', 'D'],
      [arrow(0, 1), arrow(2, 3)],
      [
        { c: 0, r: 0 },
        { c: 1, r: 0 },
        { c: 0, r: 1 },
        { c: 1, r: 1 },
      ],
    );
    expect(diagramProblem(pieces)).toBe('structure');
    expect(diagramProblem({ ...foodChain, n: ['Gras', 'Hase', 'hase ', 'Adler'] })).toBe(
      'structure',
    );
  });

  it('holds each kind to its shape', () => {
    // A chain that closes into a cycle, a cycle that does not close, a tree with two roots.
    expect(diagramProblem({ ...foodChain, e: [...foodChain.e, arrow(3, 0)] })).toBe('shape');
    expect(diagramProblem({ ...water, e: water.e.slice(0, 3) })).toBe('shape');
    expect(diagramProblem({ ...water, k: 'cycle', e: [...water.e.slice(0, 3), arrow(3, 1)] })).toBe(
      'shape',
    );
    expect(diagramProblem({ ...powers, e: [arrow(0, 1), arrow(0, 2), arrow(3, 2)] })).toBe('shape');
    expect(
      diagramProblem({ ...foodChain, k: 'chain', e: [arrow(0, 1), arrow(0, 2), arrow(2, 3)] }),
    ).toBe('shape');
    // Grid cells only for a free diagram, one per box, never two on one cell.
    expect(diagramProblem({ ...foodChain, g: [{ c: 0, r: 0 }] })).toBe('shape');
    expect(diagramProblem({ ...control, g: control.g.slice(0, 4) })).toBe('shape');
    expect(diagramProblem({ ...control, g: [...control.g.slice(0, 4), { c: 0, r: 0 }] })).toBe(
      'shape',
    );
  });

  it('letters at most three gaps, and only in boxes', () => {
    expect(gapLetters(water)).toEqual([null, 'A', null, 'B']);
    const four = diagram(
      'cycle',
      ['?', '?', '?', '?', 'Meer'],
      [arrow(0, 1), arrow(1, 2), arrow(2, 3), arrow(3, 4), arrow(4, 0)],
    );
    expect(diagramProblem(four)).toBe('gaps');
    expect(diagramProblem({ ...foodChain, e: [arrow(0, 1, '?'), ...foodChain.e.slice(1)] })).toBe(
      'gaps',
    );
  });
});

describe('diagram layout on the narrowest phone', () => {
  it('draws a short chain in one row and a long one as a snake', () => {
    const one = diagramLayout(foodChain, TREE_WIDTH);
    expect(new Set(one?.boxes.map((b) => b.y))).toHaveProperty('size', 1);
    const long = diagram(
      'chain',
      ['Sonnenlicht', 'Pflanzen', 'Pflanzenfresser', 'Fleischfresser', 'Zersetzer'],
      [arrow(0, 1), arrow(1, 2), arrow(2, 3), arrow(3, 4)],
    );
    expect(diagramProblem(long)).toBeNull();
    const rows = new Set(diagramLayout(long, TREE_WIDTH)?.boxes.map((b) => b.y));
    expect(rows.size).toBeGreaterThan(1);
  });

  it('draws a cycle as a ring, clockwise from the top left', () => {
    const layout = diagramLayout(water, TREE_WIDTH) as DiagramLayout;
    const [a, b, c, d] = layout.boxes as [DiagramBox, DiagramBox, DiagramBox, DiagramBox];
    expect(a.y).toBe(b.y);
    expect(a.x).toBeLessThan(b.x);
    expect(c.x).toBe(b.x);
    expect(c.y).toBeGreaterThan(b.y);
    expect(d.x).toBe(a.x);
    expect(d.y).toBe(c.y);
  });

  it('lays out every kind with up to eight boxes without a flaw, at 360 px and wider', () => {
    const words = ['Wasser', 'Wolke', 'Regen', 'Boden', 'Fluss', 'Meer', 'Dampf', 'Eis'];
    const cases: Diagram[] = [];
    for (let n = 2; n <= 8; n++) {
      const n0 = words.slice(0, n);
      const path = n0.slice(1).map((_, i) => arrow(i, i + 1));
      cases.push(diagram('chain', n0, path));
      cases.push(diagram('cycle', n0, [...path, arrow(n - 1, 0)]));
      cases.push(
        diagram(
          'free',
          n0,
          path,
          n0.map((_, i) => ({ c: i % 2 === 0 ? 0 : 1, r: Math.floor(i / 2) })),
        ),
      );
    }
    // A tree of three levels: a root, two children, up to five grandchildren.
    cases.push(
      diagram(
        'tree',
        ['Tiere', 'Wirbeltiere', 'Wirbellose', 'Fische', 'Vögel', 'Insekten'],
        [arrow(0, 1), arrow(0, 2), arrow(1, 3), arrow(1, 4), arrow(2, 5)],
      ),
    );
    for (const d of cases) {
      expect(diagramProblem(d), `${d.k} ${d.n.length}`).toBeNull();
      for (const width of [TREE_WIDTH, 300, 420]) {
        const layout = diagramLayout(d, width) as DiagramLayout;
        expect(flaws(layout, width), `${d.k} ${d.n.length} at ${width}`).toEqual([]);
      }
    }
  });

  it('rejects a word too long for its box and a diagram too tall for the phone', () => {
    expect(
      diagramProblem({
        ...powers,
        n: ['Staatsgewalt', 'Gesetzgebungsorgane', 'Exekutive', 'Judikative'],
      }),
    ).toBe('too_wide');
    const tall = diagram(
      'chain',
      [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `Wort${i}aaaa Wort${i}bbbb Wort${i}cccc`),
      [0, 1, 2, 3, 4, 5, 6].map((i) => arrow(i, i + 1)),
    );
    expect(diagramProblem(tall)).toBe('too_wide');
  });

  it('rejects an arrow through another box and a label that covers a box', () => {
    const through = diagram(
      'free',
      ['Links', 'Mitte', 'Rechts'],
      [arrow(0, 2), arrow(1, 2)],
      [
        { c: 0, r: 0 },
        { c: 1, r: 0 },
        { c: 2, r: 0 },
      ],
    );
    expect(diagramProblem(through)).toBe('overlap');
    // A long label on a slanted arrow in a narrow tree lands on a box.
    const covered = diagram(
      'tree',
      ['Wurzel', 'Links', 'Mitte', 'Rechts'],
      [arrow(0, 1, 'Langerpfeiltext'), arrow(0, 2), arrow(0, 3)],
    );
    expect(diagramProblem(covered)).toBe('overlap');
  });

  it('runs a way back beside the way there, with room for both labels', () => {
    const economy = diagram(
      'free',
      ['Haushalte', 'Unternehmen'],
      [arrow(0, 1, 'Konsum'), arrow(1, 0, 'Einkommen')],
      [
        { c: 0, r: 0 },
        { c: 0, r: 1 },
      ],
    );
    expect(diagramProblem(economy)).toBeNull();
    const [there, back] = (diagramLayout(economy, TREE_WIDTH) as DiagramLayout).arrows;
    expect(there?.from.x).not.toBe(back?.from.x);
    expect(there?.label?.anchor).not.toBe(back?.label?.anchor);
  });
});

/**
 * Widths in px at 12 px, regular, as Chromium draws them in DejaVu Sans (the walkthrough's font,
 * wider than San Francisco and Roboto), measured 04.10.2026 with canvas `measureText` and rounded
 * up to a tenth.
 */
const MEASURED: [string, number][] = [
  ['Legislative', 64.3],
  ['Verdunstung', 76],
  ['Pflanzenfresser', 92.2],
  ['WASSERDAMPF', 92.4],
  ['Mmmmmmmmmm', 115.6],
  ['Wwwwwwwww', 90.4],
  ['Konsumausgaben', 106.6],
  ['1234567890', 76.4],
  ['Oberflächenabfluss', 116.2],
  ['Bauchspeicheldrüse', 120.7],
  ['Sauerstoff', 61.5],
  ['Zersetzer', 57.5],
  ['Bundestag', 64.4],
  ['Gesetzentwurf', 87.6],
  ['ÄÖÜ Größe', 66.3],
  ['xyzkqvbhp', 65.1],
  ['Messfühler', 65.4],
];

describe('textWidth', () => {
  it('is never narrower than the text as the browser draws it', () => {
    for (const [text, px] of MEASURED) expect(textWidth(text, 12), text).toBeGreaterThanOrEqual(px);
  });
});

describe('wrapWords and diagramShows', () => {
  it('wraps between words, never inside one', () => {
    expect(wrapWords('Wasser verdunstet im Meer', 80)).toEqual(['Wasser', 'verdunstet', 'im Meer']);
    expect(wrapWords('Oberflächenabfluss', 80)).toBeNull();
    expect(wrapWords('a b c d e f g h', 8)).toBeNull();
  });

  it('finds a text in a box or on an arrow as a whole word, never in a gap', () => {
    expect(diagramShows(water, 'niederschlag')).toBe(true);
    expect(diagramShows(water, 'Kondensation')).toBe(false);
    expect(diagramShows(water, '?')).toBe(false);
    expect(diagramShows(water, 'Schlag')).toBe(false);
    expect(diagramShows(control, 'Istwert')).toBe(true);
  });
});
