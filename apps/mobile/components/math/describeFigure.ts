// A figure in words for screen readers (FigureView's label, an answer option's in ChoiceList, the
// zoom target's in ZoomableFigure): what the drawing shows, value by value. School figures and
// charts are described by their own files (`describeSchoolFigure`, `describeChart`).

import type { Figure } from '@learnbuddy/shared-types/contracts';

// Imported by path: the mobile bundle takes only this small, dependency-free module
// of @learnbuddy/shared-math (its index also pulls in mathjs).
import { compileExpression } from '../../../../packages/shared-math/src/expression.js';
import { isChart } from '../../../../packages/shared-math/src/charts.js';
import type { FigureNames } from '../../../../packages/shared-math/src/figureNames.js';
import type { Translate } from '../../lib/i18n/index.js';
import { pointsOnGraph, prettyExpr } from '../../lib/math/plotMath.js';
import { describeStaff } from '../../lib/music/words.js';
import { describeChart } from './ChartFigures.js';
import { formatNumber } from './figureText.js';
import { describeMolecule } from './MoleculeView.js';
import { describeSchoolFigure, isSchoolFigure } from './schoolFigures.js';

/** Reads a cell text with math out in words. */
type Speak = (text: string) => string;

/** `names`: a map's or a picture's names once loaded (`useFigureNames`), null before. */
export function describeFigure(
  figure: Figure,
  t: Translate,
  names: FigureNames | null,
  speak: Speak = (s) => s,
  { formulas = true }: { formulas?: boolean } = {},
): string {
  const list = (items: string[]) => items.join(', ');
  if (isSchoolFigure(figure)) return describeSchoolFigure(figure, t, names);
  if (isChart(figure)) return describeChart(figure, t);
  switch (figure.type) {
    case 'fraction':
      return figure.fractions
        .map((f) =>
          t(figure.shape === 'circle' ? 'figure.fraction_circle' : 'figure.fraction_bar', {
            parts: f.parts,
            filled: Math.min(f.filled, f.parts),
          }),
        )
        .join('. ');
    case 'number_line': {
      const base = t('figure.number_line', {
        min: formatNumber(figure.min),
        max: formatNumber(figure.max),
        step: formatNumber(figure.step),
      });
      if (figure.points.length === 0) return base;
      const pts = figure.points.map((p) =>
        p.label ? `${p.label} (${formatNumber(p.value)})` : formatNumber(p.value),
      );
      return `${base}. ${t('figure.marked', { list: list(pts) })}`;
    }
    case 'function_plot': {
      // An answer option (issue #231): the graph by points it passes, never by its formula.
      if (!formulas) {
        const through = figure.functions
          .map((f) => pointsOnGraph(f.expr, figure))
          .filter((pts) => pts.length > 0)
          .map((pts) =>
            t('figure.graph_through', {
              list: list(pts.map((p) => `(${formatNumber(p.x)} | ${formatNumber(p.y)})`)),
            }),
          );
        if (through.length > 0) return through.join('. ');
      }
      const parts = [
        t('figure.function_plot', {
          x_min: formatNumber(figure.x_min),
          x_max: formatNumber(figure.x_max),
          y_min: formatNumber(figure.y_min),
          y_max: formatNumber(figure.y_max),
        }),
      ];
      for (const f of formulas ? figure.functions : []) {
        if (!compileExpression(f.expr)) continue;
        const expr = prettyExpr(f.expr);
        parts.push(
          f.label ? t('figure.graph_named', { label: f.label, expr }) : t('figure.graph', { expr }),
        );
      }
      if (figure.points.length > 0) {
        const pts = figure.points.map(
          (p) => `${p.label ? `${p.label} ` : ''}(${formatNumber(p.x)} | ${formatNumber(p.y)})`,
        );
        parts.push(t('figure.points', { list: list(pts) }));
      }
      return parts.join('. ');
    }
    case 'bar_chart': {
      const unit = figure.unit ? ` ${figure.unit}` : '';
      return t('figure.bar_chart', {
        list: list(figure.bars.map((b) => `${b.label} ${formatNumber(b.value)}${unit}`)),
      });
    }
    case 'geometry': {
      const parts = [
        t('figure.geometry', {
          list: list(
            figure.points.map((p) => `${p.name} (${formatNumber(p.x)} | ${formatNumber(p.y)})`),
          ),
        }),
      ];
      if (figure.segments.length > 0) {
        parts.push(
          t('figure.segments', {
            list: list(figure.segments.map((seg) => `${seg.from}${seg.to}`)),
          }),
        );
      }
      if (figure.polygons.length > 0) {
        parts.push(t('figure.polygons', { list: list(figure.polygons.map((p) => p.join(''))) }));
      }
      for (const c of figure.circles) {
        parts.push(t('figure.circle', { center: c.center, radius: formatNumber(c.radius) }));
      }
      for (const a of figure.angles) {
        const value = a.label ?? (a.deg !== null ? `${formatNumber(a.deg)}°` : null);
        parts.push(
          value
            ? t('figure.angle_value', { name: a.at.join(''), value: speak(value) })
            : t('figure.angle', { name: a.at.join('') }),
        );
      }
      for (const l of figure.lengths) {
        const value = l.label ?? (l.value !== null ? formatNumber(l.value) : null);
        if (value)
          parts.push(t('figure.length', { name: `${l.from}${l.to}`, value: speak(value) }));
      }
      for (const a of figure.arrows) {
        const value = a.label ?? (a.value !== null ? formatNumber(a.value) : null);
        const key = a.resultant ? 'figure.resultant' : 'figure.arrow';
        parts.push(t(key, { from: a.from, to: a.to, value: value ? speak(value) : '' }).trim());
      }
      for (const r of figure.rays) {
        parts.push(
          t(r.kind === 'ray' ? 'figure.ray' : 'figure.light_ray', {
            from: r.from,
            through: r.through,
          }),
        );
      }
      for (const l of figure.lines) {
        parts.push(t('figure.line', { a: l.a, b: l.b }) + (l.label ? ` (${l.label})` : ''));
      }
      return parts.join('. ');
    }
    case 'table': {
      const parts = [
        t('figure.table', { rows: figure.rows.length, header: list(figure.header.map(speak)) }),
      ];
      figure.rows.forEach((r, i) =>
        parts.push(t('figure.row', { n: i + 1, cells: list(r.map(speak)) })),
      );
      return parts.join('. ');
    }
    case 'molecule':
      return describeMolecule(figure, t);
    // In Worten, wie issue #226 es verlangt („Violinschlüssel, Viervierteltakt: C, E, G,
    // Viertelnoten"). Das ist keine Beschreibung des Bildes, sondern derselbe Inhalt in Sprache:
    // mit dem Screenreader ist die Aufgabe damit lösbar, nicht nur vorhanden.
    case 'staff':
      return describeStaff(figure, t);
  }
}
