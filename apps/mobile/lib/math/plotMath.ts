// The pure arithmetic of a function plot (components/math/FigureView.tsx): the legend's
// pretty formula, the curve's path, and the points a graph passes for a screen reader. No
// drawing here, so it is tested and reused without rendering (split out for max-lines, #313;
// docs/engineering-guards.md).

import type { Figure } from '@learnbuddy/shared-types/contracts';

import { compileExpression } from '../../../../packages/shared-math/src/expression.js';

type PlotFig = Extract<Figure, { type: 'function_plot' }>;

/** "x^2 - 2*x" → "x² − 2·x" for the legend. */
export function prettyExpr(expr: string): string {
  const sup: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  return expr
    .replace(/^\s*(?:y|[a-z]\s*\(\s*x\s*\))\s*=\s*/i, '')
    .replace(/\^(\d+)/g, (_, d: string) =>
      d
        .split('')
        .map((c) => sup[c] ?? c)
        .join(''),
    )
    .replace(/\*/g, '·')
    .replace(/-/g, '−')
    .replace(/sqrt/g, '√')
    .replace(/\bpi\b/g, 'π')
    .replace(/\s*([+−=])\s*/g, ' $1 ')
    .replace(/^ − /, '−')
    .replace(/\(\s*−\s*/g, '(−')
    .trim();
}

/** Samples f across the plot; lifts the pen at gaps (NaN, ±∞) and jumps (asymptotes). */
export function tracePath(
  f: (x: number) => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  X: (v: number) => number,
  Y: (v: number) => number,
  pw: number,
): string {
  const n = Math.max(120, Math.min(800, Math.round(pw * 2)));
  const ys = y1 - y0;
  const lo = y0 - ys * 2;
  const hi = y1 + ys * 2;
  let d = '';
  let pen = false;
  let prev: number | null = null;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    let y: number;
    try {
      y = f(x);
    } catch {
      y = NaN;
    }
    if (!Number.isFinite(y)) {
      pen = false;
      prev = null;
      continue;
    }
    // A jump across most of the view between two samples is a pole, not a line.
    if (prev !== null && Math.abs(y - prev) > ys * 1.5 && (prev - y0) * (y - y0) !== 0) {
      const crosses = (prev > y1 && y < y0) || (prev < y0 && y > y1);
      if (crosses) pen = false;
    }
    prev = y;
    const yc = Math.min(hi, Math.max(lo, y));
    const cmd = pen ? 'L' : 'M';
    d += `${cmd} ${X(x).toFixed(1)} ${Y(yc).toFixed(1)} `;
    pen = true;
  }
  return d.trim();
}

/** Most points named for one graph: enough to tell four apart, short enough to listen to. */
const SPOKEN_POINTS = 5;

/**
 * Whole-number points a graph passes inside its window, at most five, spread over it
 * ("durch (−2 | 3), (−1 | 0), (0 | −1) …"). What a sighted learner reads off the grid, in words.
 */
export function pointsOnGraph(
  expr: string,
  fig: Pick<PlotFig, 'x_min' | 'x_max' | 'y_min' | 'y_max'>,
): Array<{ x: number; y: number }> {
  const fn = compileExpression(expr);
  if (!fn) return [];
  const pts: Array<{ x: number; y: number }> = [];
  for (let x = Math.ceil(fig.x_min); x <= Math.floor(fig.x_max); x++) {
    const y = fn(x);
    if (Number.isFinite(y) && y >= fig.y_min && y <= fig.y_max) {
      pts.push({ x, y: Math.round(y * 100) / 100 });
    }
  }
  if (pts.length <= SPOKEN_POINTS) return pts;
  const step = (pts.length - 1) / (SPOKEN_POINTS - 1);
  return Array.from({ length: SPOKEN_POINTS }, (_, k) => pts[Math.round(k * step)]!);
}
