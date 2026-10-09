import { describe, expect, it } from 'vitest';

import { CHART_WIDTH } from '../../../../../packages/shared-math/src/charts.js';
import { chartFrame, every, TOP } from '../chartLayout.js';

const axis = { lo: -10, hi: 30, step: 10, ticks: [-10, 0, 10, 20, 30] };

describe('chartFrame', () => {
  it('gives the plot the room beside its axes and under its labels', () => {
    // A line chart on the narrowest phone, a right axis and an x title.
    const f = chartFrame(CHART_WIDTH, { size: [0.8, 200, 320], rightAxis: true, xTitle: true });
    expect(f.height).toBe(213); // 266 × 0.8, rounded
    expect(f.left).toBe(34);
    expect(f.pw).toBe(CHART_WIDTH - 34 - 34);
    expect(f.ph).toBe(213 - TOP - 22 - 16);
    // Without a second axis only the last x label's half stands right of the plot.
    expect(
      chartFrame(CHART_WIDTH, { size: [0.8, 200, 320], rightAxis: false, xTitle: false }).pw,
    ).toBe(CHART_WIDTH - 34 - 10);
  });

  it('keeps the height between its least and its most', () => {
    expect(
      chartFrame(100, { size: [0.68, 180, 290], rightAxis: false, xTitle: false }).height,
    ).toBe(180);
    expect(
      chartFrame(900, { size: [0.68, 180, 290], rightAxis: false, xTitle: false }).height,
    ).toBe(290);
  });

  it('places an axis value across and up the plot', () => {
    const f = chartFrame(CHART_WIDTH, { size: [0.72, 190, 300], rightAxis: false, xTitle: false });
    const X = f.X(axis);
    const Y = f.Y(axis);
    expect(X(-10)).toBe(f.left);
    expect(X(30)).toBe(f.left + f.pw);
    expect(Y(30)).toBe(TOP);
    expect(Y(-10)).toBe(TOP + f.ph);
    expect(Y(10)).toBeCloseTo(TOP + f.ph / 2, 9);
  });
});

describe('every', () => {
  it('labels every k-th step so neighbours never touch', () => {
    expect(every(['1', '2', '3'], 40)).toBe(1);
    // "1000" needs 4 × 6.6 + 6 ≈ 32.4 pt; 12 pt apart → every third.
    expect(every(['1000', '2000'], 12)).toBe(3);
  });
});
