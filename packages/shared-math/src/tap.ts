// Tapping inside a figure (issue #248, analysis #224 `HOTSPOT_FIG`): a place on a number line, a
// point of a coordinate system, a column of a bar chart, the time on a clock face, a region of a
// map (#251) or a crossing of its Gradnetz (#429), a part of a labelled picture (#252). One mechanism for every figure that can be answered by a tap — labelled pictures
// (#252) add their figure here, not a second mechanism.
//
// What a figure offers to tap is a GRID: one or more axes, each a list of values in drawing
// order. A tap picks one index per axis (`TapPick`); the answer is that pick written as text, the
// same text a key is written in (`tapText`), so typing it, tapping it and the key are one answer.
// The app draws the figure and asks its own geometry where each value stands; this module knows
// nothing about pixels, so the server can check a key with exactly the grid the app offers.
//
// Rule 0 in both directions:
//   · what the model GENERATES is checked here — `tapProblem` names the first reason a tap
//     question cannot be asked: a figure too dense to hit on a phone, a key that lies between two
//     places (nobody could tap it), a figure that already shows the key. The caller drops the
//     question, never moves the key onto the grid.
//   · what she TAPS is judged here — `tapVerdict` compares her pick with the key's, exactly. A
//     wrong place is wrong; it never reaches a model (CLAUDE.md rule 1).
//
// The names of a map's places and a picture's parts are handed in (`FigureNames`, #440): the
// server passes all of them, the app what it has loaded — null before the first map or picture,
// and then such a figure offers nothing to tap yet. Every other figure needs none.
//
// Dependency-free on purpose: the app imports it by path, like `primary.ts`. The shapes below are
// those of `NumberLineFigure`, `FunctionPlotFigure`, `BarChartFigure`, `ClockFigure` and `MapFigure`
// (packages/shared-types/src/contracts/figure.ts); the API passes the zod-inferred figures in, so
// a drift between the two fails the typecheck.

import type { FigureNames } from './figureNames.js';
import { gridParse, gridText, mapGrid } from './mapGrid.js';
import { isGridMap, isMap, mapMarked, mapPickIndex, mapPlaces, type MapFig } from './maps.js';
import { regionNamed, type RegionName } from './regions.js';
import { schematic, type SchematicFig } from './schematics.js';
import { parseClockAnswer, type Clock } from './primary.js';

export type TapNumberLine = {
  type: 'number_line';
  min: number;
  max: number;
  step: number;
  points: ReadonlyArray<{ value: number; label: string | null }>;
};
export type TapPlane = {
  type: 'function_plot';
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  points: ReadonlyArray<{ x: number; y: number; label: string | null }>;
};
export type TapBars = { type: 'bar_chart'; bars: ReadonlyArray<{ label: string; value: number }> };
export type Tappable = TapNumberLine | TapPlane | TapBars | Clock | MapFig | SchematicFig;

/** The figures a question may be answered on by a tap. */
export const TAP_FIGURES = [
  'number_line',
  'function_plot',
  'bar_chart',
  'clock',
  'map',
  'schematic',
] as const;
export type TapFigureType = (typeof TAP_FIGURES)[number];

/**
 * The named places of a figure whose places have names — the regions of a map (#251) or its
 * capitals, rivers or mountain ranges (#429), the parts of
 * a labelled picture (#252) — or null for every other figure, and while the names are not at hand.
 * Typed or tapped, an answer on such a figure is a name of one of them (`regions.ts`).
 */
export function namedPlaces(
  names: FigureNames | null,
  f: { type: string },
): readonly RegionName[] | null {
  if (!names) return null;
  // A crossing of the Gradnetz (#429) has coordinates, not a name.
  if (isMap(f)) return isGridMap(f) ? null : mapPlaces(names, f);
  if (f.type === 'schematic') return schematic(names, (f as SchematicFig).d).parts;
  return null;
}

export function isTappable(f: { type: string }): f is Tappable {
  return (TAP_FIGURES as readonly string[]).includes(f.type);
}

/**
 * The most places on one axis. A phone is 360 pt wide; minus margins a number line has ~300 pt,
 * so 21 places stand 15 pt apart. That is no 44 pt target each — the whole figure is the target,
 * and a tap or a drag snaps to the nearest place with the place written out under it — but
 * finer than this a finger cannot tell neighbours apart even with that help.
 */
export const TAP_MAX_PLACES = 21;
/** A coordinate system: whole numbers only, at most this many per axis (−6 … 6). */
export const TAP_MAX_UNITS = 12;
/** A clock is set in five-minute steps: the twelve marks with numbers on the face. */
export const TAP_MINUTE_STEP = 5;

/**
 * What an axis stands for: the app names it ("x: 2", "Stunde: 7") and draws it accordingly — the
 * Gradnetz (#429) by its meridians (`lon`) and parallels (`lat`), like a coordinate system.
 */
export type TapAxisName =
  | 'value'
  | 'x'
  | 'y'
  | 'bar'
  | 'hour'
  | 'minute'
  | 'region'
  | 'lon'
  | 'lat';
export type TapAxis = { name: TapAxisName; values: readonly number[] };
/** One index per axis of the grid, in the order of `tapAxes`. */
export type TapPick = readonly number[];

const EPS = 1e-9;

/** n with no float noise: 0.1 + 0.2 → 0.3, and −0 → 0. */
function clean(n: number): number {
  const r = Math.round(n * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
}

/** The places of a number line: min, min + step … max (null: not a whole number of steps). */
function lineValues(f: TapNumberLine): number[] | null {
  if (!(f.step > 0) || !(f.max > f.min)) return null;
  const steps = (f.max - f.min) / f.step;
  const count = Math.round(steps);
  if (Math.abs(steps - count) > EPS * Math.max(1, steps) || count + 1 > TAP_MAX_PLACES) return null;
  return Array.from({ length: count + 1 }, (_, i) => clean(f.min + i * f.step));
}

/** The whole numbers from lo to hi (null: fewer than two, or more than `TAP_MAX_UNITS` apart). */
function wholeValues(lo: number, hi: number): number[] | null {
  const a = Math.ceil(lo - EPS);
  const b = Math.floor(hi + EPS);
  if (b - a < 1 || b - a > TAP_MAX_UNITS) return null;
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

const key = (label: string) => label.trim().toLocaleLowerCase();

/**
 * The grid a figure offers to tap, or null when it offers none: a figure of another type, a
 * number line or coordinate system too dense for a finger, two columns with one name (a tap
 * could not say which), a clock that already shows a time or counts 24 hours (a dial cannot
 * tell 7:45 from 19:45), a map or a picture whose names are not at hand. A map offers its
 * regions — however small, each is tapped by its label (`regionAt`, maps.ts).
 */
export function tapAxes(names: FigureNames | null, f: Tappable): TapAxis[] | null {
  switch (f.type) {
    case 'number_line': {
      const values = lineValues(f);
      return values ? [{ name: 'value', values }] : null;
    }
    case 'function_plot': {
      const xs = wholeValues(f.x_min, f.x_max);
      const ys = wholeValues(f.y_min, f.y_max);
      return xs && ys
        ? [
            { name: 'x', values: xs },
            { name: 'y', values: ys },
          ]
        : null;
    }
    case 'bar_chart': {
      if (new Set(f.bars.map((b) => key(b.label))).size !== f.bars.length) return null;
      return [{ name: 'bar', values: f.bars.map((_, i) => i) }];
    }
    case 'clock': {
      if (f.c.length > 0 || f.h24) return null;
      return [
        { name: 'hour', values: Array.from({ length: 12 }, (_, i) => i + 1) },
        { name: 'minute', values: Array.from({ length: 60 / TAP_MINUTE_STEP }, (_, i) => i * 5) },
      ];
    }
    case 'map':
    case 'schematic': {
      if (isMap(f) && isGridMap(f)) {
        const grid = mapGrid(f.v);
        return grid
          ? [
              { name: 'lon', values: grid.lon },
              { name: 'lat', values: grid.lat },
            ]
          : null;
      }
      const places = namedPlaces(names, f);
      return places ? [{ name: 'region', values: places.map((_, i) => i) }] : null;
    }
  }
}

/** A number as a key writes it: a decimal point, no thousands separator, ASCII minus. */
function written(n: number): string {
  return String(clean(n));
}

/**
 * The answer a pick stands for, written as a key is ("2.5", "(2|-1)", "Mai", "7:45", "Bayern" —
 * a region by its German name, as the data writes it; "50° N, 10° O" — a crossing as German
 * writes it, `mapGrid.ts`); null when the pick is not one of the grid's.
 */
export function tapText(names: FigureNames | null, f: Tappable, pick: TapPick): string | null {
  const axes = tapAxes(names, f);
  if (!axes || pick.length !== axes.length) return null;
  const vals = axes.map((axis, i) => axis.values[pick[i] ?? -1]);
  if (vals.some((v) => v === undefined)) return null;
  const [a = 0, b = 0] = vals as number[];
  switch (f.type) {
    case 'number_line':
      return written(a);
    case 'function_plot':
      return `(${written(a)}|${written(b)})`;
    case 'bar_chart':
      return f.bars[a]?.label ?? null;
    case 'clock':
      return `${a}:${String(b).padStart(2, '0')}`;
    case 'map':
    case 'schematic':
      return isMap(f) && isGridMap(f)
        ? gridText({ lon: a, lat: b }, 'de')
        : (namedPlaces(names, f)?.[a]?.de ?? null);
  }
}

/**
 * A plain number as a key or the app writes one: "2.5", "-3", "2,5", "−0.5", "5/2". Anything
 * else — a unit, words, an expression — is no place on a figure (null), and other rules judge it.
 */
export function plainNumber(text: string): number | null {
  const t = text.trim().replace(/−/g, '-');
  const frac = /^(-?\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  if (!/^-?(\d+([.,]\d+)?|[.,]\d+)$/.test(t)) return null;
  return Number(t.replace(',', '.'));
}

/** The index of `v` among `values` (null: between two of them, or outside). */
function indexOf(values: readonly number[], v: number): number | null {
  const i = values.findIndex((x) => Math.abs(x - v) <= EPS * Math.max(1, Math.abs(v)));
  return i < 0 ? null : i;
}

/** "(2|-1)", "(2 | −1)", "(2;-1)" or "2|-1" → [2, -1]. */
function pointOf(text: string): [number, number] | null {
  const m = /^\(?\s*([^|;()]+?)\s*[|;]\s*([^|;()]+?)\s*\)?$/.exec(text.trim());
  if (!m) return null;
  const x = plainNumber(m[1] ?? '');
  const y = plainNumber(m[2] ?? '');
  return x === null || y === null ? null : [x, y];
}

/**
 * Where an answer stands on the figure's grid, or null when it stands on none of its places: a
 * value between two of them, a point off the lattice, a name no column has, a time off the
 * five-minute marks, a name no region of the map has (any of its names in five languages is
 * one). The inverse of `tapText` — and what a key must survive to be tapped at all.
 */
export function tapPick(names: FigureNames | null, f: Tappable, text: string): TapPick | null {
  const axes = tapAxes(names, f);
  if (!axes) return null;
  const [first, second] = axes;
  if (!first) return null;
  switch (f.type) {
    case 'number_line': {
      const v = plainNumber(text);
      const i = v === null ? null : indexOf(first.values, v);
      return i === null ? null : [i];
    }
    case 'function_plot': {
      const p = pointOf(text);
      if (!p || !second) return null;
      const i = indexOf(first.values, p[0]);
      const j = indexOf(second.values, p[1]);
      return i === null || j === null ? null : [i, j];
    }
    case 'bar_chart': {
      const i = f.bars.findIndex((b) => key(b.label) === key(text));
      return i < 0 ? null : [i];
    }
    case 'clock': {
      const t = parseClockAnswer(text);
      if (!t || t.m % TAP_MINUTE_STEP !== 0) return null;
      // 1 … 12 stand at 0 … 11; 0:30 and 12:30 are both on the 12.
      return [(t.h + 11) % 12, t.m / TAP_MINUTE_STEP];
    }
    case 'map':
    case 'schematic': {
      if (isMap(f) && isGridMap(f)) {
        // As code writes it: the app's tap, the stored key (`mapGrid.ts`).
        const p = gridParse(text, 'de');
        const i = p === null ? null : indexOf(first.values, p.lon);
        const j = p === null || !second ? null : indexOf(second.values, p.lat);
        return i === null || j === null ? null : [i, j];
      }
      const i = regionNamed(namedPlaces(names, f) ?? [], text);
      return i === null ? null : [i];
    }
  }
}

/** The answer kind a tap on this figure is: a number on a number line, a short text elsewhere. */
export function tapKind(f: Tappable): 'numeric' | 'short' {
  return f.type === 'number_line' ? 'numeric' : 'short';
}

/**
 * The first reason a question cannot be answered by tapping this figure, or null when it can.
 * Checked before the question is stored; a question that fails is dropped (Rule 0) — a key off
 * the grid could not be tapped by anyone, and a figure that already marks the key would only be
 * copied.
 */
export function tapProblem(
  names: FigureNames,
  f: { type: string },
  kind: string,
  answer: string,
): string | null {
  if (!isTappable(f)) return 'this figure cannot be tapped';
  if (!tapAxes(names, f)) return 'the figure offers no places to tap';
  if (kind !== tapKind(f)) return `a tap on a ${f.type} answers a ${tapKind(f)} question`;
  const pick = tapPick(names, f, answer);
  if (!pick) return 'the key is no place of the figure';
  const shown =
    f.type === 'number_line'
      ? f.points.some((p) => Math.abs(p.value - (plainNumber(answer) ?? NaN)) <= EPS)
      : f.type === 'function_plot'
        ? f.points.some((p) => tapPick(names, f, `(${p.x}|${p.y})`)?.join() === pick.join())
        : isMap(f)
          ? mapMarked(names, f).includes(mapPickIndex(f, pick))
          : false;
  return shown ? 'the figure already marks the key' : null;
}

/**
 * Her tap against the key, exactly: 'correct' on the key's place, 'incorrect' on any other place
 * of the grid. Null when her answer is no place of the figure (nothing tapped) — then the other
 * rules judge it, as for anything typed.
 */
export function tapVerdict(
  names: FigureNames,
  f: Tappable,
  answer: string,
  text: string,
): 'correct' | 'incorrect' | null {
  const wanted = tapPick(names, f, answer);
  const given = tapPick(names, f, text);
  if (!wanted || !given) return null;
  return wanted.join() === given.join() ? 'correct' : 'incorrect';
}
