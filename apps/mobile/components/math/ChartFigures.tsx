// Charts next to a question (issues #245, #246): line and climate charts (LineCharts.tsx), pies,
// box plots, histograms, scatter plots and population pyramids (StatCharts.tsx), all drawn from
// the pieces in chartParts.tsx. The model only sends data (contracts/figure.ts); everything a
// learner reads — the axes, their steps, the scale of a climate chart — comes from the same
// functions the API uses to compute a question's key and its reading tolerance
// (packages/shared-math/src/charts.ts), so the grid she reads from is the grid the tolerance was
// derived from.
//
// Every chart fits the 266 px a 360 px phone leaves it (`CHART_WIDTH`; label lengths are checked
// before a chart is ever shown) and is told apart by more than colour: series carry markers and
// dash patterns, columns are columns, slices are numbered, the halves of a pyramid are named.
// Each also has a description in words for screen readers (`describeChart`, here).

import type { ChartFigure } from '@learnbuddy/shared-types/contracts';

// Imported by path, like expression.ts: the mobile bundle takes only this dependency-free module.
import { ageGroup } from '../../../../packages/shared-math/src/charts.js';
import { formatNumber } from './figureText.js';
import { ClimateChartView, LineChartView } from './LineCharts.js';
import {
  BoxPlotView,
  HistogramView,
  PieChartView,
  PyramidView,
  ScatterPlotView,
} from './StatCharts.js';

type T = (key: string, values?: Record<string, string | number>) => string;

export function ChartBody({ figure, width }: { figure: ChartFigure; width: number }) {
  switch (figure.type) {
    case 'line_chart':
      return <LineChartView fig={figure} width={width} />;
    case 'climate_chart':
      return <ClimateChartView fig={figure} width={width} />;
    case 'pie_chart':
      return <PieChartView fig={figure} width={width} />;
    case 'box_plot':
      return <BoxPlotView fig={figure} width={width} />;
    case 'histogram':
      return <HistogramView fig={figure} width={width} />;
    case 'scatter_plot':
      return <ScatterPlotView fig={figure} width={width} />;
    case 'pyramid':
      return <PyramidView fig={figure} width={width} />;
  }
}

// ─────────────── description for screen readers ───────────────

/**
 * The chart in words: every value it shows, nothing it does not. No "warmest month", no sum,
 * no type: those are what a question asks her to read off, and a screen reader that says them
 * would answer the question for one learner and not for the other.
 */
export function describeChart(figure: ChartFigure, t: T): string {
  const list = (items: string[]) => items.join(', ');
  const unit = (u: string) => (u ? ` ${u}` : '');
  switch (figure.type) {
    case 'line_chart': {
      const parts = [t('figure.line_chart', { x: list(figure.x) })];
      for (const s of figure.s) {
        parts.push(
          t('figure.chart_series', {
            name: s.n,
            list: list(s.v.map((v, k) => `${figure.x[k] ?? ''} ${formatNumber(v)}${unit(s.u)}`)),
          }),
        );
      }
      return parts.join('. ');
    }
    case 'climate_chart': {
      const months = t('figure.months').split(',');
      return [
        t('figure.climate_chart', { place: figure.place, alt: formatNumber(figure.alt) }),
        t('figure.chart_series', {
          name: t('figure.temperature'),
          list: list(figure.t.map((v, k) => `${months[k] ?? ''} ${formatNumber(v)} °C`)),
        }),
        t('figure.chart_series', {
          name: t('figure.precipitation'),
          list: list(figure.p.map((v, k) => `${months[k] ?? ''} ${formatNumber(v)} mm`)),
        }),
      ].join('. ');
    }
    case 'pie_chart':
      return t(figure.half ? 'figure.half_pie_chart' : 'figure.pie_chart', {
        list: list(figure.l.map((l, k) => `${l} ${formatNumber(figure.v[k] ?? 0)} %`)),
      });
    case 'box_plot':
      return figure.b
        .map((b) =>
          t('figure.box_plot', {
            label: b.l,
            min: `${formatNumber(b.v[0] ?? 0)}${unit(figure.u)}`,
            q1: `${formatNumber(b.v[1] ?? 0)}${unit(figure.u)}`,
            median: `${formatNumber(b.v[2] ?? 0)}${unit(figure.u)}`,
            q3: `${formatNumber(b.v[3] ?? 0)}${unit(figure.u)}`,
            max: `${formatNumber(b.v[4] ?? 0)}${unit(figure.u)}`,
          }),
        )
        .join('. ');
    case 'histogram':
      return t('figure.histogram', {
        list: list(
          figure.v.map(
            (v, k) =>
              `${formatNumber(figure.x0 + k * figure.w)}–${formatNumber(figure.x0 + (k + 1) * figure.w)}: ${formatNumber(v)}`,
          ),
        ),
      });
    case 'scatter_plot': {
      const base = t('figure.scatter_plot', {
        n: figure.x.length,
        list: list(
          figure.x.map((x, k) => `(${formatNumber(x)} | ${formatNumber(figure.y[k] ?? 0)})`),
        ),
      });
      return figure.fit ? `${base}. ${t('figure.fit_line')}` : base;
    }
    case 'pyramid':
      return t('figure.pyramid', {
        list: list(
          figure.m.map((m, k) =>
            t('figure.age_group', {
              group: ageGroup(figure, k),
              m: `${formatNumber(m)}${unit(figure.u)}`,
              f: `${formatNumber(figure.f[k] ?? 0)}${unit(figure.u)}`,
            }),
          ),
        ),
      });
  }
}
