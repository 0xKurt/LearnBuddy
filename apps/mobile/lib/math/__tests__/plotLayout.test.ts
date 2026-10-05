import { describe, expect, it } from 'vitest';

import {
  labelWidth,
  plotFrame,
  plotGeometry,
  plotValueAt,
  plotX,
  plotY,
  yLabelsClearOf,
  Y_LABEL_GAP,
} from '../plotLayout.js';

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

describe('yLabelsClearOf (issue #326)', () => {
  // A small option graph as in the walkthrough's shot 40: -3…3 × -3…5 in about 100 × 75
  // points — 16 points per unit across, 9 up.
  const axisY = 60;
  const axisX = 60;
  const xLabel = (v: number) => ({ v, x: axisY + v * 16, y: axisX + 15, text: String(v) });
  const yLabel = (v: number, u = 9) => ({
    v,
    x: axisY - Y_LABEL_GAP,
    y: axisX - v * u + 4,
    text: String(v),
  });

  it('lets a y label give way where it would sit on an x label next to the origin', () => {
    const shown = yLabelsClearOf([xLabel(-2), xLabel(2)], [yLabel(-2), yLabel(2), yLabel(4)], FONT);
    expect(shown.map((l) => l.v)).toEqual([2, 4]);
  });

  it('keeps every y label on a large graph, where nothing touches', () => {
    const shown = yLabelsClearOf([xLabel(-2), xLabel(2)], [yLabel(-2, 30), yLabel(2, 30)], FONT);
    expect(shown.map((l) => l.v)).toEqual([-2, 2]);
  });

  it('keeps every y label when there are no x labels', () => {
    expect(yLabelsClearOf([], [yLabel(-2), yLabel(2)], FONT)).toHaveLength(2);
  });
});

describe('plotGeometry: one coordinate system for the graph she reads and the grid she draws on (#249)', () => {
  const label = (v: number) => String(v);

  it('lays a function plot out as before: axes through 0, ticks by the room', () => {
    const g = plotGeometry({
      width: 320,
      height: 256,
      x0: -4,
      x1: 4,
      y0: -3,
      y1: 5,
      fontSize: FONT,
      label,
    });
    expect(plotX(g, 0)).toBeCloseTo(g.axisY);
    expect(plotY(g, 0)).toBeCloseTo(g.axisX);
    expect(g.xTicks).toContain(0);
    expect(g.origin).toBe(true);
    // The x labels stand under the x-axis, the y labels left of the y-axis.
    for (const l of g.xLabels) expect(l.y).toBeCloseTo(g.axisX + 15);
    for (const l of g.yLabels) expect(l.x).toBeCloseTo(g.axisY - Y_LABEL_GAP);
  });

  it('draws the grid with a line at every unit and square units, never larger than asked', () => {
    const g = plotGeometry({
      width: 328,
      height: 10_000,
      x0: -4,
      x1: 4,
      y0: -4,
      y1: 4,
      fontSize: FONT,
      label,
      steps: { x: 1, y: 1 },
      square: true,
      maxUnit: 36,
    });
    expect(g.xTicks).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
    expect(g.pw / 8).toBeCloseTo(36);
    expect(g.ph / 8).toBeCloseTo(36);
    // The y-axis stays at 0 when the plot narrows to square units.
    expect(g.axisY).toBeCloseTo(plotX(g, 0));
  });

  it('finds the value under a finger, the other way round', () => {
    const g = plotGeometry({
      width: 300,
      height: 300,
      x0: 0,
      x1: 8,
      y0: 0,
      y1: 8,
      fontSize: FONT,
      label,
      steps: { x: 1, y: 1 },
      square: true,
      bottom: 22,
    });
    const at = plotValueAt(g, { x: plotX(g, 3), y: plotY(g, 5) });
    expect(at.x).toBeCloseTo(3);
    expect(at.y).toBeCloseTo(5);
    // With room under the plot, a first quadrant's x labels stand below its bottom edge.
    for (const l of g.xLabels) expect(l.y).toBeGreaterThan(g.top + g.ph);
  });

  it('leaves out the labels a caller has none for (the bars name their columns apart)', () => {
    const g = plotGeometry({
      width: 300,
      height: 240,
      x0: 0,
      x1: 3,
      y0: 0,
      y1: 6,
      fontSize: FONT,
      label,
      steps: { x: 1, y: 1 },
      xLabel: () => null,
      yLabel: (v) => String(v * 10),
    });
    expect(g.xLabels).toEqual([]);
    expect(g.yLabels.map((l) => l.text)).toEqual(['10', '20', '30', '40', '50', '60']);
  });
});
