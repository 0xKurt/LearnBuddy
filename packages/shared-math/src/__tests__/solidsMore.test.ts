// The rest of #255 (#368): prisms with a non-regular base, nets of solids, Würfelgebäude. Every
// key is computed here; a figure that breaks a rule is rejected, never repaired.

import { describe, expect, it } from 'vitest';

import {
  allSeen,
  cubeCount,
  cubesKey,
  cubesProblem,
  cubesView,
  viewChoiceHolds,
  type Cubes,
} from '../cubes.js';
import { solidNet } from '../solidNets.js';
import {
  solidCounts,
  solidDrawing,
  solidKey,
  solidMeasures,
  solidProblem,
  type Solid,
} from '../solids.js';

const solid = (over: Partial<Solid>): Solid => ({
  type: 'solid',
  k: 'cuboid',
  n: 0,
  a: 4,
  b: 3,
  h: 2,
  r: 0,
  u: 'cm',
  ask: 'none',
  ...over,
});

/** A lying prism with this base (its front face) and this length. */
const prism = (g: Array<[number, number]>, h: number, ask: Solid['ask'] = 'none'): Solid =>
  solid({ k: 'prism', n: g.length, a: 0, b: 0, h, g: g.map(([x, y]) => ({ x, y })), ask });

describe('a prism with a non-regular base (#368)', () => {
  it('computes volume and surface from the base it draws', () => {
    // A right triangle 3-4-5, 10 long: base 6, around 12.
    const tri = prism(
      [
        [0, 0],
        [4, 0],
        [0, 3],
      ],
      10,
      'surface',
    );
    expect(solidProblem(tri)).toBeNull();
    expect(solidMeasures(tri)).toEqual({ volume: 60, surface: 132 });
    expect(solidKey(tri)).toEqual({ kind: 'area', value: 132, unit: 'cm²' });
    // A trapezoid a = 6, c = 2, height 3, 5 long.
    const trap = prism(
      [
        [0, 0],
        [6, 0],
        [4, 3],
        [2, 3],
      ],
      5,
      'volume',
    );
    expect(solidProblem(trap)).toBeNull();
    expect(solidMeasures(trap).volume).toBe(60);
    // Euler, from the number of its corners.
    expect(solidCounts('prism', 4)).toEqual({ vertices: 8, edges: 12, faces: 6 });
  });

  it('draws the base in its true shape, its height dashed where a side is slanted', () => {
    const trap = prism(
      [
        [0, 0],
        [6, 0],
        [4, 3],
        [2, 3],
      ],
      5,
      'volume',
    );
    const d = solidDrawing(trap);
    // The base's sides 6 and 2, its height 3, the length 5 — the slanted legs (√13) are not written.
    expect(d.labels.map((l) => l.v).sort()).toEqual([2, 3, 5, 6]);
    expect(d.strokes.some((s) => s.hidden)).toBe(true);
  });

  it('rejects a base it cannot work with', () => {
    const bad = (g: Array<[number, number]>) => solidProblem(prism(g, 5));
    // Not convex.
    expect(
      bad([
        [0, 0],
        [4, 0],
        [2, 1],
        [2, 4],
      ]),
    ).toBe('measures');
    // No horizontal base line.
    expect(
      bad([
        [0, 1],
        [4, 0],
        [2, 3],
      ]),
    ).toBe('measures');
    // A quadrilateral with a slanted top: its area does not follow from what is drawn.
    expect(
      bad([
        [0, 0],
        [4, 0],
        [4, 2],
        [0, 3],
      ]),
    ).toBe('measures');
    // A house shape (five corners) is left out.
    expect(
      bad([
        [0, 0],
        [4, 0],
        [4, 2],
        [2, 4],
        [0, 2],
      ]),
    ).toBe('measures');
    // Flat, or off the grid.
    expect(
      bad([
        [0, 0],
        [2, 0],
        [4, 0],
      ]),
    ).toBe('measures');
    expect(
      bad([
        [0, 0],
        [4.5, 0],
        [0, 3],
      ]),
    ).toBe('measures');
    // n must count the corners; a regular side a is not set.
    expect(
      solidProblem({
        ...prism(
          [
            [0, 0],
            [4, 0],
            [0, 3],
          ],
          5,
        ),
        n: 4,
      }),
    ).toBe('measures');
    expect(
      solidProblem({
        ...prism(
          [
            [0, 0],
            [4, 0],
            [0, 3],
          ],
          5,
        ),
        a: 2,
      }),
    ).toBe('measures');
    // Only a prism has a non-regular base here.
    expect(
      solidProblem({
        ...prism(
          [
            [0, 0],
            [4, 0],
            [0, 3],
          ],
          5,
        ),
        k: 'pyramid',
      }),
    ).toBe('measures');
  });

  it('asks for a surface only when every side of the base is a number she can read', () => {
    // An isosceles triangle with legs √13: the volume is fine, the surface is not.
    const g: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [2, 3],
    ];
    expect(solidProblem(prism(g, 5, 'volume'))).toBeNull();
    expect(solidMeasures(prism(g, 5)).volume).toBe(30);
    expect(solidProblem(prism(g, 5, 'surface'))).toBe('ask');
  });
});

describe('nets of solids (#368)', () => {
  it('draws every face once, for every kind but the sphere', () => {
    const faces = (s: Solid) => solidNet(s)?.faces?.length ?? 0;
    expect(faces(solid({ k: 'cube', a: 3, b: 0, h: 0 }))).toBe(6);
    expect(faces(solid({}))).toBe(6);
    expect(faces(solid({ k: 'prism', n: 5, a: 2, b: 0, h: 4 }))).toBe(7);
    expect(
      faces(
        prism(
          [
            [0, 0],
            [4, 0],
            [0, 3],
          ],
          6,
        ),
      ),
    ).toBe(5);
    expect(faces(solid({ k: 'pyramid', n: 4, a: 4, b: 0, h: 3 }))).toBe(5);
    expect(faces(solid({ k: 'cylinder', a: 0, b: 0, r: 2, h: 5 }))).toBe(3);
    expect(faces(solid({ k: 'cone', a: 0, b: 0, r: 3, h: 4 }))).toBe(2);
    expect(solidNet(solid({ k: 'sphere', a: 0, b: 0, h: 0, r: 2 }))).toBeNull();
  });

  it('writes the cone’s side line and a pyramid’s face height as the net shows them', () => {
    const cone = solidNet(solid({ k: 'cone', a: 0, b: 0, r: 3, h: 4 }))!;
    expect(cone.labels.map((l) => l.v)).toEqual([5, 3]);
    const pyramid = solidNet(solid({ k: 'pyramid', n: 4, a: 6, b: 0, h: 4 }))!;
    expect(pyramid.labels.map((l) => l.v)).toEqual([6, 5]);
  });

  it('asks which solid a net folds into only of a net; a sphere has no net', () => {
    const net = (over: Partial<Solid>) => solid({ w: 'net', ask: 'kind', ...over });
    expect(solidProblem(net({}))).toBeNull();
    expect(solidKey(net({}))).toEqual({ kind: 'kind', k: 'cuboid' });
    expect(solidProblem(solid({ ask: 'kind' }))).toBe('ask');
    expect(solidProblem(net({ k: 'sphere', a: 0, b: 0, h: 0, r: 2, ask: 'none' }))).toBe('ask');
    // Every other key of a solid holds on its net too.
    expect(solidKey(net({ ask: 'surface' }))).toEqual({ kind: 'area', value: 52, unit: 'cm²' });
  });
});

const building = (g: number[][], over: Partial<Cubes> = {}): Cubes => ({
  type: 'cubes',
  g,
  v: 'oblique',
  ask: 'none',
  ...over,
});

describe('Würfelgebäude (#368)', () => {
  // Front row first: 2 1 0 / 3 2 1.
  const STAIRS = [
    [2, 1, 0],
    [3, 2, 1],
  ];

  it('counts the cubes; from a Schrägbild only when no column hides behind a taller one', () => {
    expect(cubeCount(STAIRS)).toBe(9);
    expect(allSeen(STAIRS)).toBe(true);
    expect(cubesKey(building(STAIRS, { ask: 'count' }))).toEqual({ kind: 'count', n: 9 });
    // A column of 1 behind a column of 3: it could be any height.
    const hidden = [
      [3, 0],
      [1, 0],
    ];
    expect(allSeen(hidden)).toBe(false);
    expect(cubesProblem(building(hidden, { ask: 'count' }))).toBe('ask');
    // The front-right neighbour hides it too (the depth runs to the right).
    expect(
      allSeen([
        [0, 3],
        [1, 0],
      ]),
    ).toBe(false);
    // The Bauplan shows every height: counted always.
    expect(cubesProblem(building(hidden, { v: 'plan', ask: 'count' }))).toBeNull();
  });

  it('computes the three views', () => {
    expect(cubesView(STAIRS, 'front')).toEqual([
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ]);
    // From the left: the front row on the left.
    expect(cubesView(STAIRS, 'side')).toEqual([
      [0, 1],
      [1, 1],
      [1, 1],
    ]);
    // From above: the front row at the bottom.
    expect(
      cubesView(
        [
          [1, 0],
          [1, 1],
        ],
        'top',
      ),
    ).toEqual([
      [1, 1],
      [1, 0],
    ]);
  });

  it('rejects a building that is no building, and a view that asks', () => {
    expect(cubesProblem(building([[0, 0]]))).toBe('structure');
    expect(cubesProblem(building([[1, 2], [1]]))).toBe('structure');
    expect(cubesProblem(building([[5]]))).toBe('structure');
    expect(cubesProblem(building([[1, 1, 1, 1, 1]]))).toBe('structure');
    expect(cubesProblem(building([[1]], { v: 'front', ask: 'count' }))).toBe('ask');
  });

  it('holds views as options to exactly one right one, and that one is the key', () => {
    const asked = building(STAIRS, { ask: 'front' });
    const view = (g: number[][]) => building(g, { v: 'front' });
    const options = [view([[1, 1, 1]]), view([[3, 2, 1]]), view([[1, 2, 3]])];
    expect(viewChoiceHolds(asked, options, 1)).toBe(true);
    expect(viewChoiceHolds(asked, options, 0)).toBe(false);
    // Two options that look alike, or none that is the building's.
    expect(viewChoiceHolds(asked, [view([[3, 2, 1]]), view([[3, 2, 1]])], 0)).toBe(false);
    expect(viewChoiceHolds(asked, [view([[1, 1]]), view([[2, 2]])], 0)).toBe(false);
    // An option of another direction is no answer to this one.
    expect(viewChoiceHolds(asked, [view([[3, 2, 1]]), building([[1]], { v: 'top' })], 0)).toBe(
      false,
    );
  });
});
