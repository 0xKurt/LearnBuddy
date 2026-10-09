// Fitting a figure into the room a question card grants it (issue #96). The room
// comes out of a measuring loop, so the rule that ends the loop is what is proven
// here: measure once per width, derive the scale from the room as it is now.

import { describe, expect, it } from 'vitest';

import { CHART_WIDTH } from '../../../../../packages/shared-math/src/charts.js';
import {
  BARE_FIGURE_CHROME,
  drawnAtWidth,
  figureBodyWidth,
  figureScale,
  FIGURE_CHROME,
  leastFigureScale,
  MIN_FIGURE_SCALE,
  naturalFigureHeight,
  newFigureWidth,
} from '../figureScale.js';

describe('measuring the figure', () => {
  it('takes a width the first time and whenever it really changes', () => {
    expect(newFigureWidth(0, 320.7)).toBe(320);
    expect(newFigureWidth(320, 280)).toBe(280);
  });

  it('ignores a layout that says the same thing — it would throw the measurement away', () => {
    expect(newFigureWidth(320, 320)).toBeNull();
    expect(newFigureWidth(320, 320.9)).toBeNull();
    expect(newFigureWidth(320, 319.2)).toBeNull();
    // Nothing is drawn yet: no width, nothing to measure.
    expect(newFigureWidth(0, 0)).toBeNull();
  });

  it('takes a height only from the drawing laid out at the frame width it has now (#501)', () => {
    // A framed drawing: 12 pt padding and a 1 pt border each side.
    expect(drawnAtWidth(322, 296)).toBe(true);
    expect(drawnAtWidth(322, 297)).toBe(true);
    // The box at the frame's previous width, reported after the new width was taken.
    expect(drawnAtWidth(292, 296)).toBe(false);
    // An answer option's picture: the tile is its frame.
    expect(drawnAtWidth(171, 171 - BARE_FIGURE_CHROME, BARE_FIGURE_CHROME)).toBe(true);
    // No frame width yet: nothing to measure against.
    expect(drawnAtWidth(0, 0)).toBe(false);
  });

  it('keeps only the first height after a width change: the later ones are its own doing', () => {
    expect(naturalFigureHeight(0, 240.4)).toBe(240);
    // Already measured: a height the scale produced must never replace it.
    expect(naturalFigureHeight(240, 100)).toBeNull();
    expect(naturalFigureHeight(0, 0)).toBeNull();
  });
});

describe('the scale that comes out of it', () => {
  it('leaves the figure alone until it is measured and while it fits', () => {
    expect(figureScale(0, 200)).toBe(1);
    expect(figureScale(200, undefined)).toBe(1);
    expect(figureScale(180, 200)).toBe(1);
    expect(figureScale(200, 200)).toBe(1);
    // A rounding pixel over is not an overflow.
    expect(figureScale(202, 200)).toBe(1);
  });

  it('shrinks a figure to exactly the room it has', () => {
    expect(figureScale(400, 200)).toBe(0.5);
    expect(figureScale(300, 240)).toBe(0.8);
  });

  it('stops shrinking where the drawing would stop being readable', () => {
    expect(figureScale(1000, 100)).toBe(MIN_FIGURE_SCALE);
    expect(figureScale(1000, 0)).toBe(1); // no room granted at all: not a measurement
  });

  it('gives the full size back when the room grows again — without measuring again', () => {
    // The card measured 400 px once; the room then goes back and forth (issue #96).
    const measured = 400;
    expect(figureScale(measured, 200)).toBe(0.5);
    expect(figureScale(measured, 361)).toBeCloseTo(0.9025, 4);
    expect(figureScale(measured, 500)).toBe(1);
    // Every answer came from the same one measurement: the loop cannot oscillate.
    expect(naturalFigureHeight(measured, 200)).toBeNull();
  });
});

describe('the width the drawing itself gets', () => {
  it('takes the card off the width and follows the scale, in whole pixels', () => {
    expect(figureBodyWidth(346, 1)).toBe(320);
    expect(figureBodyWidth(346, 0.5)).toBe(160);
    expect(figureBodyWidth(346, MIN_FIGURE_SCALE)).toBe(128);
  });
});

describe('the least a chart is shrunk to (issue #501)', () => {
  const climate = { type: 'climate_chart' };

  it('keeps a chart at the width its labels are checked at, however little room there is', () => {
    // 390×844, answered: the card gave its room back and the drawing got 118 of 296 pt.
    const least = leastFigureScale(climate, 296 + FIGURE_CHROME);
    expect(figureScale(1000, 100, least)).toBe(least);
    for (let width = CHART_WIDTH + FIGURE_CHROME; width <= 480; width++) {
      const scale = figureScale(1000, 100, leastFigureScale(climate, width));
      expect(figureBodyWidth(width, scale)).toBe(CHART_WIDTH);
    }
  });

  it('never grows a chart past its room, and a narrower room is not shrunk at all', () => {
    expect(leastFigureScale(climate, CHART_WIDTH + FIGURE_CHROME)).toBe(1);
    expect(leastFigureScale(climate, 200)).toBe(1);
    expect(figureScale(400, 200, leastFigureScale(climate, 600))).toBe(0.5);
  });

  it('leaves every other drawing to the readable least — a pie too, read from its legend', () => {
    expect(leastFigureScale({ type: 'pie_chart' }, 322)).toBe(MIN_FIGURE_SCALE);
    expect(leastFigureScale({ type: 'function_plot' }, 322)).toBe(MIN_FIGURE_SCALE);
    expect(leastFigureScale({ type: 'geometry' }, 322, BARE_FIGURE_CHROME)).toBe(MIN_FIGURE_SCALE);
  });
});
