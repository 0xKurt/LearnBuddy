// Zeichnen auf Raster (issue #249): points, the line through two of them, filled squares, bars
// pulled to their height. docs/architecture.md §Practice ("Interactive figures").
//
// Only on a grid (#224 decided: no freehand, no compass) — because only a grid is exactly
// checkable. Regel 0 of #224, both directions, all code:
//   1. What the MODEL wrote is solvable on the grid it gave: every key point and square lies on
//      it, a mirror image is computed by CODE from the shape and its mirror line (the model never
//      writes it), a line has at least two grid points in range, a graph at least as many as she
//      is asked to set. Otherwise no question is stored.
//   2. What SHE drew is compared with the key by code:
//        points    — the same set of points (a mirror image too);
//        line      — slope and y-intercept of the line through her two points against fn's;
//        on_graph  — every point of hers lies on the graph of fn (shared-math `expression.ts`);
//        cells     — the same set of squares;
//        bars      — every bar at its height.
//      The reply names the point, square count or bar that is wrong.

import {
  axisOnGrid,
  cellOnPlane,
  closeTo,
  graphPoints,
  lineOf,
  lineThrough,
  mirrorCell,
  mirrorPoint,
  onGraph,
  onGrid,
  onPlane,
  samePoint,
  sameValue,
  type Pt,
} from '@learnbuddy/shared-math';
import {
  BAR_LABEL_MAX,
  DRAW_CELLS_MAX,
  DRAW_POINTS_MAX,
  GridDrawTask,
  MARK_LABEL_MAX,
  PLANE_STEPS_MAX,
  PLANE_STEPS_MIN,
  TAP_BARS_MAX,
  TAP_BARS_MIN,
  type DrawTool,
  type GridCell,
  type GridDrawAnswer,
  type GridDrawTaskView,
  type MirrorLine,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { numberWords, planeProblem, pointWords, type FigureProblem } from './figureTap.js';

/** Why a drawing task is not stored. Each one is a test (`__tests__/gridDraw.test.ts`). */
export type DrawProblem =
  | FigureProblem
  /** The task's own parts are missing (points for `points`, fn for `line` …) or too many. */
  | 'draw_form'
  /** A mirror line that is not on a grid line or halfway between two. */
  | 'mirror_axis'
  /** The mirror image leaves the grid, or is the shape itself (everything on the line). */
  | 'mirror_image'
  /** fn cannot be read, or is no straight line for `line`. */
  | 'fn'
  /** Fewer grid points on the graph than she is asked to set: unsolvable on this grid. */
  | 'unsolvable'
  /** Two points or squares that are the same. */
  | 'duplicate_point';

export const GRID_DRAW_RULES = `Drawing tasks ("structured", type "grid_draw"): only when the answer is drawn on a grid and nothing else — points to plot, a straight line, a graph through points, a shape mirrored on squared paper, squares to colour, a bar chart to draw. grid: x_min, x_max, y_min, y_max, step (${PLANE_STEPS_MIN}–${PLANE_STEPS_MAX} steps per axis, every bound a multiple of step), axes: true for a coordinate system, false for plain squared paper. task and what it needs (everything else null): "points" — points: the points to plot {x, y, label}; "mirror_points" — points: the shape to mirror {x, y, label}, closed: true to join them into a polygon, mirror: the mirror line {direction "vertical" (x = at) or "horizontal" (y = at), at}; "line" — fn: the straight line, in x (2*x-1); "on_graph" — fn: the function in x, count: how many points of it to plot (2–${DRAW_POINTS_MAX}); "cells" — cells: the squares to colour {x, y} by their lower-left corner; "mirror_cells" — cells: the coloured shape to mirror, mirror as above; "bars" — bars: ${TAP_BARS_MIN}–${TAP_BARS_MAX} {label, value} (label up to ${BAR_LABEL_MAX} characters), y_min 0 and every value a multiple of step. Every point, square and value lies on the grid, and so does the answer — the app computes a mirror image itself and drops a task whose image leaves the grid. prompt: what to draw; it never draws the answer for them. If the drawing could be right in two ways not listed here, write no drawing task.`;

const Num = z.number().finite();
const Label = z.string().trim().min(1).max(40);

export const DrawTask = z.enum([
  'points',
  'mirror_points',
  'line',
  'on_graph',
  'cells',
  'mirror_cells',
  'bars',
]);
export type DrawTask = z.infer<typeof DrawTask>;

/** The model's drawing task: a grid, what to do, and what that needs — never a mirror image. */
export const GridDrawDraftBase = z.object({
  type: z.literal('grid_draw'),
  prompt: z.string().trim().min(1).max(400).describe('What to draw; never the answer itself'),
  grid: z.object({
    x_min: Num,
    x_max: Num,
    y_min: Num,
    y_max: Num,
    step: Num,
    axes: z.boolean(),
  }),
  task: DrawTask,
  points: z
    .array(z.object({ x: Num, y: Num, label: Label.nullable() }))
    .max(DRAW_POINTS_MAX * 2)
    .nullable()
    .default(null)
    .describe('points: the points to plot; mirror_points: the shape to mirror; else null'),
  closed: z.boolean().default(false).describe('mirror_points: join the shape into a polygon'),
  cells: z
    .array(z.object({ x: Num, y: Num }))
    .max(DRAW_CELLS_MAX * 2)
    .nullable()
    .default(null)
    .describe('cells: the squares to colour; mirror_cells: the shape to mirror; else null'),
  mirror: z
    .object({ direction: z.enum(['vertical', 'horizontal']), at: Num })
    .nullable()
    .default(null)
    .describe('mirror_points and mirror_cells: the mirror line; else null'),
  fn: z.string().trim().min(1).max(80).nullable().default(null).describe('line, on_graph: f(x)'),
  count: z.number().int().nullable().default(null).describe('on_graph: points to plot'),
  bars: z
    .array(z.object({ label: Label, value: Num }))
    .max(TAP_BARS_MAX * 2)
    .nullable()
    .default(null)
    .describe('bars: the bars with their heights; else null'),
});
export type GridDrawDraft = z.infer<typeof GridDrawDraftBase>;

// ─────────────── Regel 0: what the model wrote ───────────────

function distinctPoints(points: readonly Pt[], step: number): boolean {
  return points.every((p, i) => points.findIndex((q) => samePoint(p, q, step)) === i);
}

/** What is wrong with a stored or built drawing task, or null when it holds together. */
export function gridDrawProblem(task: GridDrawTask): DrawProblem | null {
  const g = task.grid;
  const bad = planeProblem(g);
  if (bad) return bad;
  const s = g.step;
  const { given, goal } = task;
  if (!given.marks.every((m) => onPlane(m, g))) return 'off_grid';
  if (given.marks.some((m) => (m.label?.length ?? 0) > MARK_LABEL_MAX)) return 'figure_text';
  if (!given.cells.every((c) => cellOnPlane(c, g))) return 'off_grid';
  if (given.mirror && !axisOnGrid(given.mirror, g)) return 'mirror_axis';
  switch (goal.check) {
    case 'points':
      if (!goal.points.every((p) => onPlane(p, g))) return 'off_grid';
      if (!distinctPoints(goal.points, s)) return 'duplicate_point';
      return null;
    case 'line': {
      if (!lineOf(goal.fn)) return 'fn';
      return graphPoints(goal.fn, g).length >= 2 ? null : 'unsolvable';
    }
    case 'on_graph':
      if (onGraph(goal.fn, { x: 0, y: 0 }) === null) return 'fn';
      return graphPoints(goal.fn, g).length >= goal.count ? null : 'unsolvable';
    case 'cells':
      if (!goal.cells.every((c) => cellOnPlane(c, g))) return 'off_grid';
      if (!distinctPoints(goal.cells, s)) return 'duplicate_point';
      return null;
    case 'bars': {
      if (g.y_min !== 0) return 'grid';
      if (goal.bars.length < TAP_BARS_MIN || goal.bars.length > TAP_BARS_MAX) return 'grid';
      if (goal.bars.some((b) => b.label.length > BAR_LABEL_MAX)) return 'figure_text';
      if (new Set(goal.bars.map((b) => b.label.toLocaleLowerCase('de'))).size !== goal.bars.length)
        return 'duplicate_point';
      if (!goal.bars.every((b) => onGrid(b.value, g.y_min, g.y_max, s))) return 'off_grid';
      return null;
    }
  }
}

function idAt(i: number): string {
  return String.fromCharCode(97 + i);
}

/** The images of a shape, or a reason: off the grid, or nothing moves (all on the line). */
function mirrored<T extends Pt>(
  shape: readonly T[],
  map: (p: T) => Pt,
  fits: (p: Pt) => boolean,
  step: number,
): Pt[] | DrawProblem {
  const images = shape.map(map);
  if (!images.every(fits)) return 'mirror_image';
  if (images.every((p, i) => samePoint(p, shape[i]!, step))) return 'mirror_image';
  return images;
}

/** The stored task for the model's draft, or why there is none. */
export function gridDrawTaskFrom(
  draft: Omit<GridDrawDraft, 'type' | 'prompt'>,
): GridDrawTask | DrawProblem {
  const g = { ...draft.grid };
  const s = g.step;
  if (!(s > 0)) return 'grid';
  const none = { marks: [], closed: false, cells: [], mirror: null as MirrorLine | null };
  let task: GridDrawTask;
  switch (draft.task) {
    case 'points': {
      if (!draft.points || draft.points.length === 0 || draft.points.length > DRAW_POINTS_MAX)
        return 'draw_form';
      task = {
        type: 'grid_draw',
        grid: g,
        given: none,
        goal: { check: 'points', points: draft.points.map((p) => ({ x: p.x, y: p.y })) },
      };
      break;
    }
    case 'mirror_points': {
      if (!draft.points || draft.points.length === 0 || draft.points.length > DRAW_POINTS_MAX)
        return 'draw_form';
      if (!draft.mirror) return 'draw_form';
      const axis = draft.mirror;
      if (!axisOnGrid(axis, g)) return 'mirror_axis';
      const images = mirrored(
        draft.points,
        (p) => mirrorPoint(p, axis),
        (p) => onPlane(p, g),
        s,
      );
      if (typeof images === 'string') return images;
      task = {
        type: 'grid_draw',
        grid: g,
        given: {
          marks: draft.points,
          closed: draft.closed && draft.points.length >= 3,
          cells: [],
          mirror: axis,
        },
        // Points ON the mirror line are their own image: drawn already, so not asked for.
        goal: {
          check: 'points',
          points: images.filter((p, i) => !samePoint(p, draft.points![i]!, s)),
        },
      };
      break;
    }
    case 'line':
      if (!draft.fn) return 'draw_form';
      task = { type: 'grid_draw', grid: g, given: none, goal: { check: 'line', fn: draft.fn } };
      break;
    case 'on_graph':
      if (!draft.fn || draft.count === null || draft.count < 2 || draft.count > DRAW_POINTS_MAX)
        return 'draw_form';
      task = {
        type: 'grid_draw',
        grid: g,
        given: none,
        goal: { check: 'on_graph', fn: draft.fn, count: draft.count },
      };
      break;
    case 'cells': {
      if (!draft.cells || draft.cells.length === 0 || draft.cells.length > DRAW_CELLS_MAX)
        return 'draw_form';
      task = {
        type: 'grid_draw',
        grid: g,
        given: none,
        goal: { check: 'cells', cells: draft.cells },
      };
      break;
    }
    case 'mirror_cells': {
      if (!draft.cells || draft.cells.length === 0 || draft.cells.length > DRAW_CELLS_MAX)
        return 'draw_form';
      if (!draft.mirror) return 'draw_form';
      const axis = draft.mirror;
      if (!axisOnGrid(axis, g)) return 'mirror_axis';
      if (!draft.cells.every((c) => cellOnPlane(c, g))) return 'off_grid';
      const images = mirrored(
        draft.cells,
        (c) => mirrorCell(c, axis, s),
        (c) => cellOnPlane(c, g),
        s,
      );
      if (typeof images === 'string') return images;
      // The given shape stays coloured; her answer is the mirror half (squares the line cuts
      // through are their own image and are part of both).
      const fresh = images.filter((c) => !draft.cells!.some((d) => samePoint(c, d, s)));
      if (fresh.length === 0) return 'mirror_image';
      task = {
        type: 'grid_draw',
        grid: g,
        given: { marks: [], closed: false, cells: draft.cells, mirror: axis },
        goal: { check: 'cells', cells: fresh },
      };
      break;
    }
    case 'bars': {
      if (!draft.bars) return 'draw_form';
      if (draft.bars.length < TAP_BARS_MIN || draft.bars.length > TAP_BARS_MAX) return 'grid';
      // A bar chart's x axis is its bars: one column (one step wide) each, whatever x the
      // model wrote.
      g.x_min = 0;
      g.x_max = draft.bars.length * s;
      task = {
        type: 'grid_draw',
        grid: g,
        given: none,
        goal: {
          check: 'bars',
          bars: draft.bars.map((b, i) => ({ id: idAt(i), label: b.label, value: b.value })),
        },
      };
      break;
    }
  }
  const parsed = GridDrawTask.safeParse(task);
  if (!parsed.success) return 'grid';
  return gridDrawProblem(parsed.data) ?? parsed.data;
}

// ─────────────── the view and the words ───────────────

function toolOf(task: GridDrawTask): DrawTool {
  switch (task.goal.check) {
    case 'points':
    case 'on_graph':
      return 'points';
    case 'line':
      return 'line';
    case 'cells':
      return 'cells';
    case 'bars':
      return 'bars';
  }
}

function needsOf(task: GridDrawTask): number | null {
  switch (task.goal.check) {
    case 'points':
      return task.goal.points.length;
    case 'line':
      return 2;
    case 'on_graph':
      return task.goal.count;
    case 'cells':
    case 'bars':
      return null;
  }
}

export function gridDrawView(task: GridDrawTask): GridDrawTaskView {
  return {
    type: 'grid_draw',
    grid: task.grid,
    given: task.given,
    tool: toolOf(task),
    needs: needsOf(task),
    bars:
      task.goal.check === 'bars' ? task.goal.bars.map((b) => ({ id: b.id, label: b.label })) : [],
  };
}

/** A function as she reads it: 2x-1 → "2x − 1", x^2 stays, * → ·. */
export function fnWords(fn: string): string {
  return fn
    .replace(/\s+/g, '')
    .replace(/\*/g, '·')
    .replace(/(?<=[^(^eE])-/g, ' − ')
    .replace(/\+/g, ' + ')
    .replace(/^-/, '−');
}

function pointsWords(locale: string, points: readonly Pt[]): string {
  return points.map((p) => pointWords(locale, p)).join(', ');
}

/** The squares as she reads them: "(1 | 2), (2 | 2)" by their lower-left corner. */
function cellsWords(locale: string, cells: readonly GridCell[]): string {
  return t(locale, 'practice.draw.cells_words', {
    count: cells.length,
    cells: pointsWords(locale, cells),
  });
}

/** The solution as she reads it ("Lösung zeigen", the summary): what the key is, in words. */
export function gridDrawSolution(locale: string, task: GridDrawTask): string {
  const g = task.goal;
  switch (g.check) {
    case 'points':
      return pointsWords(locale, g.points);
    case 'line': {
      const two = graphPoints(g.fn, task.grid).slice(0, 2);
      return t(locale, 'practice.draw.line_solution', {
        fn: fnWords(g.fn),
        points: pointsWords(locale, two),
      });
    }
    case 'on_graph': {
      const some = graphPoints(g.fn, task.grid).slice(0, g.count);
      return t(locale, 'practice.draw.graph_solution', {
        fn: fnWords(g.fn),
        points: pointsWords(locale, some),
      });
    }
    case 'cells':
      return cellsWords(locale, g.cells);
    case 'bars':
      return g.bars.map((b) => `${b.label}: ${numberWords(locale, b.value)}`).join(', ');
  }
}

/** Her drawing in one line for the conversation, in the same words as the solution. */
export function gridDrawAnswerText(
  locale: string,
  task: GridDrawTask,
  answer: GridDrawAnswer,
): string {
  if (task.goal.check === 'bars') {
    const label = new Map(task.goal.bars.map((b) => [b.id, b.label]));
    return answer.bars
      .map((b) => `${label.get(b.id) ?? ''}: ${numberWords(locale, b.value)}`)
      .join(', ');
  }
  if (task.goal.check === 'cells') return cellsWords(locale, answer.cells);
  return pointsWords(locale, answer.points);
}

// ─────────────── Regel 0: her drawing ───────────────

export type GridDrawCheck = {
  type: 'grid_draw';
  correct: boolean;
  /** How it is off, with the one part the reply names. */
  miss:
    | null
    | { kind: 'points'; right: number; total: number; wrong: Pt | null; missing: number }
    | { kind: 'line'; slope: boolean; intercept: boolean; off: Pt | null }
    | { kind: 'vertical' }
    | { kind: 'same_x' }
    | { kind: 'graph'; right: number; total: number; off: Pt | null }
    | { kind: 'cells'; missing: number; extra: number }
    | { kind: 'bars'; right: number; total: number; label: string };
};

/** Is her drawing made of parts of this grid and this tool? Anything else was never drawn here. */
function fits(task: GridDrawTask, a: GridDrawAnswer): boolean {
  const g = task.grid;
  const tool = toolOf(task);
  const s = g.step;
  if (tool === 'points' || tool === 'line') {
    if (a.cells.length > 0 || a.bars.length > 0) return false;
    if (tool === 'line' && a.points.length > 2) return false;
    return a.points.every((p) => onPlane(p, g)) && distinctPoints(a.points, s);
  }
  if (tool === 'cells') {
    if (a.points.length > 0 || a.bars.length > 0) return false;
    return a.cells.every((c) => cellOnPlane(c, g)) && distinctPoints(a.cells, s);
  }
  if (a.points.length > 0 || a.cells.length > 0 || task.goal.check !== 'bars') return false;
  const ids = task.goal.bars.map((b) => b.id);
  if (a.bars.length !== ids.length) return false;
  if (new Set(a.bars.map((b) => b.id)).size !== ids.length) return false;
  return a.bars.every((b) => ids.includes(b.id) && onGrid(b.value, g.y_min, g.y_max, s));
}

/**
 * Her drawing against the key, or null when it is no drawing on this grid with this tool (a
 * point between grid points, the same point twice, a bar missing) — refused, never graded.
 */
export function checkGridDraw(task: GridDrawTask, answer: GridDrawAnswer): GridDrawCheck | null {
  if (!fits(task, answer)) return null;
  const s = task.grid.step;
  const goal = task.goal;
  const ok = (): GridDrawCheck => ({ type: 'grid_draw', correct: true, miss: null });
  const no = (miss: NonNullable<GridDrawCheck['miss']>): GridDrawCheck => ({
    type: 'grid_draw',
    correct: false,
    miss,
  });
  switch (goal.check) {
    case 'points': {
      const hits = answer.points.filter((p) => goal.points.some((k) => samePoint(p, k, s)));
      const wrong = answer.points.find((p) => !goal.points.some((k) => samePoint(p, k, s))) ?? null;
      if (hits.length === goal.points.length && wrong === null) return ok();
      return no({
        kind: 'points',
        right: hits.length,
        total: goal.points.length,
        wrong,
        missing: Math.max(0, goal.points.length - hits.length),
      });
    }
    case 'line': {
      const [a, b] = answer.points;
      if (!a || !b) return no({ kind: 'line', slope: false, intercept: false, off: a ?? null });
      const want = lineOf(goal.fn);
      const have = lineThrough(a, b);
      if (!want) return null;
      if (!have) return no({ kind: 'vertical' });
      const slope = closeTo(have.m, want.m);
      const intercept = closeTo(have.b, want.b);
      if (slope && intercept) return ok();
      // The point to look at: one that is off the line (both are when the slope is right).
      const off = onGraph(goal.fn, a) ? b : a;
      return no({ kind: 'line', slope, intercept, off });
    }
    case 'on_graph': {
      const xs = answer.points.map((p) => p.x);
      if (xs.some((x, i) => xs.findIndex((y) => sameValue(x, y, s)) !== i))
        return no({ kind: 'same_x' });
      const on = answer.points.filter((p) => onGraph(goal.fn, p) === true);
      const off = answer.points.find((p) => onGraph(goal.fn, p) !== true) ?? null;
      if (on.length >= goal.count && off === null) return ok();
      return no({ kind: 'graph', right: on.length, total: goal.count, off });
    }
    case 'cells': {
      const missing = goal.cells.filter(
        (k) => !answer.cells.some((c) => samePoint(c, k, s)),
      ).length;
      const extra = answer.cells.filter((c) => !goal.cells.some((k) => samePoint(c, k, s))).length;
      if (missing === 0 && extra === 0) return ok();
      return no({ kind: 'cells', missing, extra });
    }
    case 'bars': {
      const height = new Map(answer.bars.map((b) => [b.id, b.value]));
      const wrong = goal.bars.filter((b) => !sameValue(height.get(b.id) ?? Number.NaN, b.value, s));
      if (wrong.length === 0) return ok();
      return no({
        kind: 'bars',
        right: goal.bars.length - wrong.length,
        total: goal.bars.length,
        label: wrong[0]!.label,
      });
    }
  }
}

/** The reply to a wrong drawing: what is right, and the one part to look at. */
export function gridDrawReply(locale: string, check: GridDrawCheck): string {
  const m = check.miss;
  if (m === null) return t(locale, 'practice.correct');
  switch (m.kind) {
    case 'points': {
      const parts: string[] = [];
      if (m.wrong)
        parts.push(t(locale, 'practice.draw.point_wrong', { point: pointWords(locale, m.wrong) }));
      if (m.missing > 0)
        parts.push(t(locale, 'practice.draw.points_missing', { count: m.missing }));
      return parts.join(' ');
    }
    case 'line':
      if (m.slope && !m.intercept) return t(locale, 'practice.draw.line_slope_right');
      if (m.intercept && !m.slope) return t(locale, 'practice.draw.line_intercept_right');
      return m.off
        ? t(locale, 'practice.draw.line_point_off', { point: pointWords(locale, m.off) })
        : t(locale, 'practice.draw.line_needs_two');
    case 'vertical':
      return t(locale, 'practice.draw.line_vertical');
    case 'same_x':
      return t(locale, 'practice.draw.same_x');
    case 'graph':
      return m.off
        ? t(locale, 'practice.draw.graph_point_off', { point: pointWords(locale, m.off) })
        : t(locale, 'practice.draw.points_missing', { count: m.total - m.right });
    case 'cells':
      if (m.missing > 0 && m.extra > 0)
        return t(locale, 'practice.draw.cells_both', { missing: m.missing, extra: m.extra });
      return m.missing > 0
        ? t(locale, 'practice.draw.cells_missing', { count: m.missing })
        : t(locale, 'practice.draw.cells_extra', { count: m.extra });
    case 'bars':
      return t(locale, 'practice.draw.bar_wrong', { label: m.label });
  }
}
