// Where the places of a tappable figure stand on the screen (issue #248): which place a finger at
// (x, y) means, and where the chosen place is marked. The places themselves — the grid, the answer
// a place stands for — are @learnbuddy/shared-math `tap.ts`, the same code the server checked the
// key with; the positions come from the very geometry the drawers paint with
// (`figureGeometry.ts`, `functionPlotGeometry`). Pure, so a tap can be tested without a screen.
//
// A tap never misses: it snaps to the nearest place (the nearest tick, grid point, column, or the
// nearest of the twelve marks of the clock), so the whole figure is one big target and the
// precision comes from the snap and the place written out under it, not from aiming.
//
// A map (#251) and a labelled picture (#252) share one `case`: the region under the finger (`regionAt` in
// shared-math `maps.ts`, a point-in-polygon test on the Natural Earth shapes), or the small one
// whose label it is near. Its shapes are loaded with the first map (`useMapShapes`) and handed in.
// Labelled pictures (#252) add their figure here too: one `case`, the same contract.

import type { MapShapes } from '../../../../packages/shared-math/src/maps.js';
import {
  schematicRegions,
  type SchematicShapes,
} from '../../../../packages/shared-math/src/schematics.js';
import {
  REGION_FRAME,
  regionAt,
  regionPath,
  regionReach,
} from '../../../../packages/shared-math/src/regions.js';
import {
  tapAxes,
  type TapAxis,
  type Tappable,
  type TapPick,
} from '../../../../packages/shared-math/src/tap.js';
import { barChartGeometry, clockGeometry, numberLineGeometry, type Box } from './figureGeometry.js';
import { functionPlotGeometry } from './plotLayout.js';

/**
 * How the chosen place is shown: a dot on it, a frame around its column, a region filled with a dot
 * on its label (so a region as small as Bremen still shows), or the clock's hands.
 */
export type TapMark =
  | { kind: 'dot'; x: number; y: number }
  | { kind: 'box'; box: Box }
  /** `outline`: the region's border is drawn (a Land); a continent of many countries has none. */
  | { kind: 'region'; d: string; x: number; y: number; outline: boolean }
  | null;

export type TapLayout = {
  axes: TapAxis[];
  /**
   * The place a finger at (x, y) means, in the drawing's coordinates. Where one tap sets one axis
   * only (a hand of the clock), `active` names it and the other axis keeps `current`.
   */
  pickAt: (x: number, y: number, current: TapPick | null, active: number) => TapPick;
  /** Where the place is marked in the drawing (null: the figure shows it itself — the hands). */
  markOf: (pick: TapPick) => TapMark;
  /**
   * Lines through the places the drawing's own grid leaves out: a plot labels every second unit
   * when it is narrow, but every whole number is a place she can tap, and a point between two
   * drawn lines reads as "somewhere in between".
   */
  guides: Array<{ x1: number; y1: number; x2: number; y2: number }>;
};

/** The index of the value whose screen position is nearest to `at`. */
function nearest(values: readonly number[], screen: (v: number) => number, at: number): number {
  let best = 0;
  values.forEach((v, i) => {
    if (Math.abs(screen(v) - at) < Math.abs(screen(values[best] ?? v) - at)) best = i;
  });
  return best;
}

const clampIndex = (i: number, n: number) => Math.max(0, Math.min(n - 1, i));

/** The twelve marks of a clock face, 0 at the 12, clockwise: the one nearest to the angle of (dx, dy). */
function markAt(dx: number, dy: number): number {
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  return Math.round(deg / 30) % 12;
}

/** The shapes of the figures that load them (`useMapShapes`, `useSchematicShapes`). */
export type TapShapes = { maps?: MapShapes | null; pictures?: SchematicShapes | null };

/**
 * The places of `fig` on a drawing `width` wide, or null when the figure offers none. `format`
 * writes a tick label as the plot draws it (its length moves the plot's left margin). A map and a
 * picture need their `shapes`; before they are loaded they offer nothing to tap yet.
 */
export function tapLayout(
  fig: Tappable,
  width: number,
  format: (n: number) => string,
  fontSize: number,
  shapes: TapShapes = {},
): TapLayout | null {
  const axes = tapAxes(fig);
  const [first, second] = axes ?? [];
  if (!axes || !first) return null;
  switch (fig.type) {
    case 'number_line': {
      const g = numberLineGeometry(fig, width);
      return {
        axes,
        pickAt: (x) => [nearest(first.values, g.x, x)],
        markOf: ([i = 0]) => ({ kind: 'dot', x: g.x(first.values[i] ?? 0), y: g.axisY }),
        guides: [],
      };
    }
    case 'function_plot': {
      const g = functionPlotGeometry(fig, width, { bare: false, format, fontSize });
      const ys = second?.values ?? [];
      const bottom = g.top + g.ph;
      const right = g.left + g.pw;
      const between = (step: number) => (v: number) =>
        Math.abs(v / step - Math.round(v / step)) > 1e-9;
      return {
        axes,
        pickAt: (x, y) => [nearest(first.values, g.X, x), nearest(ys, g.Y, y)],
        markOf: ([i = 0, j = 0]) => ({
          kind: 'dot',
          x: g.X(first.values[i] ?? 0),
          y: g.Y(ys[j] ?? 0),
        }),
        guides: [
          ...first.values
            .filter(between(g.xStep))
            .map((v) => ({ x1: g.X(v), y1: g.top, x2: g.X(v), y2: bottom })),
          ...ys
            .filter(between(g.yStep))
            .map((v) => ({ x1: g.left, y1: g.Y(v), x2: right, y2: g.Y(v) })),
        ],
      };
    }
    case 'bar_chart': {
      const g = barChartGeometry(fig, width);
      const n = first.values.length;
      const size = g.horizontal ? g.rowH : width / n;
      return {
        axes,
        pickAt: (x, y) => [clampIndex(Math.floor(g.horizontal ? (y - 2) / size : x / size), n)],
        markOf: ([i = 0]) => ({ kind: 'box', box: g.slot(i) }),
        guides: [],
      };
    }
    case 'clock': {
      // One face, centred in the drawing's width (FigureView centres it).
      const { d } = clockGeometry(1, width);
      const cx = width / 2;
      const cy = d / 2;
      return {
        axes,
        pickAt: (x, y, current, active) => {
          const mark = markAt(x - cx, y - cy);
          const [hour = 11, minute = 0] = current ?? [];
          // The 12 is the last hour (index 11) and the first minute mark (index 0).
          return active === 0 ? [(mark + 11) % 12, minute] : [hour, mark];
        },
        markOf: () => null,
        guides: [],
      };
    }
    case 'map':
    case 'schematic': {
      // A map's regions and a picture's parts come with their shapes (each loaded with the first
      // of its kind); a picture's parts are drawn with their border.
      const view =
        fig.type === 'map'
          ? shapes.maps?.[fig.v]
          : shapes.pictures
            ? { ...schematicRegions(shapes.pictures, fig.d), borders: true }
            : undefined;
      if (!view) return null;
      const k = width / REGION_FRAME;
      const reach = regionReach(width);
      return {
        axes,
        pickAt: (x, y) => [regionAt(view, x / k, y / k, reach)],
        markOf: ([i = 0]) => {
          const shape = view.regions[i];
          if (!shape) return null;
          return {
            kind: 'region',
            outline: view.borders,
            d: regionPath(shape.rings, k),
            x: shape.at[0] * k,
            y: shape.at[1] * k,
          };
        },
        guides: [],
      };
    }
  }
}
