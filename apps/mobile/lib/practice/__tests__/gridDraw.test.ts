// Zeichnen auf dem Raster (issue #249): every tool of the paper as a pure step — set a point, take
// it away and set it again, move it with the arrows, pull a bar, undo — and the drawing read back
// from a draft that may no longer fit the paper.

import type { GridDrawTaskView } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  drawnWords,
  emptyGrid,
  gridAnswer,
  gridComplete,
  gridFrom,
  nextPoint,
  nudge,
  tapBar,
  tapPoint,
  undo,
  type GridKept,
} from '../gridDraw.js';

const POINTS: GridDrawTaskView = {
  type: 'grid_draw',
  frame: { x_min: -2, x_max: 4, y_min: -2, y_max: 4 },
  sheet: { mode: 'points', names: ['A', 'B'] },
};
const LINE: GridDrawTaskView = {
  type: 'grid_draw',
  frame: { x_min: -4, x_max: 4, y_min: -4, y_max: 4 },
  sheet: { mode: 'graph', count: 2, line: true },
};
const BARS: GridDrawTaskView = {
  type: 'grid_draw',
  frame: { x_min: 0, x_max: 3, y_min: 0, y_max: 6 },
  sheet: {
    mode: 'bars',
    step: 10,
    bars: [
      { id: 'b1', label: 'Apfel' },
      { id: 'b2', label: 'Birne' },
      { id: 'b3', label: 'Kiwi' },
    ],
  },
};

const tap = (k: GridKept, view: GridDrawTaskView, ...ps: Array<[number, number] | null>) =>
  ps.reduce((acc, p) => tapPoint(acc, view, p ? { x: p[0], y: p[1] } : null), k);

describe('setting points', () => {
  it('sets A, then B, and is ready for "Prüfen" once both stand', () => {
    const k = tap(emptyGrid(POINTS), POINTS, [2, 3]);
    expect(nextPoint(k.now, POINTS)).toBe('B');
    expect(gridComplete(k.now)).toBe(false);
    const both = tap(k, POINTS, [-1, 1]);
    expect(nextPoint(both.now, POINTS)).toBeNull();
    expect(gridComplete(both.now)).toBe(true);
    expect(drawnWords(both.now, POINTS)).toEqual(['A(2|3)', 'B(−1|1)']);
    expect(gridAnswer(both.now, POINTS)).toEqual({
      type: 'grid_draw',
      points: [
        { x: 2, y: 3 },
        { x: -1, y: 1 },
      ],
      bars: [],
    });
  });

  it('takes a point away with a tap on it; the next tap puts THAT point back', () => {
    const k = tap(emptyGrid(POINTS), POINTS, [2, 3], [-1, 1], [2, 3]);
    expect(k.now.points).toEqual([null, { x: -1, y: 1 }]);
    expect(nextPoint(k.now, POINTS)).toBe('A');
    const fixed = tap(k, POINTS, [3, 2]);
    expect(drawnWords(fixed.now, POINTS)).toEqual(['A(3|2)', 'B(−1|1)']);
  });

  it('moves the last point when every point stands', () => {
    const k = tap(emptyGrid(LINE), LINE, [0, -1], [1, 2], [1, 1]);
    expect(gridAnswer(k.now, LINE).points).toEqual([
      { x: 0, y: -1 },
      { x: 1, y: 1 },
    ]);
  });

  it('without a finger sets the point in the middle of the paper', () => {
    const k = tap(emptyGrid(POINTS), POINTS, null);
    expect(k.now.points[0]).toEqual({ x: 1, y: 1 });
    // The middle is hers already: a second tap without a finger chooses it, never removes it.
    const again = tap(k, POINTS, null);
    expect(again.now.points[0]).toEqual({ x: 1, y: 1 });
    expect(again.now.selected).toBe(0);
  });
});

describe('the arrow keys and "Zurück"', () => {
  it('moves the chosen point one crossing, never off the paper or onto another point', () => {
    let k = tap(emptyGrid(POINTS), POINTS, [3, 3]);
    k = nudge(k, POINTS, 1, 0);
    expect(k.now.points[0]).toEqual({ x: 4, y: 3 });
    expect(nudge(k, POINTS, 1, 0)).toBe(k);
    k = tap(k, POINTS, [4, 2]);
    expect(nudge(k, POINTS, 0, 1)).toBe(k);
    expect(nudge(k, POINTS, 0, -1).now.points[1]).toEqual({ x: 4, y: 1 });
  });

  it('undoes step by step, down to the empty paper', () => {
    let k = tap(emptyGrid(POINTS), POINTS, [3, 3], [1, 1]);
    k = nudge(k, POINTS, -1, 0);
    k = undo(k);
    expect(k.now.points).toEqual([
      { x: 3, y: 3 },
      { x: 1, y: 1 },
    ]);
    k = undo(undo(k));
    expect(k.now.points).toEqual([null, null]);
    expect(undo(k)).toBe(k);
  });
});

describe('pulling bars', () => {
  it('pulls the tapped column to the tapped row, in steps of the scale', () => {
    let k = tapBar(emptyGrid(BARS), BARS, { bar: 1, rows: 5 });
    expect(drawnWords(k.now, BARS)).toEqual(['Apfel 0', 'Birne 50', 'Kiwi 0']);
    expect(gridComplete(k.now)).toBe(true);
    k = nudge(k, BARS, 0, -1);
    expect(k.now.bars).toEqual([0, 40, 0]);
    k = nudge(k, BARS, 1, 0);
    expect(k.now.selected).toBe(2);
    k = nudge(k, BARS, 0, 1);
    expect(gridAnswer(k.now, BARS).bars).toEqual([
      { id: 'b1', value: 0 },
      { id: 'b2', value: 40 },
      { id: 'b3', value: 10 },
    ]);
  });

  it('without a finger grows the chosen bar a row; never past the top or under 0', () => {
    let k = tapBar(emptyGrid(BARS), BARS, null);
    expect(k.now.bars).toEqual([10, 0, 0]);
    for (let i = 0; i < 9; i++) k = nudge(k, BARS, 0, 1);
    expect(k.now.bars[0]).toBe(60);
    for (let i = 0; i < 9; i++) k = nudge(k, BARS, 0, -1);
    expect(k.now.bars[0]).toBe(0);
    expect(gridComplete(k.now)).toBe(false);
  });
});

describe('read back from the draft', () => {
  it('keeps a drawing that fits, and starts empty where it does not', () => {
    const k = tap(emptyGrid(POINTS), POINTS, [2, 3]);
    expect(gridFrom(JSON.stringify(k), POINTS).now).toEqual(k.now);
    // A point off this paper, a drawing of another mode, no JSON, a height off the scale.
    const off = { ...k, now: { ...k.now, points: [{ x: 9, y: 9 }, null] } };
    expect(gridFrom(JSON.stringify(off), POINTS)).toEqual(emptyGrid(POINTS));
    expect(gridFrom(JSON.stringify(k), BARS)).toEqual(emptyGrid(BARS));
    expect(gridFrom('not json', POINTS)).toEqual(emptyGrid(POINTS));
    const badBar = { now: { points: [], bars: [0, 15, 0], selected: 1 }, past: [] };
    expect(gridFrom(JSON.stringify(badBar), BARS)).toEqual(emptyGrid(BARS));
  });
});
