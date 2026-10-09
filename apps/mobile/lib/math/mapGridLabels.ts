// Where the degrees of a map's Gradnetz are written (#429): a meridian's at the edge where it leaves
// the frame (the bottom, else the top), a parallel's at the left edge (else the right; on the world
// map at its western end) — the ends `scripts/maps.mjs` wrote for them. Each stands on its line on a
// paper chip, which interrupts the line as an atlas does (a line through a label strikes it out).
// Where two labels at one edge would touch on a narrow phone, only every second (third …) line is
// labelled, the round degrees kept: she counts the lines between, as in an atlas. Pure, so it is
// tested without a screen.

import { textWidth } from '../../../../packages/shared-math/src/labelBoxes.js';
import {
  gridDegree,
  gridStep,
  type MapGridLine,
  type MapGridShape,
  type MapGridValues,
} from '../../../../packages/shared-math/src/mapGrid.js';
import { REGION_FRAME } from '../../../../packages/shared-math/src/regions.js';

/** The room a label covers, its chip included, in pt. */
type GridBox = { x0: number; x1: number; y0: number; y1: number };
export type GridLabel = {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  text: string;
  box: GridBox;
};

/** The least room between two labels at one edge, and how far a label stands off its edge, in pt. */
const GAP = 4;
const OFF = 3;
/** How far the chip reaches past the text, in pt. */
const PAD = 2;
/** Every line, every second, … : the strides tried, smallest first. */
const STRIDES = [1, 2, 3, 4, 5, 6];

/** A label, the degree it writes and the edge it stands at. */
type Placed = { label: GridLabel; value: number; edge: 'bottom' | 'top' | 'left' | 'right' };

/** Whether two boxes come closer than `gap`. */
const touch = (a: GridBox, b: GridBox, gap: number) =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

/** Whether no two of the labels touch. */
const apart = (placed: readonly Placed[]) =>
  placed.every((p, i) => placed.slice(i + 1).every((q) => !touch(p.label.box, q.label.box, GAP)));

/**
 * The labels of one family, edge by edge: every `stride`-th degree (the round ones), the least
 * stride where none touches another.
 */
function thinned(placed: readonly Placed[], step: number): Placed[] {
  return [...new Set(placed.map((p) => p.edge))].flatMap((edge) => {
    const row = placed.filter((p) => p.edge === edge);
    const stride = STRIDES.find((s) =>
      apart(row.filter((p) => Math.round(p.value / step) % s === 0)),
    );
    return stride ? row.filter((p) => Math.round(p.value / step) % stride === 0) : [];
  });
}

/**
 * The degrees of the Gradnetz drawn `width` × `height` pt, in `lang`, at font `size`: each where
 * its line leaves the frame, inside it, thinned so that none touches another — where a parallel's
 * would touch a meridian's in a corner, the meridian's stays.
 */
export function gridLabels(
  values: MapGridValues,
  shape: MapGridShape,
  width: number,
  height: number,
  size: number,
  lang: string,
): GridLabel[] {
  const k = width / REGION_FRAME;
  const place = (
    family: readonly MapGridLine[],
    degrees: readonly number[],
    axis: 'lat' | 'lon',
  ): Placed[] =>
    family.flatMap((line, i): Placed[] => {
      const value = degrees[i];
      if (!line.label || value === undefined) return [];
      const [x, y] = [line.label[0] * k, line.label[1] * k];
      const text = gridDegree(value, axis, lang);
      const w = textWidth(text, size);
      // The chip: from the cap height to below the baseline, a little wider than the text.
      const chip = (x0: number, base: number): GridBox => ({
        x0: x0 - PAD,
        x1: x0 + w + PAD,
        y0: base - size * 0.8 - PAD,
        y1: base + size * 0.2 + PAD,
      });
      if (axis === 'lon') {
        // On its line above the bottom edge, or below the top one; never past a side.
        const cx = Math.max(w / 2 + PAD + 1, Math.min(width - w / 2 - PAD - 1, x));
        const bottom = y > height / 2;
        const base = bottom ? y - OFF - size * 0.2 - PAD : y + OFF + size * 0.8 + PAD;
        const label: GridLabel = {
          x: cx,
          y: base,
          anchor: 'middle',
          text,
          box: chip(cx - w / 2, base),
        };
        return [{ label, value, edge: bottom ? 'bottom' : 'top' }];
      }
      // On its line, just inside the left edge (or the right one), never past the top or bottom.
      const west = x < width / 2;
      const base = Math.max(size * 0.8 + PAD, Math.min(height - size * 0.2 - PAD, y + size * 0.3));
      const x0 = west ? x + OFF : x - OFF - w;
      const label: GridLabel = {
        x: west ? x0 : x0 + w,
        y: base,
        anchor: west ? 'start' : 'end',
        text,
        box: chip(x0, base),
      };
      return [{ label, value, edge: west ? 'left' : 'right' }];
    });
  const step = gridStep(values);
  const meridians = thinned(place(shape.lon, values.lon, 'lon'), step);
  const parallels = thinned(place(shape.lat, values.lat, 'lat'), step).filter((p) =>
    meridians.every((m) => !touch(p.label.box, m.label.box, OFF)),
  );
  return [...meridians, ...parallels].map((p) => p.label);
}
