// Zeichnen auf dem Raster (issue #249): she plots points, sets points on a graph, mirrors a figure
// on squared paper or pulls the bars of a chart. docs/architecture.md §Practice ("Structured items"
// → "Grid"). A structured kind like mark and select_all: `structured.ts` dispatches here.
//
// Both directions of #224's "Regel 0", in code:
//
//   1. What the MODEL chose is checked before it is stored, and a task that fails gives no question
//      (nothing is repaired). The model picks the mode and its data — the points, the function, the
//      figure and its axis, the bars — and writes an instruction without a single digit. Code names
//      the points (A, B, C …), fits the paper around the data, mirrors the figure, finds the
//      crossings the graph passes, picks the bar chart's scale and appends the data to the
//      instruction. A key that is not a crossing inside the paper is no task: a mirror image off
//      the grid, a graph with fewer whole-number points than she is to set, a scale no bar fits.
//      A function is held to what school draws on a grid — a line or a parabola — by checking it
//      against the polynomial through three of its own values; code then writes it itself
//      (`$y = 2x - 1$`), so the formula she reads cannot disagree with the one she is judged by.
//   2. What SHE drew is compared exactly — a point with its key point, a point of a graph by putting
//      it into the function, a bar with its value — and no model is asked. The reply names what is
//      not right yet: the point by its name, the bar by its label, a graph's point by its place.
//      Naming HER point does not solve it for her; it tells her where to look again.

import {
  GRID_BAR_LABEL_MAX,
  gridBarLabelMax,
  GRID_BAR_STEPS,
  GRID_BAR_VALUE_MAX,
  GRID_BARS_MAX,
  GRID_BARS_MIN,
  GRID_COORD_MAX,
  GRID_FIGURE_MAX,
  GRID_FIGURE_MIN,
  GRID_GRAPH_POINTS_MAX,
  GRID_POINTS_MAX,
  GRID_POINTS_MIN,
  GRID_PROMPT_MAX,
  GRID_ROWS_MAX,
  GRID_SPAN_MAX,
  GRID_SPAN_MIN,
  GridMode,
  gridDrawnText,
  gridNames,
  gridPointText,
  inFrame,
  mirrorPoint,
  StructuredTask,
  type GridAxis,
  type GridDrawAnswer,
  type GridDrawTask,
  type GridDrawTaskView,
  type GridFrame,
  type GridSheet,
  type GridXY,
  type PartId,
} from '@learnbuddy/shared-types/contracts';
import { compileExpression } from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { ItemDraft } from './items.js';

// ─────────────── what the model may write ───────────────

/** The paper a graph is drawn on: x from −GRAPH_X to GRAPH_X, y from −GRAPH_Y to GRAPH_Y. */
const GRAPH_X = GRID_SPAN_MAX / 2;
const GRAPH_Y = GRID_ROWS_MAX / 2;

/**
 * What the generator is told about grid tasks. Exact and minimal, without an example (models copy
 * examples — repo convention).
 */
export const GRID_RULES = `Grid tasks ("structured", type "grid_draw"): the learner DRAWS on a grid in the app — only where the drawing is the skill: plotting points in a coordinate system, drawing the graph of a linear or quadratic function, mirroring a figure on squared paper, drawing a bar chart from data. task "points": points = ${GRID_POINTS_MIN}–${GRID_POINTS_MAX} different points {x, y} with whole coordinates; together with the origin they span at most ${GRID_SPAN_MAX - 2} units in x and ${GRID_ROWS_MAX - 2} in y (the app names them A, B, C … in your order). task "graph": fn = the function of x in plain notation (* for times, ^ for powers), linear or quadratic; count = 2 for a line, 3–${GRID_GRAPH_POINTS_MAX} for a parabola; at least count points of the graph with whole x between −${GRAPH_X} and ${GRAPH_X} and whole y between −${GRAPH_Y} and ${GRAPH_Y}. task "mirror": points = the ${GRID_FIGURE_MIN}–${GRID_FIGURE_MAX} vertices of the figure in order, whole coordinates, all on one side of the axis; axis = "vertical" or "horizontal", axis_at = its x (vertical) or y (horizontal), a whole number or a half; the figure and its image together span at most ${GRID_SPAN_MAX - 2} squares across and ${GRID_ROWS_MAX - 2} up (the app names the vertices A, B, C …). task "bars": bars = ${GRID_BARS_MIN}–${GRID_BARS_MAX} {label: one word of at most ${GRID_BAR_LABEL_MAX} characters (${gridBarLabelMax(GRID_BARS_MAX)} with more than four bars), value: a whole number ≥ 0}, values steps of 1, 2, 5, 10, 20, 25, 50 or 100, the largest at most ${GRID_ROWS_MAX - 1} steps. Fields of another task stay null. prompt: the instruction, at most ${GRID_PROMPT_MAX} characters and WITHOUT ANY DIGIT — the app writes the points, the function or the values after it — never the answer.`;

/** A coordinate as the model writes it: parsed generously, held to the grid by code (`off_grid`). */
const Num = z.number().finite();

/** The model's grid task: the mode and its data — never a name, a frame, a scale or a key. */
export const GridDraftBase = z.object({
  type: z.literal('grid_draw'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(GRID_PROMPT_MAX * 4)
    .describe(
      `The instruction, at most ${GRID_PROMPT_MAX} characters, no digits; never the answer`,
    ),
  task: GridMode,
  points: z
    .array(z.object({ x: Num, y: Num }))
    .max(GRID_FIGURE_MAX * 2)
    .nullable()
    .default(null)
    .describe('points: the points to plot · mirror: the vertices in order · else null'),
  fn: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .nullable()
    .default(null)
    .describe('graph only: the function of x in plain notation'),
  count: z.number().int().nullable().default(null).describe('graph only: how many points she sets'),
  axis: z.enum(['vertical', 'horizontal']).nullable().default(null).describe('mirror only'),
  axis_at: Num.nullable().default(null).describe('mirror only: where the axis stands'),
  bars: z
    .array(z.object({ label: z.string().trim().min(1).max(40), value: Num }))
    .max(GRID_BARS_MAX * 2)
    .nullable()
    .default(null)
    .describe('bars only: the bars in order'),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});
export type GridDraft = Omit<z.infer<typeof GridDraftBase>, 'topic' | 'difficulty' | 'prompt_lang'>;

// ─────────────── Regel 0: what the model wrote, checked ───────────────

/** Why a grid task is not stored. Each one is a test (`__tests__/grid.test.ts`). */
export type GridProblem =
  /** Too few or too many points, vertices or bars, a count of the wrong size, a field missing. */
  | 'count'
  /** A field of another mode, or a digit in the instruction (the data comes from the task). */
  | 'form'
  /** The instruction or a bar's label over its cap. */
  | 'too_long'
  /** A coordinate that is not a whole number, a mirror image or axis off the grid. */
  | 'off_grid'
  /** The data does not fit the paper (more than GRID_SPAN_MAX units, a bar past the scale). */
  | 'too_big'
  /** Two points at one place, two bars with one label. */
  | 'duplicate'
  /** A function the app cannot read, or one that is neither a line nor a parabola. */
  | 'not_a_function'
  /** Fewer crossings on the graph inside the paper than she is to set. */
  | 'too_few_on_grid'
  /** A figure whose vertices lie on one line, or on both sides of the axis. */
  | 'degenerate'
  /** No step of the scale makes every value a whole number of rows. */
  | 'scale';

type Built = { problem: GridProblem } | { problem: null; task: GridDrawTask; givens: string };

const wholeOnGrid = (v: number) => Number.isInteger(v) && Math.abs(v) <= GRID_COORD_MAX;

/** Whole crossings, or null when one of them is not. */
function crossings(points: ReadonlyArray<{ x: number; y: number }>): GridXY[] | null {
  return points.every((p) => wholeOnGrid(p.x) && wholeOnGrid(p.y))
    ? points.map((p) => ({ x: p.x, y: p.y }))
    : null;
}

const key = (p: GridXY) => `${p.x},${p.y}`;
const distinct = (ps: readonly GridXY[]) => new Set(ps.map(key)).size === ps.length;

/**
 * One side of the paper around values from `lo` to `hi`: a unit of air beyond the data on both
 * sides — a point on the paper's edge has no room for its name — but none below 0 when nothing is
 * negative (a first-quadrant task keeps its axis at the edge), widened to GRID_SPAN_MIN on the high
 * side. Null when that is more than `max` units.
 */
function sideAround(lo: number, hi: number, max: number): [number, number] | null {
  const a = lo === 0 ? 0 : lo - 1;
  const b = Math.max(hi + 1, a + GRID_SPAN_MIN);
  return b - a > max ? null : [a, b];
}

/** A coordinate system around the points and the origin. */
function frameAround(points: readonly GridXY[]): GridFrame | null {
  const xs = [0, ...points.map((p) => p.x)];
  const ys = [0, ...points.map((p) => p.y)];
  const x = sideAround(Math.min(...xs), Math.max(...xs), GRID_SPAN_MAX);
  const y = sideAround(Math.min(...ys), Math.max(...ys), GRID_ROWS_MAX);
  return x && y ? { x_min: x[0], x_max: x[1], y_min: y[0], y_max: y[1] } : null;
}

function buildPoints(draft: GridDraft): Built {
  const points = draft.points ?? [];
  if (points.length < GRID_POINTS_MIN || points.length > GRID_POINTS_MAX)
    return { problem: 'count' };
  const at = crossings(points);
  if (!at) return { problem: 'off_grid' };
  if (!distinct(at)) return { problem: 'duplicate' };
  const frame = frameAround(at);
  if (!frame) return { problem: 'too_big' };
  const names = gridNames(at.length);
  return {
    problem: null,
    task: { type: 'grid_draw', frame, sheet: { mode: 'points', names, key: at } },
    givens: at.map((p, i) => gridPointText(names[i]!, p)).join(', '),
  };
}

// ── graph: a line or a parabola, read back as y = a·x² + b·x + c ──

type Ratio = { num: number; den: number };

/** A coefficient as a fraction with a denominator of at most 4, or null (no school graph). */
function ratio(v: number): Ratio | null {
  for (let den = 1; den <= 4; den++) {
    const num = Math.round(v * den);
    if (Math.abs(num - v * den) < 1e-9) return { num, den };
  }
  return null;
}

type Poly = { a: Ratio; b: Ratio; c: Ratio };

const valueOf = (r: Ratio) => r.num / r.den;
const evalPoly = (p: Poly, x: number) => valueOf(p.a) * x * x + valueOf(p.b) * x + valueOf(p.c);

/**
 * The function as a polynomial of degree two at most, or null. Three values fix the only such
 * polynomial; the function must then agree with it everywhere else it is tried — at whole and at
 * broken x, so a step function or a cube is caught and not drawn as a parabola.
 */
function polynomialOf(fn: string): Poly | null {
  const f = compileExpression(fn);
  if (!f) return null;
  const f0 = f(0);
  const f1 = f(1);
  const fm = f(-1);
  if (![f0, f1, fm].every(Number.isFinite)) return null;
  const a = ratio((f1 + fm) / 2 - f0);
  const b = ratio((f1 - fm) / 2);
  const c = ratio(f0);
  if (!a || !b || !c) return null;
  const poly = { a, b, c };
  for (const x of [-4, -3, -2, 2, 3, 4, 0.5, -1.5, 2.25]) {
    const y = f(x);
    if (!Number.isFinite(y) || Math.abs(y - evalPoly(poly, x)) > 1e-9) return null;
  }
  return poly;
}

/** One term of the polynomial, in plain notation (for the stored function) or in LaTeX. */
function term(r: Ratio, power: '' | 'x' | 'x^2', first: boolean, latex: boolean): string {
  if (r.num === 0) return '';
  const sign = r.num < 0 ? (first ? '-' : ' - ') : first ? '' : ' + ';
  const abs = { num: Math.abs(r.num), den: r.den };
  const one = abs.num === 1 && abs.den === 1 && power !== '';
  const coef = one
    ? ''
    : abs.den === 1
      ? String(abs.num)
      : latex
        ? `\\frac{${abs.num}}{${abs.den}}`
        : `${abs.num}/${abs.den}`;
  const x = latex ? power.replace('^2', '^{2}') : power;
  return `${sign}${coef}${!latex && coef && x ? '*' : ''}${x}`;
}

/** The polynomial written out: `2*x - 1` for the parser, `2x - 1` in LaTeX. */
function writePoly(p: Poly, latex: boolean): string {
  const parts: string[] = [];
  for (const [r, power] of [
    [p.a, 'x^2'],
    [p.b, 'x'],
    [p.c, ''],
  ] as const) {
    const s = term(r, power, parts.length === 0, latex);
    if (s) parts.push(s);
  }
  return parts.length === 0 ? '0' : parts.join('');
}

/** The crossings inside the paper the graph passes through, left to right. */
function onGraph(p: Poly, frame: GridFrame): GridXY[] {
  const out: GridXY[] = [];
  for (let x = frame.x_min; x <= frame.x_max; x++) {
    const y = evalPoly(p, x);
    if (Math.abs(y - Math.round(y)) < 1e-9 && inFrame({ x, y: Math.round(y) }, frame)) {
      out.push({ x, y: Math.round(y) });
    }
  }
  return out;
}

const GRAPH_FRAME: GridFrame = {
  x_min: -GRAPH_X,
  x_max: GRAPH_X,
  y_min: -GRAPH_Y,
  y_max: GRAPH_Y,
};

function buildGraph(draft: GridDraft): Built {
  if (draft.fn === null || draft.count === null) return { problem: 'count' };
  const poly = polynomialOf(draft.fn);
  if (!poly) return { problem: 'not_a_function' };
  const line = poly.a.num === 0;
  // A line is drawn through two points; a parabola needs three at least to be one.
  const count = draft.count;
  if (line ? count !== 2 : count < 3 || count > GRID_GRAPH_POINTS_MAX) return { problem: 'count' };
  const found = onGraph(poly, GRAPH_FRAME);
  if (found.length < count) return { problem: 'too_few_on_grid' };
  return {
    problem: null,
    task: {
      type: 'grid_draw',
      frame: GRAPH_FRAME,
      sheet: { mode: 'graph', count, line, fn: writePoly(poly, false), key: found },
    },
    givens: `$y = ${writePoly(poly, true)}$`,
  };
}

// ── mirror ──

/** Twice the area of the polygon (shoelace): 0 when all its vertices lie on one line. */
function twiceArea(ps: readonly GridXY[]): number {
  return ps.reduce((s, p, i) => {
    const q = ps[(i + 1) % ps.length]!;
    return s + p.x * q.y - q.x * p.y;
  }, 0);
}

/** Every vertex on one side of the axis (or on it), and not all of them on it. */
function oneSide(ps: readonly GridXY[], axis: GridAxis): boolean {
  const side = ps.map((p) => Math.sign((axis.dir === 'vertical' ? p.x : p.y) - axis.at));
  return !side.every((s) => s === 0) && (side.every((s) => s >= 0) || side.every((s) => s <= 0));
}

function buildMirror(draft: GridDraft): Built {
  const points = draft.points ?? [];
  if (points.length < GRID_FIGURE_MIN || points.length > GRID_FIGURE_MAX)
    return { problem: 'count' };
  if (draft.axis === null || draft.axis_at === null) return { problem: 'count' };
  const at = crossings(points);
  if (!at || !Number.isInteger(draft.axis_at * 2) || Math.abs(draft.axis_at) > GRID_COORD_MAX) {
    return { problem: 'off_grid' };
  }
  if (!distinct(at)) return { problem: 'duplicate' };
  const axis: GridAxis = { dir: draft.axis, at: draft.axis_at };
  if (twiceArea(at) === 0 || !oneSide(at, axis)) return { problem: 'degenerate' };
  const image = at.map((p) => mirrorPoint(p, axis));
  // Squared paper has no numbers: the drawing is moved so its lower left corner is one square in.
  const all = [...at, ...image];
  const dx = 1 - Math.min(...all.map((p) => p.x));
  const dy = 1 - Math.min(...all.map((p) => p.y));
  const width = Math.max(...all.map((p) => p.x)) + dx + 1;
  const height = Math.max(...all.map((p) => p.y)) + dy + 1;
  if (width > GRID_SPAN_MAX || height > GRID_ROWS_MAX) return { problem: 'too_big' };
  const move = (p: GridXY): GridXY => ({ x: p.x + dx, y: p.y + dy });
  const names = gridNames(at.length);
  const figure = at.map((p, i) => ({ name: names[i]!, ...move(p) }));
  const moved: GridAxis = { dir: axis.dir, at: axis.at + (axis.dir === 'vertical' ? dx : dy) };
  return {
    problem: null,
    task: {
      type: 'grid_draw',
      frame: {
        x_min: 0,
        x_max: Math.max(width, GRID_SPAN_MIN),
        y_min: 0,
        y_max: Math.max(height, GRID_SPAN_MIN),
      },
      sheet: {
        mode: 'mirror',
        figure,
        axis: moved,
        names: gridNames(at.length, true),
        key: image.map(move),
      },
    },
    givens: '',
  };
}

// ── bars ──

/**
 * The scale of a bar chart: the smallest step every value is a whole number of, with which the
 * tallest bar leaves one row free at the top of the paper. Null when there is none.
 */
export function gridBarStep(values: readonly number[]): number | null {
  const top = Math.max(...values);
  return (
    GRID_BAR_STEPS.find((s) => values.every((v) => v % s === 0) && top / s <= GRID_ROWS_MAX - 1) ??
    null
  );
}

function buildBars(draft: GridDraft): Built {
  const bars = draft.bars ?? [];
  if (bars.length < GRID_BARS_MIN || bars.length > GRID_BARS_MAX) return { problem: 'count' };
  const labelMax = gridBarLabelMax(bars.length);
  if (bars.some((b) => [...b.label].length > labelMax)) return { problem: 'too_long' };
  if (new Set(bars.map((b) => b.label.toLocaleLowerCase())).size !== bars.length) {
    return { problem: 'duplicate' };
  }
  const values = bars.map((b) => b.value);
  if (!values.every((v) => Number.isInteger(v) && v >= 0 && v <= GRID_BAR_VALUE_MAX)) {
    return { problem: 'scale' };
  }
  // Every bar at 0 is no chart to draw.
  if (values.every((v) => v === 0)) return { problem: 'count' };
  const step = gridBarStep(values);
  if (step === null) return { problem: 'scale' };
  const rows = Math.max(GRID_SPAN_MIN, Math.max(...values) / step + 1);
  const labelled = bars.map((b, i) => ({ id: `b${i + 1}`, label: b.label }));
  return {
    problem: null,
    task: {
      type: 'grid_draw',
      frame: { x_min: 0, x_max: bars.length, y_min: 0, y_max: rows },
      sheet: { mode: 'bars', bars: labelled, step, values },
    },
    givens: bars.map((b) => `${b.label} ${b.value}`).join(', '),
  };
}

/** Only the fields of its own mode: what another mode would draw is not a guess at this one. */
function ownFields(draft: GridDraft): boolean {
  const has = {
    points: draft.points !== null,
    fn: draft.fn !== null || draft.count !== null,
    axis: draft.axis !== null || draft.axis_at !== null,
    bars: draft.bars !== null,
  };
  const want = {
    points: { points: true, fn: false, axis: false, bars: false },
    graph: { points: false, fn: true, axis: false, bars: false },
    mirror: { points: true, fn: false, axis: true, bars: false },
    bars: { points: false, fn: false, axis: false, bars: true },
  }[draft.task];
  return (Object.keys(want) as Array<keyof typeof want>).every((k) => !has[k] || want[k]);
}

function build(draft: GridDraft): Built {
  const prompt = draft.prompt.trim();
  if ([...prompt].length > GRID_PROMPT_MAX) return { problem: 'too_long' };
  // The numbers she works with come from the task, never from the sentence around them: an
  // instruction that named a point of its own could name a different one.
  if (/\p{Nd}/u.test(prompt) || !ownFields(draft)) return { problem: 'form' };
  switch (draft.task) {
    case 'points':
      return buildPoints(draft);
    case 'graph':
      return buildGraph(draft);
    case 'mirror':
      return buildMirror(draft);
    case 'bars':
      return buildBars(draft);
  }
}

/** What is wrong with the model's grid task, or null when it is one task with one key. */
export function gridDraftProblem(draft: GridDraft): GridProblem | null {
  return build(draft).problem;
}

/**
 * The stored task and the prompt she reads for the model's draft, or null when Regel 0 rejects it.
 * The prompt is the instruction with the task's data after it, written by code.
 */
export function gridTaskFrom(draft: GridDraft): { task: GridDrawTask; prompt: string } | null {
  const built = build(draft);
  if (built.problem !== null) return null;
  const parsed = StructuredTask.safeParse(built.task);
  if (!parsed.success || parsed.data.type !== 'grid_draw') return null;
  if (gridProblem(parsed.data) !== null) return null;
  const lead = draft.prompt.trim();
  const prompt = built.givens === '' ? lead : `${lead.replace(/[.:!?]+$/u, '')}: ${built.givens}`;
  return { task: parsed.data, prompt };
}

// ─────────────── the stored task, read back ───────────────

/** What is wrong with a stored or built grid task, or null when its key holds together. */
export function gridProblem(task: GridDrawTask): GridProblem | null {
  const { frame, sheet } = task;
  const w = frame.x_max - frame.x_min;
  const h = frame.y_max - frame.y_min;
  const fits = (span: number, max: number) => span >= GRID_SPAN_MIN && span <= max;
  // A bar chart's width is its bars (one column each), not a span of the grid.
  if (!fits(h, GRID_ROWS_MAX) || (sheet.mode !== 'bars' && !fits(w, GRID_SPAN_MAX))) {
    return 'too_big';
  }
  switch (sheet.mode) {
    case 'points':
      if (sheet.names.length !== sheet.key.length) return 'count';
      if (!distinct(sheet.key)) return 'duplicate';
      return sheet.key.every((p) => inFrame(p, frame)) ? null : 'off_grid';
    case 'graph': {
      const poly = polynomialOf(sheet.fn);
      if (!poly || (poly.a.num === 0) !== sheet.line) return 'not_a_function';
      const found = onGraph(poly, frame);
      if (found.length < sheet.count) return 'too_few_on_grid';
      return found.map(key).join(' ') === sheet.key.map(key).join(' ') ? null : 'off_grid';
    }
    case 'mirror': {
      const n = sheet.figure.length;
      if (sheet.names.length !== n || sheet.key.length !== n) return 'count';
      if (twiceArea(sheet.figure) === 0 || !oneSide(sheet.figure, sheet.axis)) return 'degenerate';
      const image = sheet.figure.map((p) => mirrorPoint(p, sheet.axis));
      if (image.map(key).join(' ') !== sheet.key.map(key).join(' ')) return 'off_grid';
      return [...sheet.figure, ...image].every((p) => inFrame(p, frame)) ? null : 'off_grid';
    }
    case 'bars': {
      if (sheet.values.length !== sheet.bars.length || w !== sheet.bars.length) return 'count';
      if (sheet.values.some((v) => v % sheet.step !== 0 || v / sheet.step > h)) return 'scale';
      return null;
    }
  }
}

/** What the app shows: the paper and what stands on it — never the key, the values or `fn`. */
export function gridView(task: GridDrawTask): GridDrawTaskView {
  const { sheet } = task;
  switch (sheet.mode) {
    case 'points':
      return {
        type: 'grid_draw',
        frame: task.frame,
        sheet: { mode: 'points', names: sheet.names },
      };
    case 'graph':
      return {
        type: 'grid_draw',
        frame: task.frame,
        sheet: { mode: 'graph', count: sheet.count, line: sheet.line },
      };
    case 'mirror': {
      const { figure, axis, names } = sheet;
      return {
        type: 'grid_draw',
        frame: task.frame,
        sheet: { mode: 'mirror', figure, axis, names },
      };
    }
    case 'bars':
      return {
        type: 'grid_draw',
        frame: task.frame,
        sheet: { mode: 'bars', bars: sheet.bars, step: sheet.step },
      };
  }
}

/** The key as she would draw it (a graph: every crossing it passes on the paper). */
function keyDrawing(sheet: GridSheet): Pick<GridDrawAnswer, 'points' | 'bars'> {
  return sheet.mode === 'bars'
    ? { points: [], bars: sheet.bars.map((b, i) => ({ id: b.id, value: sheet.values[i] ?? 0 })) }
    : { points: sheet.key, bars: [] };
}

/** The solution as she reads it: `A(2 | 3), B(−1 | 4)`, `Apfel 5, Birne 3`. */
export function gridSolution(task: GridDrawTask): string {
  return gridDrawnText(gridView(task).sheet, keyDrawing(task.sheet));
}

/** Her drawing as it stands in the conversation. */
export function gridAnswerText(task: GridDrawTask, answer: GridDrawAnswer): string {
  return gridDrawnText(gridView(task).sheet, answer);
}

/**
 * What a hint must not say (`hints.ts`): the whole solution, and for a mirror every image point —
 * the points to plot, the function and the values stand in the prompt she reads anyway.
 */
export function gridSecrets(task: GridDrawTask): string[] {
  const { sheet } = task;
  const own =
    sheet.mode === 'mirror' ? sheet.key.map((p, i) => gridPointText(sheet.names[i]!, p)) : [];
  return [gridSolution(task), ...own];
}

// ─────────────── Regel 0: her drawing, checked ───────────────

export type GridCheck = {
  type: 'grid_draw';
  mode: GridMode;
  correct: boolean;
  /** Per point (p1, p2 …) or bar (b1 …) she drew: is it right? */
  parts: Array<{ id: PartId; ok: boolean }>;
  /** What is not right yet, as the reply names it: a point's name, a bar's label, a place. */
  wrong: string[];
};

/** A point of hers on the paper, or the reason the answer is no answer to this task. */
const onPaper = (ps: readonly GridXY[], frame: GridFrame) =>
  distinct(ps) && ps.every((p) => inFrame(p, frame));

/**
 * Her drawing against the key, or null when it does not fit the task (a point missing or off the
 * paper, one place twice, a bar missing, a height off the scale) — refused, not graded.
 */
export function checkGrid(task: GridDrawTask, answer: GridDrawAnswer): GridCheck | null {
  const { sheet, frame } = task;
  const verdict = (parts: GridCheck['parts'], wrong: string[]): GridCheck => ({
    type: 'grid_draw',
    mode: sheet.mode,
    correct: wrong.length === 0,
    parts,
    wrong,
  });
  if (sheet.mode === 'bars') {
    const ids = sheet.bars.map((b) => b.id);
    const given = new Map(answer.bars.map((b) => [b.id, b.value]));
    if (answer.points.length > 0 || given.size !== ids.length || answer.bars.length !== ids.length)
      return null;
    if (!ids.every((id) => given.has(id))) return null;
    const rows = frame.y_max - frame.y_min;
    if ([...given.values()].some((v) => v % sheet.step !== 0 || v / sheet.step > rows)) return null;
    const parts = sheet.bars.map((b, i) => ({ id: b.id, ok: given.get(b.id) === sheet.values[i] }));
    return verdict(
      parts,
      sheet.bars.filter((_, i) => !parts[i]!.ok).map((b) => b.label),
    );
  }
  const want = sheet.mode === 'graph' ? sheet.count : sheet.names.length;
  if (answer.bars.length > 0 || answer.points.length !== want) return null;
  if (!onPaper(answer.points, frame)) return null;
  if (sheet.mode === 'graph') {
    const on = new Set(sheet.key.map(key));
    const parts = answer.points.map((p, i) => ({ id: `p${i + 1}`, ok: on.has(key(p)) }));
    return verdict(
      parts,
      answer.points.filter((_, i) => !parts[i]!.ok).map((p) => gridPointText(null, p)),
    );
  }
  const parts = answer.points.map((p, i) => ({
    id: `p${i + 1}`,
    ok: key(p) === key(sheet.key[i]!),
  }));
  return verdict(
    parts,
    sheet.names.filter((_, i) => !parts[i]!.ok),
  );
}

/**
 * The reply to a drawing that is not right yet: what to look at again, by name. "B liegt noch
 * nicht richtig", "(1|2) liegt nicht auf dem Graphen", "Die Säule „Birne“ stimmt noch nicht".
 */
export function gridReply(locale: string, check: GridCheck): string {
  const what = check.mode === 'mirror' ? 'points' : check.mode;
  return t(locale, `practice.grid.wrong_${what}`, {
    count: check.wrong.length,
    list: check.wrong.join(', '),
  });
}
