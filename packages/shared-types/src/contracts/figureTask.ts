// Figures she WORKS with (issues #248, #249): tapping a place in a figure, drawing on a grid.
// docs/architecture.md §Practice ("Interactive figures").
//
// Both are structured kinds (contracts/structured.ts): a stored task WITH the key
// (`items.task`), a view WITHOUT it (`ItemView.task_view`) and her answer (`AnswerRequest.parts`).
// What she answers is compared with the key by code, never by a model (#224, "Regel 0").
//
//   figure_tap (#248) — one tap is the answer: a point in a coordinate plane, a place on a
//                        number line, a bar of a chart, a time on a clock face.
//   grid_draw  (#249) — she draws on a grid: sets points (the line through two of them is
//                        drawn), fills squares, pulls bars up to their height.
//
// The figures are a family on purpose: the periodic table (#250), labelling (#252) and the
// figures after them add a member to `TapFigure` (and its `TapValue`), not a new mechanism.
//
// Grids are exact (packages/shared-math/src/grid.ts): every value she can give lies ON a grid
// point, a tap snaps to the nearest one, and the key must be one of them or the task is not
// stored. The caps below are what a 360×740 phone still draws with a 44 pt target per point —
// directly, or after one tap that magnifies the part she aims at (`lib/math/gridFrame.ts`).

import { z } from 'zod';

import { PartId } from './common.js';

const Num = z.number().finite();

/** Steps per axis: two at least (an axis needs a span), twenty at most (a phone's width). */
export const PLANE_STEPS_MIN = 2;
export const PLANE_STEPS_MAX = 20;
/** Marked points a figure may show next to the one she is asked for. */
export const TAP_MARKS_MAX = 6;
/** A point's name: A, B, P₁ … */
export const MARK_LABEL_MAX = 3;
/** Places on a number line: ticks times subdivisions. More is no longer one line on a phone. */
export const LINE_PLACES_MAX = 100;
/** Bars of a chart she taps or pulls: six keep every column at 44 pt on 360 pt. */
export const TAP_BARS_MIN = 2;
export const TAP_BARS_MAX = 6;
/** A bar's name under its column: a month, a country, a short word. */
export const BAR_LABEL_MAX = 10;
/** Points she may set on a drawing grid, and points a key may have. */
export const DRAW_POINTS_MAX = 10;
/** Squares she may fill (pixel art, a mirrored shape). */
export const DRAW_CELLS_MAX = 60;

const MarkLabel = z.string().trim().min(1).max(MARK_LABEL_MAX);

/** A grid of points: both axes from min to max in steps of `step` (shared-math `Plane`). */
export const PlaneGrid = z.object({
  x_min: Num,
  x_max: Num,
  y_min: Num,
  y_max: Num,
  step: Num.positive(),
  /** A coordinate system with axes and numbers, or plain squared paper (Karopapier). */
  axes: z.boolean(),
});
export type PlaneGrid = z.infer<typeof PlaneGrid>;

export const GridPoint = z.object({ x: Num, y: Num });
export type GridPoint = z.infer<typeof GridPoint>;

/** A point the figure shows, with its name (or none). */
export const GridMark = GridPoint.extend({ label: MarkLabel.nullable() });
export type GridMark = z.infer<typeof GridMark>;

// ─────────────── figure_tap (#248) ───────────────

/** A clock hand stops at every 5, 15 or 30 minutes — 12 places at most, each a 44 pt target. */
export const ClockSnap = z.union([z.literal(5), z.literal(15), z.literal(30)]);
export type ClockSnap = z.infer<typeof ClockSnap>;

export const TapBar = z.object({
  id: PartId,
  label: z.string().trim().min(1).max(BAR_LABEL_MAX),
  value: Num,
});
export type TapBar = z.infer<typeof TapBar>;

/** The figure she taps in. Never carries the key. */
export const TapFigure = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('plane'),
    grid: PlaneGrid,
    marks: z.array(GridMark).max(TAP_MARKS_MAX),
  }),
  z.object({
    kind: z.literal('number_line'),
    min: Num,
    max: Num,
    /** Between two numbered ticks. */
    step: Num.positive(),
    /** Where a tap lands: `step` or an even part of it (halves, quarters, fifths, tenths). */
    snap: Num.positive(),
    marks: z.array(z.object({ value: Num, label: MarkLabel.nullable() })).max(TAP_MARKS_MAX),
  }),
  z.object({
    kind: z.literal('bars'),
    bars: z.array(TapBar).min(TAP_BARS_MIN).max(TAP_BARS_MAX),
    unit: z.string().trim().max(12).nullable(),
  }),
  z.object({
    kind: z.literal('clock'),
    snap: ClockSnap,
  }),
]);
export type TapFigure = z.infer<typeof TapFigure>;
export type TapKind = TapFigure['kind'];

/** What a tap means — the key, and her answer. `kind` is the figure's. */
export const TapValue = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plane'), x: Num, y: Num }),
  z.object({ kind: z.literal('number_line'), value: Num }),
  z.object({ kind: z.literal('bars'), id: PartId }),
  z.object({
    kind: z.literal('clock'),
    h: z.number().int().min(1).max(12),
    m: z.number().int().min(0).max(59),
  }),
]);
export type TapValue = z.infer<typeof TapValue>;

export const FigureTapTask = z.object({
  type: z.literal('figure_tap'),
  figure: TapFigure,
  key: TapValue,
});
export type FigureTapTask = z.infer<typeof FigureTapTask>;

export const FigureTapTaskView = z.object({
  type: z.literal('figure_tap'),
  figure: TapFigure,
});
export type FigureTapTaskView = z.infer<typeof FigureTapTaskView>;

export const FigureTapAnswer = z.object({
  type: z.literal('figure_tap'),
  value: TapValue,
});
export type FigureTapAnswer = z.infer<typeof FigureTapAnswer>;

// ─────────────── grid_draw (#249) ───────────────

/** A mirror line: x = at (vertical) or y = at (horizontal), on a grid line or halfway. */
export const MirrorLine = z.object({
  direction: z.enum(['vertical', 'horizontal']),
  at: Num,
});
export type MirrorLine = z.infer<typeof MirrorLine>;

/** A square of the grid, by its lower-left corner. */
export const GridCell = z.object({ x: Num, y: Num });
export type GridCell = z.infer<typeof GridCell>;

/** What is on the grid before she starts: the shape to mirror, its mirror line. */
export const DrawGiven = z.object({
  marks: z.array(GridMark).max(DRAW_POINTS_MAX),
  /** Join the marks in order to a closed shape (a triangle to mirror). */
  closed: z.boolean(),
  cells: z.array(GridCell).max(DRAW_CELLS_MAX),
  mirror: MirrorLine.nullable(),
});
export type DrawGiven = z.infer<typeof DrawGiven>;

/**
 * What she does with her finger. Set by code from the goal, never by the model:
 *   points — tap a grid point to set it, tap it again to take it away;
 *   line   — the same, and the straight line through her first two points is drawn;
 *   cells  — tap a square to fill it, again to empty it;
 *   bars   — tap or pull a column to its height.
 */
export const DrawTool = z.enum(['points', 'line', 'cells', 'bars']);
export type DrawTool = z.infer<typeof DrawTool>;

export const DrawBar = z.object({ id: PartId, label: z.string().trim().min(1).max(BAR_LABEL_MAX) });
export type DrawBar = z.infer<typeof DrawBar>;

/**
 * The key and how it is checked (`practice/gridDraw.ts`):
 *   points      — exactly these points, in any order (also a mirror image: code computed them);
 *   line        — two different points, the line through them has the slope and y-intercept of `fn`;
 *   on_graph    — `count` points with different x, each on the graph of `fn`;
 *   cells       — exactly these squares (also a mirrored shape: code computed them);
 *   bars        — each bar at its height.
 */
export const DrawGoal = z.discriminatedUnion('check', [
  z.object({ check: z.literal('points'), points: z.array(GridPoint).min(1).max(DRAW_POINTS_MAX) }),
  z.object({ check: z.literal('line'), fn: z.string().trim().min(1).max(80) }),
  z.object({
    check: z.literal('on_graph'),
    fn: z.string().trim().min(1).max(80),
    count: z.number().int().min(2).max(DRAW_POINTS_MAX),
  }),
  z.object({ check: z.literal('cells'), cells: z.array(GridCell).min(1).max(DRAW_CELLS_MAX) }),
  z.object({
    check: z.literal('bars'),
    bars: z
      .array(DrawBar.extend({ value: Num }))
      .min(TAP_BARS_MIN)
      .max(TAP_BARS_MAX),
  }),
]);
export type DrawGoal = z.infer<typeof DrawGoal>;

export const GridDrawTask = z.object({
  type: z.literal('grid_draw'),
  grid: PlaneGrid,
  given: DrawGiven,
  goal: DrawGoal,
});
export type GridDrawTask = z.infer<typeof GridDrawTask>;

export const GridDrawTaskView = z.object({
  type: z.literal('grid_draw'),
  grid: PlaneGrid,
  given: DrawGiven,
  tool: DrawTool,
  /**
   * How many points or squares make her drawing complete ("Prüfen" waits until then): the
   * key's count for points, 2 for a line, `count` for points on a graph. Null where any
   * number may be right (squares) or everything is always set (bars). It says nothing a
   * prompt does not say already ("Setze die drei Spiegelpunkte").
   */
  needs: z.number().int().min(1).max(DRAW_POINTS_MAX).nullable(),
  /** The bars she pulls (tool `bars`), from the grid's y_min; empty otherwise. */
  bars: z.array(DrawBar).max(TAP_BARS_MAX),
});
export type GridDrawTaskView = z.infer<typeof GridDrawTaskView>;

export const GridDrawAnswer = z.object({
  type: z.literal('grid_draw'),
  /** Her points, in the order she set them (a line goes through the first two). */
  points: z.array(GridPoint).max(DRAW_POINTS_MAX),
  cells: z.array(GridCell).max(DRAW_CELLS_MAX),
  /** Every bar once, at the height she pulled it to. */
  bars: z.array(z.object({ id: PartId, value: Num })).max(TAP_BARS_MAX),
});
export type GridDrawAnswer = z.infer<typeof GridDrawAnswer>;
