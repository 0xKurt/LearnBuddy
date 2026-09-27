import { describe, expect, it } from 'vitest';

import { labelWidth, plotFrame, Y_LABEL_GAP } from '../plotLayout.js';

const FONT = 12;

/** x of the left end of each y label, as FigureView draws them (anchored at axisY − gap). */
function labelStarts(frame: ReturnType<typeof plotFrame>, labels: string[]): number[] {
  return labels.map((l) => frame.axisY - Y_LABEL_GAP - labelWidth(l, FONT));
}

describe('plotFrame', () => {
  it('keeps every y label on screen when the plot starts at x = 0 (distance-time)', () => {
    const labels = ['0', '50', '100', '150', '200'];
    const frame = plotFrame({
      width: 320,
      height: 256,
      x0: 0,
      x1: 10,
      yLabels: labels,
      fontSize: FONT,
    });
    expect(frame.axisY).toBe(frame.left);
    for (const x of labelStarts(frame, labels)) expect(x).toBeGreaterThanOrEqual(0);
  });

  it('keeps labels on screen when the axis is right of the edge but close to it', () => {
    const labels = ['−1000', '0', '1000', '2000'];
    const frame = plotFrame({
      width: 300,
      height: 240,
      x0: -0.2,
      x1: 10,
      yLabels: labels,
      fontSize: FONT,
    });
    for (const x of labelStarts(frame, labels)) expect(x).toBeGreaterThanOrEqual(0);
    expect(frame.pw).toBeGreaterThan(200);
  });

  it('adds no margin when the axis sits well inside the plot', () => {
    const frame = plotFrame({
      width: 320,
      height: 256,
      x0: -5,
      x1: 5,
      yLabels: ['−4', '4'],
      fontSize: FONT,
    });
    expect(frame.left).toBe(8);
    expect(frame.axisY).toBeCloseTo(8 + frame.pw / 2);
  });

  it('keeps the old margin when x_max = 0 puts the axis at the right edge', () => {
    const frame = plotFrame({
      width: 320,
      height: 256,
      x0: -10,
      x1: 0,
      yLabels: ['100'],
      fontSize: FONT,
    });
    expect(frame.left).toBe(8);
    expect(frame.axisY).toBe(frame.left + frame.pw);
  });
});
