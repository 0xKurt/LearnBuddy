// Solids, cube nets and points in space next to a question (issue #255): every kind draws
// without crashing, a count question shows no measures, and what a screen reader hears is the
// figure in words — the kind and its measures, the squares, each point's path — and never the
// key code computed (no volume, no edge count, no "folds", no vector).
// Since #368 also a prism with a non-regular base, nets of solids and Würfelgebäude: a net that
// asks which solid it is never names it, a building is read row by row, a view square by square.
//
// Geometry (fit at 360 and 390 px, light and dark) is tests/web/solids.spec.ts.

import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { describeSpace, SpaceBody, type SpaceFig } from '../SolidFigures.js';

const solid = (
  k: 'cube' | 'cuboid' | 'prism' | 'pyramid' | 'cylinder' | 'cone' | 'sphere',
  m: Partial<Record<'n' | 'a' | 'b' | 'h' | 'r', number>>,
  ask: 'none' | 'edges' | 'volume' = 'volume',
  more: { g?: Array<{ x: number; y: number }>; w?: 'oblique' | 'net'; ask?: 'kind' } = {},
): SpaceFig => ({
  type: 'solid',
  k,
  n: 0,
  a: 0,
  b: 0,
  h: 0,
  r: 0,
  u: 'cm',
  ask,
  g: [],
  w: 'oblique',
  ...m,
  ...more,
});

const cells = (rows: string[]) =>
  rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === '#' ? [{ x, y }] : [])));

const FIGURES: SpaceFig[] = [
  solid('cube', { a: 3 }),
  solid('cuboid', { a: 5, b: 3, h: 2 }),
  solid('prism', { n: 6, a: 2, h: 4 }, 'edges'),
  solid('pyramid', { n: 4, a: 6, h: 4 }),
  solid('cylinder', { r: 3, h: 5 }),
  solid('cone', { r: 3, h: 8 }),
  solid('sphere', { r: 3 }),
  { type: 'cube_net', c: cells(['.#..', '####', '.#..']), ask: 'fold', at: 0 },
  { type: 'cube_net', c: cells(['###..', '..###']), ask: 'opposite', at: 1 },
  {
    type: 'axes3d',
    p: [
      { l: 'A', x: 2, y: 3, z: 2 },
      { l: 'B', x: 1, y: 4, z: 3 },
    ],
    v: [{ a: 0, b: 1 }],
    ask: 'vector',
    i: 0,
    j: 1,
  },
  // #368: a lying trapezoid prism, nets of five solids, a building, its plan and a view.
  solid('prism', { n: 4, h: 5 }, 'volume', {
    g: [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 4, y: 3 },
      { x: 2, y: 3 },
    ],
  }),
  solid('cuboid', { a: 5, b: 3, h: 2 }, 'none', { w: 'net', ask: 'kind' }),
  solid('prism', { n: 3, a: 3, h: 5 }, 'none', { w: 'net' }),
  solid('pyramid', { n: 4, a: 6, h: 4 }, 'none', { w: 'net' }),
  solid('cylinder', { r: 2, h: 5 }, 'none', { w: 'net' }),
  solid('cone', { r: 3, h: 4 }, 'none', { w: 'net' }),
  {
    type: 'cubes',
    g: [
      [2, 1, 0],
      [3, 2, 1],
    ],
    v: 'oblique',
    ask: 'count',
  },
  {
    type: 'cubes',
    g: [
      [1, 0],
      [2, 3],
    ],
    v: 'plan',
    ask: 'count',
  },
  { type: 'cubes', g: [[3, 2, 1]], v: 'front', ask: 'none' },
];

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

describe('SpaceBody', () => {
  it.each(FIGURES.map((f, i) => [`${f.type} ${i}`, f] as const))('draws a %s', (_, figure) => {
    const { container } = renderInApp(<SpaceBody figure={figure} width={266} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('writes the measures on a solid, but not where the edges are counted', () => {
    const cuboid = renderInApp(<SpaceBody figure={FIGURES[1]!} width={266} />);
    expect(cuboid.container.textContent).toContain('5 cm');
    const prism = renderInApp(<SpaceBody figure={FIGURES[2]!} width={266} />);
    expect(prism.container.textContent).not.toContain('cm');
  });

  it('numbers the squares of a net only when the question names them', () => {
    const fold = renderInApp(<SpaceBody figure={FIGURES[7]!} width={266} />);
    expect(fold.container.textContent).toBe('');
    const opposite = renderInApp(<SpaceBody figure={FIGURES[8]!} width={266} />);
    expect(opposite.container.textContent).toContain('6');
  });
});

describe('describeSpace', () => {
  it('reads a solid’s kind and measures, never its volume', () => {
    const said = describeSpace(FIGURES[1]!, t);
    expect(said).toContain('figure.solid_cuboid');
    expect(said).toContain('figure.solid_b {"v":"3 cm"}');
    expect(said).not.toContain('30');
    expect(describeSpace(FIGURES[2]!, t)).toBe(
      'figure.solid {"kind":"figure.solid_prism {\\"n\\":6}"}',
    );
  });

  it('reads the squares of a net row by row, numbered when the question names them', () => {
    // The list sits inside the outer key's values, so its quotes come escaped.
    const plain = (f: SpaceFig) => describeSpace(f, t).replace(/\\"/g, '"');
    expect(plain(FIGURES[7]!)).toContain('figure.net_row {"row":2,"cols":"1, 2, 3, 4"}');
    expect(plain(FIGURES[8]!)).toContain('figure.net_square {"n":2,"row":1,"col":2}');
  });

  it('reads every point’s path and every arrow, not the vector', () => {
    const said = describeSpace(FIGURES[9]!, t);
    expect(said).toContain('figure.axes3d_point {"l":"A","x":"2","y":"3","z":"2"}');
    expect(said).toContain('figure.arrow_to {"a":"A","b":"B"}');
    expect(said).not.toContain('-1');
  });
});

describe('the rest of #255 (#368)', () => {
  const plain = (f: SpaceFig) => describeSpace(f, t).replace(/\\"/g, '"');

  it('writes the base’s plain sides, its height and the length on a lying prism', () => {
    const { container } = renderInApp(<SpaceBody figure={FIGURES[10]!} width={266} />);
    for (const v of ['6 cm', '2 cm', '3 cm', '5 cm']) expect(container.textContent).toContain(v);
    expect(plain(FIGURES[10]!)).toContain('figure.solid_base {"sides":"6 cm, 2 cm"}');
  });

  it('fills the faces of a net, and never names the solid it asks about', () => {
    const { container } = renderInApp(<SpaceBody figure={FIGURES[11]!} width={266} />);
    const filled = container.querySelectorAll('path[fill]:not([fill="none"])');
    expect(filled.length).toBeGreaterThanOrEqual(6);
    expect(describeSpace(FIGURES[11]!, t)).toContain('figure.solid_net_any');
    expect(describeSpace(FIGURES[11]!, t)).not.toContain('cuboid');
    expect(describeSpace(FIGURES[12]!, t)).toContain('figure.solid_net {');
  });

  it('reads a building row by row from the front, a view square by square', () => {
    expect(plain(FIGURES[16]!)).toContain('figure.cubes_row {"n":2,"h":"3, 2, 1"}');
    expect(plain(FIGURES[17]!)).toContain('figure.cubes_plan');
    expect(plain(FIGURES[18]!)).toBe('figure.cubes_front {"rows":"■□□ / ■■□ / ■■■"}');
    // The plan writes each column's height in its square (each text twice: halo and ink).
    const plan = renderInApp(<SpaceBody figure={FIGURES[17]!} width={266} />);
    expect(plan.container.textContent).toBe('112233');
  });
});
