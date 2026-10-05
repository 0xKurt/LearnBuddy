// Zeichnen auf dem Raster (issue #249, Baustein `RASTER` aus #224): a structured kind
// `grid_draw` whose answer is a DRAWING on a grid, checked exactly by code — never freehand,
// never compasses (decided in #224: only a grid can be checked exactly).
// docs/architecture.md §Practice ("Structured items" → "Grid").
//
// Four modes, one paper:
//   points — she plots given points A, B, C … in a coordinate system;
//   graph  — she sets points ON the graph of a linear or quadratic function; for a line two
//            points, and the app draws the line through them;
//   mirror — she mirrors a figure ABC … on squared paper at a vertical or horizontal axis by
//            setting A′, B′, C′ …;
//   bars   — she draws a bar chart from given data by pulling each bar to its height.
//
// The same three shapes as every structured kind (`structured.ts`): the stored task WITH its key
// (`items.task`, server only), the view without it (`ItemView.task_view`) and her answer
// (`AnswerRequest.parts`). Everything on the paper — the frame, the names, the figure, the axis,
// the bars and their scale — is computed by code from what the model chose
// (`apps/api/src/modules/practice/grid.ts`); a task whose key does not lie on the grid inside its
// frame is never stored (#224, Regel 0).
//
// The maxima are what a 360×740 phone holds with the key row under the paper and Buddy's reply
// above it (CLAUDE.md rule 16), shot in tests/web/grid.spec.ts.

import { z } from 'zod';

/**
 * The fewest units a side of the paper spans, and the most across and up. Up is the scarce
 * direction: on 360×740, under a three-line question and Buddy's two-line reply, with the key row
 * and the input bar below, six rows of the smallest square are what is left (tests/web/grid.spec.ts,
 * the feedback shots; eight rows were 118 pt too tall).
 */
export const GRID_SPAN_MIN = 4;
export const GRID_SPAN_MAX = 8;
export const GRID_ROWS_MAX = 6;
/** How far from 0 a coordinate the model writes may lie (before code fits a frame around it). */
export const GRID_COORD_MAX = 20;
/** Points to plot, vertices of a figure to mirror, points to set on a graph. */
export const GRID_POINTS_MIN = 2;
/** Four points to plot: their coordinates stand in the question, which keeps to three lines. */
export const GRID_POINTS_MAX = 4;
export const GRID_FIGURE_MIN = 3;
export const GRID_FIGURE_MAX = 6;
/** A graph: two points for a line, three to five for a parabola. */
export const GRID_GRAPH_POINTS_MAX = 5;
/** Bars of a chart; a bar's label is one word under its column. */
export const GRID_BARS_MIN = 2;
export const GRID_BARS_MAX = 6;
export const GRID_BAR_LABEL_MAX = 8;
/**
 * The longest label `n` bars may have: on a 360-pt phone a column is about 73 pt wide with four
 * bars and 49 pt with six, and a label stands under its own column only (tests/web/grid.spec.ts).
 */
export function gridBarLabelMax(n: number): number {
  return n <= 4 ? GRID_BAR_LABEL_MAX : 6;
}
/** The biggest value a bar may stand for (the scale's step times the rows it may have). */
export const GRID_BAR_VALUE_MAX = 700;
/**
 * The steps a bar chart's scale may go in, smallest first. Code picks the smallest one every value
 * is a multiple of and with which the tallest bar fits the paper (`gridBarStep`).
 */
export const GRID_BAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100] as const;
/** The instruction above the paper, without its data: two lines of the question card at most. */
export const GRID_PROMPT_MAX = 60;

export const GridMode = z.enum(['points', 'graph', 'mirror', 'bars']);
export type GridMode = z.infer<typeof GridMode>;

const Coord = z.number().int().min(-GRID_COORD_MAX).max(GRID_COORD_MAX);

/** A crossing of the grid. */
export const GridXY = z.object({ x: Coord, y: Coord });
export type GridXY = z.infer<typeof GridXY>;

/**
 * The part of the plane the paper shows, in whole units. For bars x counts the columns and y the
 * scale's steps.
 */
export const GridFrame = z.object({ x_min: Coord, x_max: Coord, y_min: Coord, y_max: Coord });
export type GridFrame = z.infer<typeof GridFrame>;

/** A point's name as it is written on the paper: a capital, primed for a mirror image (A′). */
export const GridName = z.string().regex(/^[A-Z]′?$/);

/** A named point the paper shows (a vertex of the figure to mirror). */
export const GridNamedPoint = GridXY.extend({ name: GridName });
export type GridNamedPoint = z.infer<typeof GridNamedPoint>;

/** A mirror axis on a grid line or halfway between two (`at` is a multiple of 0.5). */
export const GridAxis = z.object({
  dir: z.enum(['vertical', 'horizontal']),
  at: z
    .number()
    .min(-GRID_COORD_MAX)
    .max(GRID_COORD_MAX)
    .refine((v) => Number.isInteger(v * 2), 'a grid line or halfway between two'),
});
export type GridAxis = z.infer<typeof GridAxis>;

/** A bar's id: given by the server (b1, b2 …), never the model's. */
const BarId = z.string().regex(/^b[1-9]$/);

const PointsSheet = z.object({
  mode: z.literal('points'),
  /** The points she sets, in the order she sets them (A, B, C …). */
  names: z.array(GridName).min(GRID_POINTS_MIN).max(GRID_POINTS_MAX),
});
const GraphSheet = z.object({
  mode: z.literal('graph'),
  /** How many points on the graph she sets (two for a line). */
  count: z.number().int().min(2).max(GRID_GRAPH_POINTS_MAX),
  /** The graph is a line: the app draws it through her two points. */
  line: z.boolean(),
});
const MirrorSheet = z.object({
  mode: z.literal('mirror'),
  /** The figure she mirrors, its vertices in order; it is drawn closed. */
  figure: z.array(GridNamedPoint).min(GRID_FIGURE_MIN).max(GRID_FIGURE_MAX),
  axis: GridAxis,
  /** The images she sets, in the figure's order (A′, B′, C′ …). */
  names: z.array(GridName).min(GRID_FIGURE_MIN).max(GRID_FIGURE_MAX),
});
const BarsSheet = z.object({
  mode: z.literal('bars'),
  bars: z
    .array(z.object({ id: BarId, label: z.string().trim().min(1).max(GRID_BAR_LABEL_MAX) }))
    .min(GRID_BARS_MIN)
    .max(GRID_BARS_MAX),
  /** What one row of the paper is worth. */
  step: z.number().int().min(1).max(GRID_BAR_VALUE_MAX),
});

/** What she sees on the paper. Never a key. */
export const GridSheetView = z.discriminatedUnion('mode', [
  PointsSheet,
  GraphSheet,
  MirrorSheet,
  BarsSheet,
]);
export type GridSheetView = z.infer<typeof GridSheetView>;

export const GridDrawTaskView = z.object({
  type: z.literal('grid_draw'),
  frame: GridFrame,
  sheet: GridSheetView,
});
export type GridDrawTaskView = z.infer<typeof GridDrawTaskView>;

/** The stored sheet: the view plus the key (server only). */
export const GridSheet = z.discriminatedUnion('mode', [
  PointsSheet.extend({ key: z.array(GridXY).min(GRID_POINTS_MIN).max(GRID_POINTS_MAX) }),
  GraphSheet.extend({
    /** The function in plain notation as code wrote it from its coefficients (2*x-1, x^2-2). */
    fn: z.string().min(1).max(60),
    /** Every crossing inside the frame the graph passes through: the solution. */
    key: z
      .array(GridXY)
      .min(2)
      .max(GRID_SPAN_MAX + 1),
  }),
  MirrorSheet.extend({ key: z.array(GridXY).min(GRID_FIGURE_MIN).max(GRID_FIGURE_MAX) }),
  BarsSheet.extend({
    values: z.array(z.number().int().min(0).max(GRID_BAR_VALUE_MAX)).max(GRID_BARS_MAX),
  }),
]);
export type GridSheet = z.infer<typeof GridSheet>;

export const GridDrawTask = z.object({
  type: z.literal('grid_draw'),
  frame: GridFrame,
  sheet: GridSheet,
});
export type GridDrawTask = z.infer<typeof GridDrawTask>;

/**
 * What she sends. `points` for points, graph and mirror — in the order of the sheet's names (a
 * graph's in any order); `bars` for bars, every bar once with the value she pulled it to.
 */
export const GridDrawAnswer = z.object({
  type: z.literal('grid_draw'),
  points: z.array(GridXY).max(Math.max(GRID_POINTS_MAX, GRID_FIGURE_MAX, GRID_GRAPH_POINTS_MAX)),
  bars: z
    .array(z.object({ id: BarId, value: z.number().int().min(0).max(GRID_BAR_VALUE_MAX) }))
    .max(GRID_BARS_MAX),
});
export type GridDrawAnswer = z.infer<typeof GridDrawAnswer>;

// ─────────────── one notation, server and app ───────────────

/** A number as the paper writes it: a real minus sign (U+2212), never a hyphen. */
export function gridNumber(v: number): string {
  return v < 0 ? `−${Math.abs(v)}` : String(v);
}

/**
 * A point as it is written everywhere — her answer in the conversation, the line under the paper,
 * the solution: `A(2|−3)`. The vertical bar is the school notation in German and stays one
 * notation in every language: a comma would read as a decimal comma in four of the app's five.
 * No space inside: a line never breaks within a point (the question card wraps at any whitespace,
 * a no-break space included — seen in tests/web/grid.spec.ts, 249c).
 */
export function gridPointText(name: string | null, p: GridXY): string {
  return `${name ?? ''}(${gridNumber(p.x)}|${gridNumber(p.y)})`;
}

/** The names of `n` points: A, B, C …; primed for the images of a mirror. */
export function gridNames(n: number, primed = false): string[] {
  return Array.from({ length: n }, (_, i) => `${String.fromCharCode(65 + i)}${primed ? '′' : ''}`);
}

/** A point mirrored at a vertical or horizontal axis. */
export function mirrorPoint(p: GridXY, axis: GridAxis): GridXY {
  return axis.dir === 'vertical'
    ? { x: 2 * axis.at - p.x, y: p.y }
    : { x: p.x, y: 2 * axis.at - p.y };
}

/** Is the crossing on the paper? */
export function inFrame(p: GridXY, f: GridFrame): boolean {
  return p.x >= f.x_min && p.x <= f.x_max && p.y >= f.y_min && p.y <= f.y_max;
}

/**
 * What she drew, in words — the line under the paper, her answer in the conversation, and (with
 * the key) the solution: one implementation. Points by name, a graph's points by place, bars by
 * label and value.
 */
export function gridDrawnText(
  sheet: GridSheetView,
  drawn: Pick<GridDrawAnswer, 'points' | 'bars'>,
  joiner = ', ',
): string {
  switch (sheet.mode) {
    case 'points':
    case 'mirror':
      return drawn.points.map((p, i) => gridPointText(sheet.names[i] ?? null, p)).join(joiner);
    case 'graph':
      return drawn.points.map((p) => gridPointText(null, p)).join(joiner);
    case 'bars': {
      const value = new Map(drawn.bars.map((b) => [b.id, b.value]));
      return sheet.bars.map((b) => `${b.label} ${gridNumber(value.get(b.id) ?? 0)}`).join(joiner);
    }
  }
}
