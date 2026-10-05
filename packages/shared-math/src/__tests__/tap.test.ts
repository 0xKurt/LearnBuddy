// Tapping inside a figure (issue #248): the grid a figure offers, the answer a tap writes, where a
// key stands on the grid, what code refuses before a question is asked, and the exact verdict.

import { describe, expect, it } from 'vitest';

import type { Clock } from '../primary.js';
import {
  plainNumber,
  tapAxes,
  tapPick,
  tapProblem,
  tapText,
  tapVerdict,
  type TapBars,
  type TapNumberLine,
  type TapPlane,
  type Tappable,
} from '../tap.js';

const line = (min: number, max: number, step: number, points: number[] = []): TapNumberLine => ({
  type: 'number_line',
  min,
  max,
  step,
  points: points.map((value) => ({ value, label: null })),
});
const plane = (lo: number, hi: number, points: Array<[number, number]> = []): TapPlane => ({
  type: 'function_plot',
  x_min: lo,
  x_max: hi,
  y_min: lo,
  y_max: hi,
  points: points.map(([x, y]) => ({ x, y, label: 'A' })),
});
const bars = (...labels: string[]): TapBars => ({
  type: 'bar_chart',
  bars: labels.map((label, i) => ({ label, value: i + 1 })),
});
const face = (c: Clock['c'] = [], h24 = false): Clock => ({ type: 'clock', c, h24, ask: 'none' });

/** Every place of the grid, as the app would write it after a tap there. */
function everyAnswer(f: Tappable): string[] {
  const axes = tapAxes(f) ?? [];
  const picks = axes.reduce<number[][]>(
    (acc, axis) => acc.flatMap((p) => axis.values.map((_, i) => [...p, i])),
    [[]],
  );
  return picks.map((p) => tapText(f, p) ?? '');
}

describe('the grid a figure offers', () => {
  it('a number line: its places from min to max in steps, nothing finer', () => {
    expect(tapAxes(line(0, 3, 0.5))).toEqual([
      { name: 'value', values: [0, 0.5, 1, 1.5, 2, 2.5, 3] },
    ]);
    // 0.1 steps add up without float noise.
    expect(tapAxes(line(0, 0.3, 0.1))?.[0]?.values).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it('a coordinate system: the whole numbers of each axis', () => {
    expect(tapAxes(plane(-2.5, 2))).toEqual([
      { name: 'x', values: [-2, -1, 0, 1, 2] },
      { name: 'y', values: [-2, -1, 0, 1, 2] },
    ]);
  });

  it('a bar chart: one place per column; a clock face: twelve hours and twelve five-minute marks', () => {
    expect(tapAxes(bars('Jan', 'Feb', 'Mär'))).toEqual([{ name: 'bar', values: [0, 1, 2] }]);
    const clock = tapAxes(face());
    expect(clock?.[0]?.values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(clock?.[1]?.values).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it('offers nothing where a finger cannot tell the places apart or a tap could not say which', () => {
    expect(tapAxes(line(0, 21, 1))).toBeNull(); // 22 places on one line
    expect(tapAxes(line(0, 20, 1))).not.toBeNull(); // 21 is the most
    expect(tapAxes(line(0, 1, 0.3))).toBeNull(); // 1 is not a whole number of steps
    expect(tapAxes(plane(-7, 6))).toBeNull(); // 13 units
    expect(tapAxes(plane(0.2, 0.8))).toBeNull(); // no two whole numbers
    expect(tapAxes(bars('Mai', 'mai'))).toBeNull(); // two columns, one name
    expect(tapAxes(face([{ h: 7, m: 45 }]))).toBeNull(); // the face already shows a time
    expect(tapAxes(face([], true))).toBeNull(); // a dial cannot tell 7:45 from 19:45
  });
});

describe('a tap writes the answer as a key is written, and reads back to the same place', () => {
  it.each<[string, Tappable, number[], string]>([
    ['number line', line(-2, 3, 0.5), [9], '2.5'],
    ['number line, negative', line(-2, 3, 0.5), [1], '-1.5'],
    ['coordinate system', plane(-5, 5), [7, 4], '(2|-1)'],
    ['bar chart', bars('Jan', 'Feb', 'Mär'), [1], 'Feb'],
    ['clock', face(), [6, 9], '7:45'],
    ['clock on the hour', face(), [11, 0], '12:00'],
  ])('%s', (_, f, pick, text) => {
    expect(tapText(f, pick)).toBe(text);
    expect(tapPick(f, text)).toEqual(pick);
  });

  it('every place of every grid survives the round trip', () => {
    for (const f of [line(0, 20, 1), line(-1, 1, 0.25), plane(-6, 6), bars('a', 'b'), face()]) {
      const answers = everyAnswer(f);
      expect(new Set(answers).size).toBe(answers.length);
      for (const a of answers) expect(tapText(f, tapPick(f, a) ?? [])).toBe(a);
    }
  });

  it('reads a key however it is written, and nothing between two places', () => {
    const l = line(0, 5, 0.5);
    expect(tapPick(l, '2,5')).toEqual([5]);
    expect(tapPick(l, '5/2')).toEqual([5]);
    expect(tapPick(l, '2.25')).toBeNull(); // between 2 and 2.5: no one could tap it
    expect(tapPick(l, '6')).toBeNull(); // off the line
    expect(tapPick(l, 'zwei')).toBeNull();
    const p = plane(-5, 5);
    expect(tapPick(p, '(2 | −1)')).toEqual([7, 4]);
    expect(tapPick(p, '(2;-1)')).toEqual([7, 4]);
    expect(tapPick(p, '(2.5|-1)')).toBeNull();
    expect(tapPick(bars('Jan', 'Feb'), ' feb ')).toEqual([1]);
    expect(tapPick(face(), '19:45')).toEqual([6, 9]); // the same hands as 7:45
    expect(tapPick(face(), '7:43')).toBeNull(); // between two marks
    expect(tapText(face(), [12, 0])).toBeNull(); // no 13th hour
  });

  it('reads plain numbers only', () => {
    expect(plainNumber('−0,5')).toBe(-0.5);
    expect(plainNumber('3/0')).toBeNull();
    expect(plainNumber('2 cm')).toBeNull();
    expect(plainNumber('1e3')).toBeNull();
  });
});

describe('what code refuses before a tap question is asked', () => {
  it('a key that lies between two places, or off the figure', () => {
    expect(tapProblem(line(0, 5, 1), 'numeric', '2.5')).toBe('the key is no place of the figure');
    expect(tapProblem(plane(-3, 3), 'short', '(4|0)')).toBe('the key is no place of the figure');
    expect(tapProblem(face(), 'short', '7:43')).toBe('the key is no place of the figure');
    expect(tapProblem(bars('Jan', 'Feb'), 'short', 'März')).toBe(
      'the key is no place of the figure',
    );
  });

  it('a figure that already marks the key, or cannot be tapped at all', () => {
    expect(tapProblem(line(0, 5, 0.5, [2.5]), 'numeric', '2.5')).toBe(
      'the figure already marks the key',
    );
    expect(tapProblem(plane(-3, 3, [[2, -1]]), 'short', '(2|-1)')).toBe(
      'the figure already marks the key',
    );
    expect(tapProblem(face([{ h: 7, m: 45 }]), 'short', '7:45')).toBe(
      'the figure offers no places to tap',
    );
    expect(tapProblem({ type: 'table' }, 'short', 'x')).toBe('this figure cannot be tapped');
  });

  it('the wrong kind of answer for the figure', () => {
    expect(tapProblem(line(0, 5, 1), 'short', '2')).toMatch(/numeric/);
    expect(tapProblem(plane(-3, 3), 'numeric', '(1|1)')).toMatch(/short/);
  });

  it('accepts a key on the grid that the figure does not show', () => {
    expect(tapProblem(line(0, 5, 0.5, [1]), 'numeric', '2.5')).toBeNull();
    expect(tapProblem(plane(-5, 5, [[1, 1]]), 'short', '(2|-1)')).toBeNull();
    expect(tapProblem(bars('Jan', 'Feb'), 'short', 'Feb')).toBeNull();
    expect(tapProblem(face(), 'short', '7:45')).toBeNull();
  });
});

describe('her tap against the key, exactly', () => {
  it('right on the key, wrong anywhere else on the grid, no claim about anything else', () => {
    const p = plane(-5, 5);
    expect(tapVerdict(p, '(2|-1)', '(2|-1)')).toBe('correct');
    expect(tapVerdict(p, '(2|-1)', '(-1|2)')).toBe('incorrect');
    expect(tapVerdict(p, '(2|-1)', 'weiß nicht')).toBeNull();
    expect(tapVerdict(face(), '19:45', '7:45')).toBe('correct');
    expect(tapVerdict(face(), '7:45', '9:35')).toBe('incorrect');
    expect(tapVerdict(line(0, 5, 0.5), '2.5', '2,5')).toBe('correct');
    expect(tapVerdict(bars('Jan', 'Feb'), 'Feb', 'Jan')).toBe('incorrect');
  });
});
