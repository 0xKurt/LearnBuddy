// Figures that go with a question: data the model writes and the app draws
// (never an image the model invents). docs/architecture.md §Practice.
// Coordinates are plain numbers; function expressions use the small grammar of
// @learnbuddy/shared-math `evaluateExpression` (x, + − · / ^, sqrt, sin, …).

import { z } from 'zod';

import { CodeFigure } from './code.js';
import { StaffFigure } from './staff.js';

const Label = z.string().trim().min(1).max(40);
const Num = z.number().finite();

export const FractionFigure = z.object({
  type: z.literal('fraction'),
  shape: z.enum(['circle', 'bar']),
  /** One to three fractions side by side (e.g. to compare 2/3 and 3/5). */
  fractions: z
    .array(
      z.object({ parts: z.number().int().min(1).max(24), filled: z.number().int().min(0).max(24) }),
    )
    .min(1)
    .max(3),
});

export const NumberLineFigure = z.object({
  type: z.literal('number_line'),
  min: Num,
  max: Num,
  step: Num.positive(),
  points: z.array(z.object({ value: Num, label: Label.nullable() })).max(8),
});

export const FunctionPlotFigure = z.object({
  type: z.literal('function_plot'),
  functions: z
    .array(z.object({ expr: z.string().trim().min(1).max(80), label: Label.nullable() }))
    .max(3),
  x_min: Num,
  x_max: Num,
  y_min: Num,
  y_max: Num,
  points: z.array(z.object({ x: Num, y: Num, label: Label.nullable() })).max(8),
});

export const BarChartFigure = z.object({
  type: z.literal('bar_chart'),
  bars: z
    .array(z.object({ label: Label, value: Num }))
    .min(1)
    .max(12),
  unit: z.string().trim().max(20).nullable(),
});

export const GeometryFigure = z.object({
  type: z.literal('geometry'),
  points: z
    .array(z.object({ name: z.string().trim().min(1).max(3), x: Num, y: Num }))
    .min(1)
    .max(12),
  /** Segments and polygons refer to point names. */
  segments: z.array(z.object({ from: z.string(), to: z.string() })).max(16),
  polygons: z.array(z.array(z.string()).min(3).max(8)).max(4),
  circles: z.array(z.object({ center: z.string(), radius: Num.positive() })).max(3),
});

export const TableFigure = z.object({
  type: z.literal('table'),
  header: z.array(z.string().trim().max(40)).min(1).max(6),
  rows: z
    .array(z.array(z.string().trim().max(40)).min(1).max(6))
    .min(1)
    .max(10),
});

/**
 * The figures the MODEL may write next to a question of its own (`ItemDraft.figure`).
 *
 * The note line (`StaffFigure`, issue #226) is deliberately not among them. Every other figure
 * here illustrates a question whose key the model also wrote, and a wrong picture next to a
 * right key costs at most a confusing drawing. A note line is different: the key IS read off
 * the drawing — the note's name, the interval, the time signature — so a line that does not
 * match would make the key wrong, and the rule check would then reject a right answer with
 * full authority (the lesson of issue #157). Note lines therefore only ever come out of
 * `apps/api/src/modules/practice/staff.ts`, which computes the question, the drawing and the
 * key from one reviewed task.
 */
export const ModelFigure = z.discriminatedUnion('type', [
  FractionFigure,
  NumberLineFigure,
  FunctionPlotFigure,
  BarChartFigure,
  GeometryFigure,
  TableFigure,
]);
export type ModelFigure = z.infer<typeof ModelFigure>;

/** Every figure a question can SHOW (`ItemView.figure`) — the model's six, the note line, a program. */
export const Figure = z.discriminatedUnion('type', [
  FractionFigure,
  NumberLineFigure,
  FunctionPlotFigure,
  BarChartFigure,
  GeometryFigure,
  TableFigure,
  StaffFigure,
  // A program whose output or failing line is asked: code writes it, from the program it ran
  // (issue #262) — for the same reason as the note line, it is not in `ModelFigure`.
  CodeFigure,
]);
export type Figure = z.infer<typeof Figure>;
