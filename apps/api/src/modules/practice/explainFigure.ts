// Erklärung mit Bild (issue #298, docs/architecture.md §Practice): an explanation may show ONE
// figure of the library — a parabola that changes with a, a number line, a fraction, a triangle
// with its sides, a small table of values. The model writes only data; code checks it with the
// checks a question's figure gets and draws it. What does not stand exactly as written is dropped,
// never repaired (Regel 0): the explanation then stands without its picture, which it must read
// whole without anyway.

import {
  BarChartFigure,
  FractionFigure,
  FunctionPlotFigure,
  GeometryFigure,
  LineChartFigure,
  NumberLineFigure,
  TableFigure,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { figureHolds } from './figureCheck.js';
import { wholeDrawing } from './items.js';

/**
 * The figures an explanation may show: the ones that make an idea visible on their own. Not the
 * whole union — it would be 22 kB of schema for one call (measured 10.10.); these are 5.8 kB.
 */
export const ExplainFigure = z.discriminatedUnion('type', [
  FunctionPlotFigure,
  NumberLineFigure,
  FractionFigure,
  GeometryFigure,
  TableFigure,
  BarChartFigure,
  LineChartFigure,
]);
export type ExplainFigure = z.infer<typeof ExplainFigure>;

/** What the model is told about the picture, beside the field's own words. */
export const EXPLAIN_FIGURE_RULE = `A PICTURE ("figure") only where it makes the idea visible — a graph that changes with a parameter (several functions in one function_plot to compare), a number line, a fraction, a triangle with its sides and angles, a small table of values or a chart. As data, the app draws it: function_plot expressions use x, numbers, + - * / ^, sqrt, abs, sin, cos, tan, ln, log, exp, pi; a geometry figure is drawn to scale, so its coordinates must give every side and angle it states. The explanation reads whole without the picture; otherwise figure is null.`;

/**
 * The figure an explanation shows, or null: one of `ExplainFigure`, drawable exactly as written
 * (`wholeDrawing`: no function the app cannot read, no segment to a point that is not there), and
 * holding what it states (`figureHolds`: a triangle's sides and angles agree with its coordinates).
 */
export function explanationFigure(raw: unknown): ExplainFigure | null {
  if (raw === null || raw === undefined) return null;
  const parsed = ExplainFigure.safeParse(raw);
  if (!parsed.success) return null;
  const drawn = wholeDrawing(parsed.data);
  return drawn !== null && figureHolds(drawn, '', false) ? drawn : null;
}
