// A figure with an explanation (issue #298): taken as written or not at all.

import { describe, expect, it } from 'vitest';

import { checkExplainFigure, explainFigure } from '../explainFigure.js';

const parabolas = {
  type: 'function_plot',
  functions: [
    { expr: 'x^2', label: 'a = 1' },
    { expr: '2*x^2', label: 'a = 2' },
    { expr: '0.5*x^2', label: 'a = 0,5' },
  ],
  x_min: -3,
  x_max: 3,
  y_min: -1,
  y_max: 9,
  points: [{ x: 0, y: 0, label: 'Scheitel' }],
};

describe('checkExplainFigure', () => {
  it('accepts the parabola that changes with a', () => {
    expect(checkExplainFigure(parabolas)).toEqual({ ok: true, figure: parabolas });
  });

  it('rejects a curve the grammar cannot read — the whole figure, not just the curve', () => {
    const bad = {
      ...parabolas,
      functions: [...parabolas.functions.slice(0, 2), { expr: 'x²+', label: null }],
    };
    expect(checkExplainFigure(bad)).toEqual({ ok: false, reason: 'expression' });
    expect(explainFigure(bad)).toBeNull();
  });

  it('rejects an empty or inverted window and a curve that is undefined across it', () => {
    expect(checkExplainFigure({ ...parabolas, x_min: 3, x_max: -3 })).toMatchObject({
      reason: 'window',
    });
    expect(
      checkExplainFigure({
        ...parabolas,
        functions: [{ expr: 'sqrt(x)', label: null }],
        x_min: -10,
        x_max: 1,
        points: [],
      }),
    ).toMatchObject({ reason: 'undefined_curve' });
  });

  it('rejects a window in which nothing can be seen, and a point outside it', () => {
    expect(checkExplainFigure({ ...parabolas, y_min: 100, y_max: 200, points: [] })).toMatchObject({
      reason: 'nothing_visible',
    });
    expect(
      checkExplainFigure({ ...parabolas, points: [{ x: 5, y: 25, label: null }] }),
    ).toMatchObject({ reason: 'point_outside' });
  });

  it('checks the other figures of the library by their own bounds', () => {
    expect(
      checkExplainFigure({
        type: 'number_line',
        min: 0,
        max: 10,
        step: 1,
        points: [{ value: 11, label: null }],
      }),
    ).toMatchObject({ reason: 'point_outside' });
    expect(
      checkExplainFigure({ type: 'number_line', min: 0, max: 1000, step: 1, points: [] }),
    ).toMatchObject({ reason: 'ticks' });
    expect(
      checkExplainFigure({ type: 'fraction', shape: 'bar', fractions: [{ parts: 3, filled: 4 }] }),
    ).toMatchObject({ reason: 'fraction' });
    expect(
      checkExplainFigure({ type: 'table', header: ['x', 'y'], rows: [['1', '2', '3']] }),
    ).toMatchObject({ reason: 'table' });
    expect(
      checkExplainFigure({
        type: 'geometry',
        points: [
          { name: 'A', x: 0, y: 0 },
          { name: 'B', x: 1, y: 0 },
        ],
        segments: [{ from: 'A', to: 'C' }],
        polygons: [],
        circles: [],
      }),
    ).toMatchObject({ reason: 'reference' });
  });

  it('refuses what is not a figure of the library at all (a note line is not the model’s)', () => {
    expect(checkExplainFigure({ type: 'staff', notes: [] })).toEqual({
      ok: false,
      reason: 'shape',
    });
    expect(explainFigure(null)).toBeNull();
    expect(explainFigure('a parabola')).toBeNull();
  });

  it('holds geometry and molecules to the same check a question’s figure gets (figureCheck.ts)', () => {
    // A right angle drawn as one: kept.
    const square = {
      type: 'geometry',
      points: [
        { name: 'A', x: 0, y: 0 },
        { name: 'B', x: 4, y: 0 },
        { name: 'C', x: 4, y: 3 },
      ],
      segments: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'A' },
      ],
      polygons: [],
      circles: [],
    };
    expect(checkExplainFigure(square).ok).toBe(true);
    // Water with a carbon's worth of hydrogens on the oxygen: the shell does not hold.
    const broken = {
      type: 'molecule',
      style: 'structural',
      atoms: [{ id: 'a1', el: 'O', h: 4, charge: 0 }],
      bonds: [],
    };
    expect(checkExplainFigure(broken)).toMatchObject({ ok: false });
  });
});
