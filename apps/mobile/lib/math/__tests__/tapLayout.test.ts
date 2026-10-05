// Where a tap lands on a figure (issue #248): a finger anywhere on the drawing snaps to the nearest
// place, every place is reached by a tap on its own mark, and the marks stand where the drawers
// paint — because both read the same geometry (`figureGeometry.ts`, `functionPlotGeometry`).

import { describe, expect, it } from 'vitest';

import { MAP_SHAPES } from '../../../../../packages/shared-math/src/mapShapes.data.js';
import { SCHEMATIC_SHAPES } from '../../../../../packages/shared-math/src/schematicShapes.data.js';
import { mapRegion } from '../../../../../packages/shared-math/src/maps.js';
import { tapAxes, type Tappable } from '../../../../../packages/shared-math/src/tap.js';
import { barChartGeometry, clockGeometry, numberLineGeometry } from '../figureGeometry.js';
import { functionPlotGeometry } from '../plotLayout.js';
import { tapLayout } from '../tapLayout.js';

const format = (n: number) => String(n);
const layoutOf = (f: Tappable, width = 328) => {
  const l = tapLayout(f, width, format, 12);
  if (!l) throw new Error('no layout');
  return l;
};

const line: Tappable = { type: 'number_line', min: 0, max: 5, step: 0.5, points: [] };
const plane: Tappable = {
  type: 'function_plot',
  x_min: -4,
  x_max: 4,
  y_min: -4,
  y_max: 4,
  points: [],
};
const bars = (n: number): Tappable => ({
  type: 'bar_chart',
  bars: Array.from({ length: n }, (_, i) => ({ label: `B${i}`, value: i + 1 })),
});
const clock: Tappable = { type: 'clock', c: [], h24: false, ask: 'none' };

/** Every pick of a figure's grid. */
function everyPick(f: Tappable): number[][] {
  return (tapAxes(f) ?? []).reduce<number[][]>(
    (acc, axis) => acc.flatMap((p) => axis.values.map((_, i) => [...p, i])),
    [[]],
  );
}

describe('a tap on the mark of a place picks that place', () => {
  it.each([
    ['number line', line],
    ['coordinate system', plane],
    ['upright columns', bars(5)],
    ['rows', bars(8)],
  ])('%s, at 328 and 260 pt', (_, f) => {
    for (const width of [328, 260]) {
      const l = layoutOf(f, width);
      for (const pick of everyPick(f)) {
        const mark = l.markOf(pick);
        if (!mark) throw new Error('a mark');
        const at =
          mark.kind === 'box'
            ? { x: mark.box.x + mark.box.w / 2, y: mark.box.y + mark.box.h / 2 }
            : mark;
        expect(l.pickAt(at.x, at.y, null, 0)).toEqual(pick);
      }
    }
  });
});

describe('a map (#251): every Land and every continent by its label', () => {
  it.each([
    ['the 16 Länder', { type: 'map', v: 'de', hl: [] } as const],
    ['the continents', { type: 'map', v: 'world', hl: [] } as const],
  ])('%s, at 328 and 260 pt', (_, f) => {
    for (const width of [328, 260]) {
      const l = tapLayout(f, width, format, 12, { maps: MAP_SHAPES });
      if (!l) throw new Error('no layout');
      for (const pick of everyPick(f)) {
        const mark = l.markOf(pick);
        if (mark?.kind !== 'region') throw new Error('a region');
        expect(l.pickAt(mark.x, mark.y, null, 0)).toEqual(pick);
      }
    }
  });

  it('marks the whole region, drawn at the width of the map', () => {
    const de = { type: 'map', v: 'de', hl: [] } as const;
    const by = mapRegion('de', 'Bayern') ?? -1;
    const mark = tapLayout(de, 300, format, 12, { maps: MAP_SHAPES })?.markOf([by]);
    expect(mark?.kind).toBe('region');
    if (mark?.kind !== 'region') return;
    const xs = [...mark.d.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));
    expect(Math.max(...xs)).toBeLessThanOrEqual(300);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
  });

  it('a labelled picture (#252): every part by its own point, no shapes to load', () => {
    for (const d of ['plant_cell', 'eye', 'bicycle'] as const) {
      const f = { type: 'schematic', d, n: [], ask: 0 } as const;
      const l = tapLayout(f, 300, format, 12, { pictures: SCHEMATIC_SHAPES });
      if (!l) throw new Error('no layout');
      for (const pick of everyPick(f)) {
        const mark = l.markOf(pick);
        if (mark?.kind !== 'region') throw new Error('a part');
        expect(mark.outline).toBe(true);
        expect(l.pickAt(mark.x, mark.y, null, 0)).toEqual(pick);
      }
    }
  });

  it('offers nothing to tap until the shapes are loaded', () => {
    expect(tapLayout({ type: 'map', v: 'de', hl: [] }, 300, format, 12)).toBeNull();
  });
});

describe('the marks stand where the drawers paint', () => {
  it('a place of the number line on its tick, on the axis', () => {
    const g = numberLineGeometry(line, 328);
    expect(layoutOf(line).markOf([5])).toEqual({ kind: 'dot', x: g.x(2.5), y: g.axisY });
  });

  it('a grid point where the plot puts that value', () => {
    const g = functionPlotGeometry(plane, 328, { bare: false, format, fontSize: 12 });
    // (2 | −1): x index 6 of −4…4, y index 3.
    expect(layoutOf(plane).markOf([6, 3])).toEqual({ kind: 'dot', x: g.X(2), y: g.Y(-1) });
  });

  it('every whole number of the plot has a line, also where its own grid skips one', () => {
    const g = functionPlotGeometry(plane, 328, { bare: false, format, fontSize: 12 });
    const guides = layoutOf(plane).guides;
    const drawn = new Set([...g.xTicks.map(g.X), ...g.yTicks.map(g.Y)].map(Math.round));
    const xs = guides.filter((l) => l.x1 === l.x2).map((l) => Math.round(l.x1));
    const ys = guides.filter((l) => l.y1 === l.y2).map((l) => Math.round(l.y1));
    for (let v = -4; v <= 4; v++) {
      expect(drawn.has(Math.round(g.X(v))) || xs.includes(Math.round(g.X(v))), `x ${v}`).toBe(true);
      expect(drawn.has(Math.round(g.Y(v))) || ys.includes(Math.round(g.Y(v))), `y ${v}`).toBe(true);
    }
  });

  it('a column frames the band its bar owns', () => {
    const g = barChartGeometry(
      {
        bars: [
          { label: 'a', value: 1 },
          { label: 'b', value: 2 },
        ],
      },
      328,
    );
    expect(layoutOf(bars(2)).markOf([1])).toEqual({ kind: 'box', box: g.slot(1) });
  });
});

describe('a finger between places snaps to the nearest one', () => {
  it('on the number line, also outside its ends', () => {
    const g = numberLineGeometry(line, 328);
    const l = layoutOf(line);
    const between = g.x(2.5) + (g.x(3) - g.x(2.5)) * 0.4;
    expect(l.pickAt(between, 0, null, 0)).toEqual([5]);
    expect(l.pickAt(-50, 200, null, 0)).toEqual([0]);
    expect(l.pickAt(5000, 0, null, 0)).toEqual([10]);
  });

  it('in the coordinate system, each axis on its own', () => {
    const g = functionPlotGeometry(plane, 328, { bare: false, format, fontSize: 12 });
    const l = layoutOf(plane);
    expect(l.pickAt(g.X(1.8), g.Y(-1.3), null, 0)).toEqual([6, 3]);
  });
});

describe('a clock face is set one hand at a time', () => {
  const width = 328;
  const { d } = clockGeometry(1, width);
  const cx = width / 2;
  const cy = d / 2;
  const at = (deg: number, r = d / 3) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
  };

  it('the small hand takes the hour it points at, the large one keeps its minutes', () => {
    const l = layoutOf(clock, width);
    // At the 7 (210°): the 7th hour is index 6. Nothing set yet: the large hand on the 12.
    expect(l.pickAt(...at(210), null, 0)).toEqual([6, 0]);
    expect(l.pickAt(...at(212), [2, 9], 0)).toEqual([6, 9]);
    // At the 12 the hour is 12 (index 11).
    expect(l.pickAt(...at(3), null, 0)).toEqual([11, 0]);
  });

  it('the large hand takes the mark it points at, the small one keeps its hour', () => {
    const l = layoutOf(clock, width);
    // At the 9 (270°): 45 minutes, index 9. Nothing set yet: the small hand on the 12.
    expect(l.pickAt(...at(268), [6, 0], 1)).toEqual([6, 9]);
    expect(l.pickAt(...at(268), null, 1)).toEqual([11, 9]);
    // Anywhere on the drawing counts, also beside the face: the direction decides.
    expect(l.pickAt(0, cy, [6, 0], 1)).toEqual([6, 9]);
  });

  it('shows the place by its hands, not by a mark', () => {
    expect(layoutOf(clock).markOf([6, 9])).toBeNull();
  });
});

it('a figure that offers no places has no layout', () => {
  expect(tapLayout({ ...clock, c: [{ h: 7, m: 45 }] }, 328, format, 12)).toBeNull();
});
