// Charts next to a question (issues #245, #246): what the model may write as a chart, what code
// checks before the chart is shown, and what a question can READ OFF it.
//
// The contracts are `LineChartFigure` … `PyramidFigure` and `ChartRead` in
// packages/shared-types/src/contracts/figure.ts; the types below are their shapes, kept here so
// this module stays dependency-free (the app imports it by path, like `expression.ts`). The API
// passes the zod-inferred figures in, so a drift between the two fails the typecheck.
//
// Rule 0 in both directions:
//   · what the model GENERATES is checked here — every series as long as its labels, pie slices
//     that add up to 100 %, a box plot in order and agreeing with its data list, labels that fit
//     a 360 px phone. `chartProblem` names the first rule broken; the caller rejects, never
//     repairs.
//   · what a question READS OFF is computed here (`readChart`): the key, and how precisely a
//     learner can read it from the drawing. The drawing uses the very same axes (`niceAxis`,
//     `climateAxes`), so the tolerance comes from the grid she actually sees.
//
// Nothing here guesses. A reading that the drawing cannot settle — two months equally warm
// within what the eye can tell apart, a pyramid between two shapes, a month whose column ends
// on the temperature line — is no question (`null`), exactly as a clock-change ambiguity is
// rejected rather than guessed (CLAUDE.md rule 2).

// ─────────────── shapes ───────────────

export type LineSeries = { n: string; u: string; v: number[]; bar: boolean; r: boolean };
export type LineChart = { type: 'line_chart'; x: string[]; xt: string; s: LineSeries[] };
export type ClimateChart = {
  type: 'climate_chart';
  place: string;
  alt: number;
  t: number[];
  p: number[];
};
export type PieChart = { type: 'pie_chart'; half: boolean; l: string[]; v: number[] };
export type BoxPlot = {
  type: 'box_plot';
  u: string;
  b: { l: string; v: number[] }[];
  raw: number[];
};
export type Histogram = {
  type: 'histogram';
  x0: number;
  w: number;
  v: number[];
  xt: string;
  yt: string;
};
export type ScatterPlot = {
  type: 'scatter_plot';
  x: number[];
  y: number[];
  fit: boolean;
  xt: string;
  yt: string;
};
export type Pyramid = {
  type: 'pyramid';
  a0: number;
  w: number;
  m: number[];
  f: number[];
  u: string;
};
export type Chart =
  | LineChart
  | ClimateChart
  | PieChart
  | BoxPlot
  | Histogram
  | ScatterPlot
  | Pyramid;

export type ReadQuestion =
  | 'value'
  | 'max'
  | 'min'
  | 'argmax'
  | 'argmin'
  | 'sum'
  | 'mean'
  | 'range'
  | 'diff'
  | 'angle'
  | 'iqr'
  | 'humid'
  | 'arid'
  | 'humid_at'
  | 'slope'
  | 'intercept'
  | 'type';
export type ChartReadSpec = { q: ReadQuestion; s: number; i: number; j: number };

const CHART_TYPE_NAMES: readonly Chart['type'][] = [
  'line_chart',
  'climate_chart',
  'pie_chart',
  'box_plot',
  'histogram',
  'scatter_plot',
  'pyramid',
];

export function isChart(f: { type: string }): f is Chart {
  return (CHART_TYPE_NAMES as readonly string[]).includes(f.type);
}

// ─────────────── the phone it has to fit ───────────────

/**
 * The drawing's width on a 360 px phone: 360 − 2 × 16 (screen gutter, `app/practice/[id].tsx`)
 * − 2 × 18 (question card padding) − 26 (the figure's own padding and border,
 * `FIGURE_CHROME`). Every label rule below is measured against this, the narrowest phone the
 * walkthrough checks.
 */
export const CHART_WIDTH = 266;
/** Room for the tick labels of a y-axis. */
export const AXIS_ROOM = 34;
/** Room right of the plot when there is no second axis (the last x label's half). */
export const EDGE_ROOM = 10;
/** Font size of tick and category labels. */
export const TICK_FONT = 11;
/** An upper bound for one character at `TICK_FONT` in the app's sans-serif (digits, capitals). */
export const TICK_CHAR = 6.6;
/** Breathing room between two neighbouring category labels. */
const LABEL_GAP = 3;

/** The width the plot itself gets on the narrowest phone. */
export function plotWidth(width: number, rightAxis: boolean): number {
  return width - AXIS_ROOM - (rightAxis ? AXIS_ROOM : EDGE_ROOM);
}

/** Whether every category label stands under its own column without touching the next one. */
export function categoriesFit(
  labels: readonly string[],
  width: number = CHART_WIDTH,
  rightAxis = false,
): boolean {
  const longest = Math.max(...labels.map((l) => l.length));
  return labels.length * (longest * TICK_CHAR + LABEL_GAP) <= plotWidth(width, rightAxis);
}

// ─────────────── axes ───────────────

/** A step of 1, 2 or 5 × 10^k that gives about `target` intervals. */
export function niceStep(span: number, target: number): number {
  const raw = (span > 0 ? span : 1) / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

export type Axis = { lo: number; hi: number; step: number; ticks: number[] };

/** A round axis around [lo, hi] with about `target` intervals; a flat range gets room. */
export function niceAxis(lo: number, hi: number, target = 5): Axis {
  let a = Math.min(lo, hi);
  let b = Math.max(lo, hi);
  if (b - a < 1e-12) {
    const pad = Math.abs(a) > 1e-12 ? Math.abs(a) * 0.1 : 1;
    a -= pad;
    b += pad;
  }
  const step = niceStep(b - a, target);
  const from = Math.floor(a / step + 1e-9) * step;
  const to = Math.ceil(b / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let k = 0; from + k * step <= to + step * 1e-9 && k <= 60; k++) {
    // Rounded to the step's own digits: 0.1 + 0.2 must print as 0,3.
    ticks.push(roundTo(from + k * step, step));
  }
  return { lo: from, hi: to, step, ticks };
}

function roundTo(v: number, step: number): number {
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(v.toFixed(Math.min(12, digits)));
}

/**
 * How precisely a value can be read off an axis: a fifth of a labelled step. The drawing puts a
 * fine grid line at every half step, so this is less than half the distance between two lines
 * she can see.
 */
export function readingTolerance(axis: Axis): number {
  return axis.step / 5;
}

/** Whether a line chart's labels are numbers (a measured x such as time) or categories. */
export function numericX(labels: readonly string[]): number[] | null {
  const out: number[] = [];
  for (const l of labels) {
    const t = l.trim().replace('−', '-');
    if (!/^-?\d+(?:[.,]\d+)?$/.test(t)) return null;
    out.push(Number(t.replace(',', '.')));
  }
  return out;
}

/**
 * The measured x of a line chart, or null when its x-axis is a row of categories. Columns make
 * it categories even when the labels are numbers (years): a column stands in its own slot.
 */
export function lineX(c: Pick<LineChart, 'x' | 's'>): number[] | null {
  return c.s.some((s) => s.bar) ? null : numericX(c.x);
}

/** The two y-axes of a line chart (the right one only when a series asks for it). */
export function lineAxes(c: LineChart): { left: Axis; right: Axis | null } {
  const side = (r: boolean): Axis | null => {
    const series = c.s.filter((s) => s.r === r);
    if (series.length === 0) return null;
    const values = series.flatMap((s) => s.v);
    // Columns stand on zero, so an axis that carries one has to reach it.
    const withZero = series.some((s) => s.bar) ? [...values, 0] : values;
    return niceAxis(Math.min(...withZero), Math.max(...withZero), 5);
  };
  const left = side(false) ?? niceAxis(0, 1);
  return { left, right: side(true) };
}

// ─────────────── the climate chart (Walter–Lieth, as in the atlas) ───────────────

/** One labelled step of the temperature axis; the precipitation axis has twice its number. */
export const CLIMATE_T_STEP = 10;
/** Above this the precipitation scale is compressed tenfold, as in the atlas. */
export const CLIMATE_P_KNEE = 100;

/** Precipitation in mm as a height in °C units: 20 mm ≙ 10 °C, above 100 mm 200 mm ≙ 10 °C. */
export function precipUnits(mm: number): number {
  return mm <= CLIMATE_P_KNEE ? mm / 2 : CLIMATE_P_KNEE / 2 + (mm - CLIMATE_P_KNEE) / 20;
}

/** The common vertical range in °C units, on whole temperature steps. */
export function climateAxes(c: ClimateChart): { lo: number; hi: number } {
  const lo = Math.min(0, Math.floor(Math.min(...c.t) / CLIMATE_T_STEP) * CLIMATE_T_STEP);
  const top = Math.max(...c.t, ...c.p.map(precipUnits), CLIMATE_T_STEP * 2);
  const hi = Math.ceil(top / CLIMATE_T_STEP - 1e-9) * CLIMATE_T_STEP;
  return { lo, hi };
}

/** Temperature reading tolerance in °C. */
export const CLIMATE_T_TOL = CLIMATE_T_STEP / 5;
/** Precipitation reading tolerance in mm for a column of this height (tenfold above the knee). */
export function climatePTol(mm: number): number {
  return mm > CLIMATE_P_KNEE ? (CLIMATE_T_STEP * 2 * 10) / 5 : (CLIMATE_T_STEP * 2) / 5;
}

/**
 * Humid when the column reaches above the temperature line (p > 2·T at the 1:2 scale), arid
 * when below; null when the two are closer than the eye can tell on the drawing.
 */
export function humidity(t: number, p: number): 'humid' | 'arid' | null {
  const diff = p - 2 * t;
  if (Math.abs(diff) <= climatePTol(Math.min(p, CLIMATE_P_KNEE))) return null;
  return diff > 0 ? 'humid' : 'arid';
}

// ─────────────── statistics ───────────────

function sorted(xs: readonly number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

function medianOfSorted(xs: readonly number[]): number {
  const n = xs.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? (xs[mid] as number) : ((xs[mid - 1] as number) + (xs[mid] as number)) / 2;
}

/**
 * The five numbers of a data list, once for each way schoolbooks define the quartiles — they
 * disagree for some list lengths, and a box plot that follows any of them is right:
 *   · halves without the median (odd n), the median of each half;
 *   · halves with the median (odd n);
 *   · the empirical quantile: the value at rank ⌈n/4⌉, or the mean of ranks n/4 and n/4 + 1
 *     when n/4 is whole (the definition most German textbooks print).
 */
export function fiveNumberVariants(raw: readonly number[]): number[][] {
  const xs = sorted(raw);
  const n = xs.length;
  if (n < 4) return [];
  const min = xs[0] as number;
  const max = xs[n - 1] as number;
  const med = medianOfSorted(xs);
  const half = Math.floor(n / 2);
  const without = [medianOfSorted(xs.slice(0, half)), medianOfSorted(xs.slice(n - half))];
  const withMed = [
    medianOfSorted(xs.slice(0, Math.ceil(n / 2))),
    medianOfSorted(xs.slice(Math.floor(n / 2))),
  ];
  const rank = (p: number): number => {
    const np = n * p;
    if (Math.abs(np - Math.round(np)) < 1e-9) {
      const k = Math.round(np);
      return ((xs[k - 1] as number) + (xs[k] as number)) / 2;
    }
    return xs[Math.ceil(np) - 1] as number;
  };
  const empirical = [rank(0.25), rank(0.75)];
  return [without, withMed, empirical].map(([q1, q3]) => [
    min,
    q1 as number,
    med,
    q3 as number,
    max,
  ]);
}

/** The least-squares line through the points, or null when every x is the same. */
export function regression(
  xs: readonly number[],
  ys: readonly number[],
): { slope: number; intercept: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let k = 0; k < n; k++) {
    sx += xs[k] as number;
    sy += ys[k] as number;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < n; k++) {
    const dx = (xs[k] as number) - mx;
    sxx += dx * dx;
    sxy += dx * ((ys[k] as number) - my);
  }
  if (sxx < 1e-12) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

export type PyramidShape = 'pyramid' | 'bell' | 'urn';
export const PYRAMID_SHAPES: readonly PyramidShape[] = ['pyramid', 'bell', 'urn'];

/**
 * The type of a population pyramid, from its shape: the youngest third of the age groups
 * against the middle third (men and women together). A broad base (young ≥ 1.2 × middle) is a
 * pyramid, a narrow one (≤ 0.8 ×) an urn, about equal (0.9–1.1) a bell. Between those bands the
 * shape is not clear enough to name — null, and a question about its type is not asked.
 */
export function pyramidShape(p: Pick<Pyramid, 'm' | 'f'>): PyramidShape | null {
  const n = Math.min(p.m.length, p.f.length);
  const third = Math.floor(n / 3);
  if (third < 1) return null;
  const total = (k: number) => (p.m[k] as number) + (p.f[k] as number);
  let young = 0;
  let middle = 0;
  for (let k = 0; k < third; k++) {
    young += total(k);
    middle += total(third + k);
  }
  if (middle <= 0) return young > 0 ? 'pyramid' : null;
  const r = young / middle;
  if (r >= 1.2) return 'pyramid';
  if (r <= 0.8) return 'urn';
  if (r >= 0.9 && r <= 1.1) return 'bell';
  return null;
}

/** The label of age group `k` ("20–24"); the groups follow each other without a gap. */
export function ageGroup(p: Pick<Pyramid, 'a0' | 'w'>, k: number): string {
  const from = p.a0 + k * p.w;
  return p.w === 1 ? String(from) : `${from}–${from + p.w - 1}`;
}

/** The axis of each half of a pyramid (both halves share it, so the two sides compare). */
export function pyramidAxis(p: Pick<Pyramid, 'm' | 'f'>): Axis {
  return niceAxis(0, Math.max(...p.m, ...p.f), 3);
}

/** The value axis of a box plot. */
export function boxAxis(c: Pick<BoxPlot, 'b'>): Axis {
  const all = c.b.flatMap((b) => b.v);
  return niceAxis(Math.min(...all), Math.max(...all), 5);
}

export function histogramAxis(c: Pick<Histogram, 'v'>): Axis {
  return niceAxis(0, Math.max(...c.v), 5);
}

/** Both axes of a scatter plot, wide enough for the points and the fitted line between them. */
export function scatterAxes(c: Pick<ScatterPlot, 'x' | 'y'>): { x: Axis; y: Axis } {
  return {
    x: niceAxis(Math.min(...c.x), Math.max(...c.x), 5),
    y: niceAxis(Math.min(...c.y), Math.max(...c.y), 5),
  };
}

// ─────────────── what the model wrote: checked ───────────────

/** Pie shares add up to 100 % within this (one decimal rounded on each of a few slices). */
export const PIE_SUM_SLACK = 0.1;

export type ChartProblem =
  | 'length_mismatch'
  | 'two_bar_series'
  | 'axis_units'
  | 'x_not_increasing'
  | 'labels_too_long'
  | 'duplicate_labels'
  | 'pie_sum'
  | 'box_order'
  | 'box_raw'
  | 'empty'
  | 'flat_x'
  | 'too_old';

function unique(xs: readonly string[]): boolean {
  return new Set(xs.map((x) => x.trim().toLocaleLowerCase())).size === xs.length;
}

/**
 * The first rule a chart breaks, or null when it can be drawn and read as it stands. Rejected,
 * never repaired: a pie at 98 % is not stretched to 100, it is not shown (and its question is
 * not asked).
 */
export function chartProblem(c: Chart): ChartProblem | null {
  switch (c.type) {
    case 'line_chart': {
      if (c.s.some((s) => s.v.length !== c.x.length)) return 'length_mismatch';
      if (c.s.filter((s) => s.bar).length > 1) return 'two_bar_series';
      if (!unique(c.s.map((s) => s.n))) return 'duplicate_labels';
      // One axis, one unit: two series on the same axis must measure the same thing, and a
      // second axis exists only for a second unit (else it would be one axis drawn twice).
      const left = new Set(c.s.filter((s) => !s.r).map((s) => s.u));
      const right = new Set(c.s.filter((s) => s.r).map((s) => s.u));
      if (left.size > 1 || right.size > 1) return 'axis_units';
      if (right.size === 1 && (left.size === 0 || [...left][0] === [...right][0]))
        return 'axis_units';
      const xs = lineX(c);
      if (xs) {
        for (let k = 1; k < xs.length; k++)
          if ((xs[k] as number) <= (xs[k - 1] as number)) return 'x_not_increasing';
      } else {
        if (!unique(c.x)) return 'duplicate_labels';
        if (!categoriesFit(c.x, CHART_WIDTH, right.size > 0)) return 'labels_too_long';
      }
      return null;
    }
    case 'climate_chart':
      return null;
    case 'pie_chart': {
      if (c.l.length !== c.v.length) return 'length_mismatch';
      if (!unique(c.l)) return 'duplicate_labels';
      const sum = c.v.reduce((a, b) => a + b, 0);
      return Math.abs(sum - 100) <= PIE_SUM_SLACK + 1e-9 ? null : 'pie_sum';
    }
    case 'box_plot': {
      if (!unique(c.b.map((b) => b.l))) return 'duplicate_labels';
      for (const b of c.b) {
        for (let k = 1; k < 5; k++)
          if ((b.v[k] as number) < (b.v[k - 1] as number)) return 'box_order';
        if ((b.v[4] as number) <= (b.v[0] as number)) return 'box_order';
      }
      if (c.raw.length > 0) {
        // The data list belongs to exactly one box, and that box must be what it gives.
        if (c.b.length !== 1 || c.raw.length < 4) return 'box_raw';
        const v = (c.b[0] as { v: number[] }).v;
        const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
        const ok = fiveNumberVariants(c.raw).some((f) =>
          f.every((x, k) => same(x, v[k] as number)),
        );
        if (!ok) return 'box_raw';
      }
      return null;
    }
    case 'histogram':
      return c.v.some((v) => v > 0) ? null : 'empty';
    case 'scatter_plot':
      if (c.x.length !== c.y.length) return 'length_mismatch';
      return regression(c.x, c.y) ? null : 'flat_x';
    case 'pyramid':
      if (c.m.length !== c.f.length) return 'length_mismatch';
      if (![...c.m, ...c.f].some((v) => v > 0)) return 'empty';
      return c.a0 + c.m.length * c.w <= 125 ? null : 'too_old';
  }
}

// ─────────────── what a question reads off: computed ───────────────

export type ChartAnswer =
  /** A number, and how far a careful reading of the drawing can be off (0 = printed). */
  | { kind: 'number'; value: number; tol: number }
  /** A position on the chart whose label is the answer (a month, a category, a slice). */
  | { kind: 'label'; index: number }
  /** One of a fixed set of answers that code names (`options` in this order). */
  | { kind: 'choice'; options: readonly string[]; correct: number };

/** How a list of read values adds up: errors of independent readings grow with √n. */
function sumTol(tols: readonly number[]): number {
  return Math.sqrt(tols.reduce((a, t) => a + t * t, 0));
}

/** One value per position, each with the tolerance it can be read with. */
type Reading = { v: number[]; tol: number[] };

function readingOf(c: Chart, s: number): Reading | null {
  switch (c.type) {
    case 'line_chart': {
      const series = c.s[s];
      if (!series) return null;
      const axes = lineAxes(c);
      const axis = series.r ? axes.right : axes.left;
      if (!axis) return null;
      return { v: series.v, tol: series.v.map(() => readingTolerance(axis)) };
    }
    case 'climate_chart':
      if (s === 0) return { v: c.t, tol: c.t.map(() => CLIMATE_T_TOL) };
      if (s === 1) return { v: c.p, tol: c.p.map(climatePTol) };
      return null;
    case 'pie_chart':
      // The shares are printed in the legend: read exactly.
      return s === 0 ? { v: c.v, tol: c.v.map(() => 0) } : null;
    case 'histogram': {
      if (s !== 0) return null;
      const tol = readingTolerance(histogramAxis(c));
      return { v: c.v, tol: c.v.map(() => tol) };
    }
    case 'pyramid': {
      const side = s === 0 ? c.m : s === 1 ? c.f : null;
      if (!side) return null;
      const tol = readingTolerance(pyramidAxis(c));
      return { v: side, tol: side.map(() => tol) };
    }
    case 'box_plot': {
      const box = c.b[s];
      if (!box) return null;
      const tol = readingTolerance(boxAxis(c));
      return { v: box.v, tol: box.v.map(() => tol) };
    }
    case 'scatter_plot':
      return null;
  }
}

/** The position of the extreme value, or null when another one is too close to tell apart. */
function extreme(r: Reading, sign: 1 | -1): number | null {
  let best = 0;
  for (let k = 1; k < r.v.length; k++)
    if (sign * ((r.v[k] as number) - (r.v[best] as number)) > 0) best = k;
  for (let k = 0; k < r.v.length; k++) {
    if (k === best) continue;
    const gap = sign * ((r.v[best] as number) - (r.v[k] as number));
    // Printed values (tolerance 0) only need to differ; drawn ones by more than both readings.
    if (gap <= (r.tol[best] as number) + (r.tol[k] as number) + 1e-9) return null;
  }
  return best;
}

/** Which questions each chart can answer by reading (everything else is not a reading). */
const READS: Record<Chart['type'], readonly ReadQuestion[]> = {
  line_chart: ['value', 'max', 'min', 'argmax', 'argmin', 'sum', 'mean', 'range', 'diff'],
  climate_chart: [
    'value',
    'max',
    'min',
    'argmax',
    'argmin',
    'sum',
    'mean',
    'range',
    'diff',
    'humid',
    'arid',
    'humid_at',
  ],
  pie_chart: ['value', 'argmax', 'argmin', 'diff', 'angle'],
  box_plot: ['value', 'range', 'iqr'],
  histogram: ['value', 'max', 'min', 'sum', 'diff'],
  scatter_plot: ['slope', 'intercept'],
  pyramid: ['value', 'sum', 'type'],
};

/**
 * The answer a question gets when it reads `r` off chart `c`, or null when that is no reading
 * of this chart (a position past its end, a question the chart cannot answer, a value the
 * drawing cannot settle). The caller compares it with the model's key and drops the question
 * when they disagree.
 */
export function readChart(c: Chart, r: ChartReadSpec): ChartAnswer | null {
  if (!READS[c.type].includes(r.q)) return null;
  if (chartProblem(c) !== null) return null;

  if (c.type === 'scatter_plot') {
    // Only a drawn line can be read; without it the question is a calculation, not a reading.
    const fit = c.fit ? regression(c.x, c.y) : null;
    if (!fit) return null;
    const { x, y } = scatterAxes(c);
    const tolY = readingTolerance(y);
    if (r.q === 'intercept') return { kind: 'number', value: fit.intercept, tol: tolY };
    // A slope read between two far points of the line: both ends can be off by a reading.
    return { kind: 'number', value: fit.slope, tol: (2 * tolY) / (x.hi - x.lo) };
  }

  if (c.type === 'pyramid' && r.q === 'type') {
    const shape = pyramidShape(c);
    return shape
      ? { kind: 'choice', options: PYRAMID_SHAPES, correct: PYRAMID_SHAPES.indexOf(shape) }
      : null;
  }

  if (c.type === 'climate_chart' && (r.q === 'humid' || r.q === 'arid' || r.q === 'humid_at')) {
    const months = c.t.map((t, k) => humidity(t, c.p[k] as number));
    if (r.q === 'humid_at') {
      const h = months[r.i];
      if (h === undefined || h === null) return null;
      return { kind: 'choice', options: HUMIDITY, correct: HUMIDITY.indexOf(h) };
    }
    // A count needs every month settled: one month on the line makes the count a guess.
    if (months.some((h) => h === null)) return null;
    return { kind: 'number', value: months.filter((h) => h === r.q).length, tol: 0 };
  }

  if (c.type === 'box_plot') {
    const box = readingOf(c, r.s);
    if (!box) return null;
    const tol = box.tol[0] as number;
    const v = box.v;
    if (r.q === 'value') return r.i <= 4 ? { kind: 'number', value: v[r.i] as number, tol } : null;
    if (r.q === 'range')
      return { kind: 'number', value: (v[4] as number) - (v[0] as number), tol: 2 * tol };
    return { kind: 'number', value: (v[3] as number) - (v[1] as number), tol: 2 * tol };
  }

  if (c.type === 'pie_chart' && r.q === 'angle') {
    const share = c.v[r.i];
    if (share === undefined) return null;
    // Half a degree: what a protractor or a rounded calculation gives.
    return { kind: 'number', value: (share * (c.half ? 180 : 360)) / 100, tol: 0.5 };
  }

  const reading = readingOf(c, r.s);
  if (!reading) return null;
  const { v, tol } = reading;
  const n = v.length;
  switch (r.q) {
    case 'value':
      return r.i < n ? { kind: 'number', value: v[r.i] as number, tol: tol[r.i] as number } : null;
    case 'max':
    case 'min': {
      const k = r.q === 'max' ? argExtreme(v, 1) : argExtreme(v, -1);
      return { kind: 'number', value: v[k] as number, tol: tol[k] as number };
    }
    case 'argmax':
    case 'argmin': {
      const k = extreme(reading, r.q === 'argmax' ? 1 : -1);
      return k === null ? null : { kind: 'label', index: k };
    }
    case 'sum':
      return { kind: 'number', value: v.reduce((a, b) => a + b, 0), tol: sumTol(tol) };
    case 'mean':
      return { kind: 'number', value: v.reduce((a, b) => a + b, 0) / n, tol: sumTol(tol) / n };
    case 'range': {
      const hi = argExtreme(v, 1);
      const lo = argExtreme(v, -1);
      return {
        kind: 'number',
        value: (v[hi] as number) - (v[lo] as number),
        tol: (tol[hi] as number) + (tol[lo] as number),
      };
    }
    case 'diff':
      // From position i to position j: what changed between them.
      if (r.i >= n || r.j >= n || r.i === r.j) return null;
      return {
        kind: 'number',
        value: (v[r.j] as number) - (v[r.i] as number),
        tol: (tol[r.i] as number) + (tol[r.j] as number),
      };
    default:
      return null;
  }
}

function argExtreme(v: readonly number[], sign: 1 | -1): number {
  let best = 0;
  for (let k = 1; k < v.length; k++)
    if (sign * ((v[k] as number) - (v[best] as number)) > 0) best = k;
  return best;
}

export const HUMIDITY: readonly ('humid' | 'arid')[] = ['humid', 'arid'];

/**
 * The texts a label answer can be written as. A climate chart's positions are months, so its
 * caller passes the month names of the question's language (long and short); every other
 * chart's label is the one the model wrote.
 */
export function labelsOf(
  c: Chart,
  index: number,
  monthNames: (month: number) => string[],
): string[] {
  switch (c.type) {
    case 'climate_chart':
      return monthNames(index);
    case 'line_chart':
      return c.x[index] === undefined ? [] : [c.x[index] as string];
    case 'pie_chart':
      return c.l[index] === undefined ? [] : [c.l[index] as string];
    default:
      return [];
  }
}
