// A figure that goes with an EXPLANATION (issue #298): "eine Parabel, die sich mit a verändert".
//
// Figures already go with questions (`items.ts` `usableFigure`), and the library is the same one
// (`ModelFigure`, packages/shared-types/src/contracts/figure.ts). The model writes data only and
// the app draws it — it never invents an image.
//
// What is stricter here than for a question, and why: a question's figure is cleaned up — a
// segment to a point that does not exist is dropped and the rest is drawn. For an explanation
// that is the wrong trade. The figure IS the explanation's claim ("so sieht a = 2 aus"), and a
// half-drawn one says something nobody checked. So this either accepts the figure as written or
// rejects all of it (Regel 0: reject, never repair). The explanation itself stands either way.
//
// What code can check, it checks:
//   - every function expression compiles in the shared grammar and has a finite value on most
//     of the drawn x-range — a curve that is undefined across the window draws nothing;
//   - the window shows something: at least one curve point or marked point lies inside it;
//   - every marked point lies inside the window (a point outside it would simply not be drawn,
//     and the sentence that refers to it would point at nothing);
//   - number lines, fractions, tables, geometry and bar charts: their own bounds, every
//     reference resolves, nothing is left over to drop.

import type { ModelFigure } from '@learnbuddy/shared-types/contracts';
import { ModelFigure as ModelFigureSchema } from '@learnbuddy/shared-types/contracts';
import { compileExpression } from '@learnbuddy/shared-math';

/** Sample points across the drawn x-range for a curve. */
const SAMPLES = 41;
/** A curve must have a finite value on at least this share of its window. */
const DEFINED_SHARE = 0.5;
/** At most this many ticks on a number line, as for a question (`items.ts`). */
const MAX_TICKS = 40;

function inside(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi;
}

export type FigureRejection =
  | 'shape'
  | 'window'
  | 'expression'
  | 'undefined_curve'
  | 'nothing_visible'
  | 'point_outside'
  | 'ticks'
  | 'fraction'
  | 'reference'
  | 'table';

/**
 * The figure as written, or the reason it is rejected. Never a corrected copy: a figure that
 * fails any check is not drawn at all.
 */
export function checkExplainFigure(
  raw: unknown,
): { ok: true; figure: ModelFigure } | { ok: false; reason: FigureRejection } {
  const parsed = ModelFigureSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'shape' };
  const f = parsed.data;
  switch (f.type) {
    case 'function_plot': {
      if (!(f.x_min < f.x_max) || !(f.y_min < f.y_max)) return { ok: false, reason: 'window' };
      if (f.functions.length === 0 && f.points.length === 0) {
        return { ok: false, reason: 'nothing_visible' };
      }
      let visible = false;
      for (const fn of f.functions) {
        const compiled = compileExpression(fn.expr);
        if (compiled === null) return { ok: false, reason: 'expression' };
        let defined = 0;
        for (let k = 0; k < SAMPLES; k++) {
          const x = f.x_min + ((f.x_max - f.x_min) * k) / (SAMPLES - 1);
          const y = compiled(x);
          if (!Number.isFinite(y)) continue;
          defined += 1;
          if (inside(y, f.y_min, f.y_max)) visible = true;
        }
        if (defined < SAMPLES * DEFINED_SHARE) return { ok: false, reason: 'undefined_curve' };
      }
      for (const p of f.points) {
        if (!inside(p.x, f.x_min, f.x_max) || !inside(p.y, f.y_min, f.y_max)) {
          return { ok: false, reason: 'point_outside' };
        }
        visible = true;
      }
      return visible ? { ok: true, figure: f } : { ok: false, reason: 'nothing_visible' };
    }
    case 'number_line': {
      if (!(f.min < f.max)) return { ok: false, reason: 'window' };
      if ((f.max - f.min) / f.step > MAX_TICKS) return { ok: false, reason: 'ticks' };
      if (f.points.some((p) => !inside(p.value, f.min, f.max))) {
        return { ok: false, reason: 'point_outside' };
      }
      return { ok: true, figure: f };
    }
    case 'fraction':
      return f.fractions.every((x) => x.filled <= x.parts)
        ? { ok: true, figure: f }
        : { ok: false, reason: 'fraction' };
    case 'geometry': {
      const names = new Set(f.points.map((p) => p.name));
      if (names.size !== f.points.length) return { ok: false, reason: 'reference' };
      const known = (n: string) => names.has(n);
      const resolves =
        f.segments.every((s) => known(s.from) && known(s.to)) &&
        f.polygons.every((poly) => poly.every(known)) &&
        f.circles.every((c) => known(c.center));
      return resolves ? { ok: true, figure: f } : { ok: false, reason: 'reference' };
    }
    case 'table':
      return f.rows.every((r) => r.length === f.header.length)
        ? { ok: true, figure: f }
        : { ok: false, reason: 'table' };
    case 'bar_chart':
      return f.bars.every((b) => Number.isFinite(b.value))
        ? { ok: true, figure: f }
        : { ok: false, reason: 'shape' };
  }
}

/** The figure, or null when it does not pass every check. */
export function explainFigure(raw: unknown): ModelFigure | null {
  if (raw === null || raw === undefined) return null;
  const r = checkExplainFigure(raw);
  return r.ok ? r.figure : null;
}

/** What the prompt tells the model about figures in an explanation. */
export const EXPLAIN_FIGURE_RULES = `figure (optional, usually null): only when a picture explains it better than words — a function graph (e.g. how y = a·x^2 changes with a: up to 3 curves with labels), a number line, a fraction, a bar chart, a geometric figure or a small table. Data only, the app draws it. function_plot expressions use x, numbers, + - * / ^, sqrt, abs, sin, cos, tan, ln, log, exp, pi (e.g. "0.5*x^2-2"); choose x_min/x_max/y_min/y_max so the curves and every point lie inside the window. The server checks every value and drops a figure that does not hold — then the explanation goes without it. Otherwise null.`;
