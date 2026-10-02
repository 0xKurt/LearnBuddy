// Charts next to a question (issues #245, #246): line and climate charts, pies, box plots,
// histograms, scatter plots and population pyramids. The model only sends data
// (packages/shared-types/src/contracts/figure.ts); everything a learner reads here — the axes,
// their steps, the scale of a climate chart — comes from the same functions the API uses to
// compute a question's key and its reading tolerance (packages/shared-math/src/charts.ts), so
// the grid she reads from is the grid the tolerance was derived from.
//
// Every chart fits the 266 px a 360 px phone leaves it (`CHART_WIDTH`; label lengths are checked
// before a chart is ever shown) and is told apart by more than colour: series carry markers and
// dash patterns, columns are columns, slices are numbered, the halves of a pyramid are named.
// Each also has a description in words for screen readers (`describeChart`).

import type { ChartFigure } from '@learnbuddy/shared-types/contracts';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Polygon, Rect } from 'react-native-svg';

// Imported by path, like expression.ts: the mobile bundle takes only this dependency-free module.
import {
  ageGroup,
  AXIS_ROOM,
  boxAxis,
  CLIMATE_P_KNEE,
  CLIMATE_T_STEP,
  climateAxes,
  EDGE_ROOM,
  histogramAxis,
  lineAxes,
  lineX,
  niceAxis,
  precipUnits,
  pyramidAxis,
  regression,
  scatterAxes,
  TICK_CHAR,
  TICK_FONT,
  type Axis,
} from '../../../../packages/shared-math/src/charts.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatNumber, HaloText } from './figureInk.js';

type LineFig = Extract<ChartFigure, { type: 'line_chart' }>;
type ClimateFig = Extract<ChartFigure, { type: 'climate_chart' }>;
type PieFig = Extract<ChartFigure, { type: 'pie_chart' }>;
type BoxFig = Extract<ChartFigure, { type: 'box_plot' }>;
type HistogramFig = Extract<ChartFigure, { type: 'histogram' }>;
type ScatterFig = Extract<ChartFigure, { type: 'scatter_plot' }>;
type PyramidFig = Extract<ChartFigure, { type: 'pyramid' }>;

type T = (key: string, values?: Record<string, string | number>) => string;

/** Room above the plot for the units of the axes. */
const TOP = 22;
/** Room under the plot for the x labels. */
const X_LABELS = 22;
/** Room for an x-axis title under the labels. */
const X_TITLE = 16;
const DASHES: ReadonlyArray<string | undefined> = [undefined, '7 4', '2 4'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

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

// ─────────────── shared pieces ───────────────

/** A text label in the axis ink. */
function Tick({
  x,
  y,
  text,
  anchor,
}: {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}) {
  const { figure: ink } = useTheme();
  return (
    <HaloText
      x={x}
      y={y}
      size={TICK_FONT}
      weight="400"
      color={ink.label}
      anchor={anchor}
      text={text}
    />
  );
}

/**
 * Horizontal grid lines at every labelled step and, fainter, at every half step: the half
 * lines are what makes a reading to a fifth of a step possible (`readingTolerance`).
 */
function HGrid({
  axis,
  Y,
  x1,
  x2,
}: {
  axis: Axis;
  Y: (v: number) => number;
  x1: number;
  x2: number;
}) {
  const { figure: ink } = useTheme();
  const lines: ReactNode[] = [];
  axis.ticks.forEach((v, k) => {
    lines.push(
      <Line key={`g${k}`} x1={x1} y1={Y(v)} x2={x2} y2={Y(v)} stroke={ink.grid} strokeWidth={1} />,
    );
    const half = v + axis.step / 2;
    if (half < axis.hi) {
      lines.push(
        <Line
          key={`h${k}`}
          x1={x1}
          y1={Y(half)}
          x2={x2}
          y2={Y(half)}
          stroke={ink.grid}
          strokeOpacity={0.5}
          strokeWidth={1}
        />,
      );
    }
  });
  return <G>{lines}</G>;
}

function VGrid({
  axis,
  X,
  y1,
  y2,
}: {
  axis: Axis;
  X: (v: number) => number;
  y1: number;
  y2: number;
}) {
  const { figure: ink } = useTheme();
  const lines: ReactNode[] = [];
  axis.ticks.forEach((v, k) => {
    lines.push(
      <Line key={`g${k}`} x1={X(v)} y1={y1} x2={X(v)} y2={y2} stroke={ink.grid} strokeWidth={1} />,
    );
    const half = v + axis.step / 2;
    if (half < axis.hi) {
      lines.push(
        <Line
          key={`h${k}`}
          x1={X(half)}
          y1={y1}
          x2={X(half)}
          y2={y2}
          stroke={ink.grid}
          strokeOpacity={0.5}
          strokeWidth={1}
        />,
      );
    }
  });
  return <G>{lines}</G>;
}

/** A point marker per series: circle, square, triangle — the second signal next to colour. */
function Marker({ shape, x, y, color }: { shape: number; x: number; y: number; color: string }) {
  const { figure: ink } = useTheme();
  if (shape % 3 === 1) {
    return (
      <Rect
        x={x - 3.5}
        y={y - 3.5}
        width={7}
        height={7}
        fill={color}
        stroke={ink.paper}
        strokeWidth={1.2}
      />
    );
  }
  if (shape % 3 === 2) {
    return (
      <Polygon
        points={`${x},${y - 4.5} ${x + 4.2},${y + 3} ${x - 4.2},${y + 3}`}
        fill={color}
        stroke={ink.paper}
        strokeWidth={1.2}
      />
    );
  }
  return <Circle cx={x} cy={y} r={3.6} fill={color} stroke={ink.paper} strokeWidth={1.2} />;
}

type LegendEntry = { key: string; label: string; swatch: ReactNode };

/** The legend under a chart: one wrapping row of swatches with their names. */
function Legend({ entries }: { entries: LegendEntry[] }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.md, rowGap: SPACE.xs }}>
      {entries.map((e) => (
        <View key={e.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {e.swatch}
          <Text style={[TYPE.small, { color: palette.ink }]}>{e.label}</Text>
        </View>
      ))}
    </View>
  );
}

function LineSwatch({ color, dash, shape }: { color: string; dash?: string; shape: number }) {
  return (
    <Svg width={26} height={12}>
      <Line
        x1={1}
        y1={6}
        x2={25}
        y2={6}
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      <Marker shape={shape} x={13} y={6} color={color} />
    </Svg>
  );
}

function BarSwatch({ color }: { color: string }) {
  return (
    <Svg width={14} height={14}>
      <Rect x={1} y={1} width={12} height={12} rx={3} fill={color} />
    </Svg>
  );
}

function path(points: Array<[number, number]>): string {
  return points
    .map(([x, y], k) => `${k === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
}

/** Labels along an axis that stand apart: every k-th, where k keeps them from touching. */
function every(labels: readonly string[], room: number): number {
  const longest = Math.max(1, ...labels.map((l) => l.length));
  return Math.max(1, Math.ceil((longest * TICK_CHAR + 6) / Math.max(1, room)));
}

// ─────────────── line chart (issue #245) ───────────────

function measuredAxis(lo: number, hi: number, room: number): Axis {
  const sample = niceAxis(lo, hi, 5).ticks.map(formatNumber);
  const longest = Math.max(1, ...sample.map((l) => l.length));
  const target = Math.max(2, Math.floor(room / (longest * TICK_CHAR + 12)));
  const ticks = niceAxis(lo, hi, target).ticks.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
  return {
    lo,
    hi,
    step: ticks.length > 1 ? (ticks[1] as number) - (ticks[0] as number) : hi - lo,
    ticks,
  };
}

function LineChartView({ fig, width }: { fig: LineFig; width: number }) {
  const { figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const { left: la, right: ra } = lineAxes(fig);
  const L = AXIS_ROOM;
  const R = ra ? AXIS_ROOM : EDGE_ROOM;
  const h = Math.round(clamp(width * 0.8, 200, 320));
  const bottom = X_LABELS + (fig.xt ? X_TITLE : 0);
  const pw = width - L - R;
  const ph = h - TOP - bottom;
  const Yof = (a: Axis) => (v: number) => TOP + (1 - (v - a.lo) / (a.hi - a.lo)) * ph;
  const Yl = Yof(la);
  const Yr = ra ? Yof(ra) : Yl;
  const n = fig.x.length;
  const xs = lineX(fig);
  // A measured x runs exactly from the first value to the last (no empty stretch after the
  // data), with round ticks inside it, as many as their labels leave room for.
  const xAxis = xs ? measuredAxis(xs[0] as number, xs[n - 1] as number, pw) : null;
  const slot = pw / n;
  const X = (k: number) =>
    xs && xAxis
      ? L + (((xs[k] as number) - xAxis.lo) / (xAxis.hi - xAxis.lo)) * pw
      : L + slot * (k + 0.5);
  const barW = Math.min(28, slot * 0.58);
  const leftUnit = fig.s.find((s) => !s.r)?.u ?? '';
  const rightUnit = fig.s.find((s) => s.r)?.u ?? '';
  const bars = fig.s.filter((s) => s.bar);
  const lines = fig.s.filter((s) => !s.bar);
  const step = xs ? 1 : every(fig.x, slot);

  const legend: LegendEntry[] = fig.s.map((s) => {
    const side = ra ? ` · ${t(s.r ? 'figure.axis_right' : 'figure.axis_left')}` : '';
    const label = `${s.n}${s.u ? ` (${s.u})` : ''}${side}`;
    const k = lines.indexOf(s);
    return {
      key: s.n,
      label,
      swatch: s.bar ? (
        <BarSwatch color={ink.fill} />
      ) : (
        <LineSwatch
          color={ink.series[k % ink.series.length] ?? ink.stroke}
          dash={DASHES[k % DASHES.length]}
          shape={k}
        />
      ),
    };
  });

  return (
    <View style={{ gap: SPACE.sm, alignSelf: 'stretch' }}>
      <Svg width={width} height={h}>
        <HGrid axis={la} Y={Yl} x1={L} x2={L + pw} />
        {bars.map((s) =>
          s.v.map((v, k) => {
            const Y = s.r ? Yr : Yl;
            const y0 = Y(Math.max(0, v));
            const y1 = Y(Math.min(0, v));
            return (
              <Rect
                key={`${s.n}${k}`}
                x={X(k) - barW / 2}
                y={y0}
                width={barW}
                height={Math.max(1, y1 - y0)}
                rx={3}
                fill={ink.fill}
              />
            );
          }),
        )}
        {/* the x-axis: on zero when zero is in range, else along the bottom */}
        <Line
          x1={L}
          y1={la.lo <= 0 && la.hi >= 0 ? Yl(0) : TOP + ph}
          x2={L + pw}
          y2={la.lo <= 0 && la.hi >= 0 ? Yl(0) : TOP + ph}
          stroke={ink.axis}
          strokeWidth={1.5}
        />
        <Line x1={L} y1={TOP} x2={L} y2={TOP + ph} stroke={ink.axis} strokeWidth={1.5} />
        {ra ? (
          <Line
            x1={L + pw}
            y1={TOP}
            x2={L + pw}
            y2={TOP + ph}
            stroke={ink.axis}
            strokeWidth={1.5}
          />
        ) : null}
        {lines.map((s, k) => {
          const Y = s.r ? Yr : Yl;
          const color = ink.series[k % ink.series.length] ?? ink.stroke;
          return (
            <G key={s.n}>
              <Path
                d={path(s.v.map((v, i) => [X(i), Y(v)]))}
                stroke={color}
                strokeWidth={2.5}
                strokeDasharray={DASHES[k % DASHES.length]}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {s.v.map((v, i) => (
                <Marker key={i} shape={k} x={X(i)} y={Y(v)} color={color} />
              ))}
            </G>
          );
        })}
        {la.ticks.map((v) => (
          <Tick key={`l${v}`} x={L - 5} y={Yl(v) + 4} text={formatNumber(v)} anchor="end" />
        ))}
        {ra
          ? ra.ticks.map((v) => (
              <Tick
                key={`r${v}`}
                x={L + pw + 5}
                y={Yr(v) + 4}
                text={formatNumber(v)}
                anchor="start"
              />
            ))
          : null}
        {leftUnit ? <Tick x={L - 5} y={TOP - 9} text={leftUnit} anchor="end" /> : null}
        {rightUnit ? <Tick x={L + pw + 5} y={TOP - 9} text={rightUnit} anchor="start" /> : null}
        {xs && xAxis
          ? xAxis.ticks.map((v) => (
              <Tick
                key={`x${v}`}
                x={L + ((v - xAxis.lo) / (xAxis.hi - xAxis.lo)) * pw}
                y={TOP + ph + 15}
                text={formatNumber(v)}
                anchor="middle"
              />
            ))
          : fig.x.map((l, k) =>
              k % step === 0 ? (
                <Tick key={`x${k}`} x={X(k)} y={TOP + ph + 15} text={l} anchor="middle" />
              ) : null,
            )}
        {fig.xt ? <Tick x={L + pw} y={h - 3} text={fig.xt} anchor="end" /> : null}
      </Svg>
      <Legend entries={legend} />
    </View>
  );
}

// ─────────────── climate chart (issue #245) ───────────────

/**
 * Walter–Lieth, as in the atlas: one vertical scale for both, 10 °C ≙ 20 mm, so a column that
 * reaches above the temperature line is a humid month. Above 100 mm the scale is compressed
 * tenfold, and that part of a column is drawn darker.
 */
function ClimateChartView({ fig, width }: { fig: ClimateFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const { lo, hi } = climateAxes(fig);
  const L = AXIS_ROOM;
  const R = AXIS_ROOM;
  const h = Math.round(clamp(width * 0.74, 200, 320));
  const pw = width - L - R;
  const ph = h - TOP - X_LABELS;
  const Y = (u: number) => TOP + (1 - (u - lo) / (hi - lo)) * ph;
  const slot = pw / 12;
  const X = (k: number) => L + slot * (k + 0.5);
  const barW = slot * 0.62;
  const initials = t('figure.month_initials').split(',');
  const axis: Axis = {
    lo,
    hi,
    step: CLIMATE_T_STEP,
    ticks: Array.from(
      { length: Math.round((hi - lo) / CLIMATE_T_STEP) + 1 },
      (_, k) => lo + k * CLIMATE_T_STEP,
    ),
  };
  /** The precipitation that sits at height `u` (°C units) on the right axis. */
  const mmAt = (u: number) =>
    u <= CLIMATE_P_KNEE / 2 ? 2 * u : CLIMATE_P_KNEE + (u - CLIMATE_P_KNEE / 2) * 20;
  const knee = precipUnits(CLIMATE_P_KNEE);

  return (
    <View style={{ gap: SPACE.sm, alignSelf: 'stretch' }}>
      <Text style={[TYPE.small, { color: palette.ink, fontWeight: '700' }]} numberOfLines={1}>
        {fig.place}
        <Text style={{ fontWeight: '400', color: palette.ink2 }}>
          {`  ·  ${t('figure.altitude', { alt: formatNumber(fig.alt) })}`}
        </Text>
      </Text>
      <Svg width={width} height={h}>
        <HGrid axis={axis} Y={Y} x1={L} x2={L + pw} />
        {fig.p.map((p, k) => {
          const u = precipUnits(p);
          const top = Y(u);
          const base = Y(0);
          if (p <= CLIMATE_P_KNEE) {
            return (
              <Rect
                key={k}
                x={X(k) - barW / 2}
                y={top}
                width={barW}
                height={Math.max(0.5, base - top)}
                fill={ink.wet}
              />
            );
          }
          return (
            <G key={k}>
              <Rect
                x={X(k) - barW / 2}
                y={Y(knee)}
                width={barW}
                height={base - Y(knee)}
                fill={ink.wet}
              />
              <Rect
                x={X(k) - barW / 2}
                y={top}
                width={barW}
                height={Y(knee) - top}
                fill={ink.wetDeep}
              />
            </G>
          );
        })}
        <Line x1={L} y1={Y(0)} x2={L + pw} y2={Y(0)} stroke={ink.axis} strokeWidth={1.5} />
        <Line x1={L} y1={TOP} x2={L} y2={TOP + ph} stroke={ink.axis} strokeWidth={1.5} />
        <Line x1={L + pw} y1={TOP} x2={L + pw} y2={Y(0)} stroke={ink.axis} strokeWidth={1.5} />
        <Path
          d={path(fig.t.map((v, k) => [X(k), Y(v)]))}
          stroke={ink.warm}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {fig.t.map((v, k) => (
          <Marker key={k} shape={0} x={X(k)} y={Y(v)} color={ink.warm} />
        ))}
        {axis.ticks.map((v) => (
          <Tick key={`t${v}`} x={L - 5} y={Y(v) + 4} text={formatNumber(v)} anchor="end" />
        ))}
        {axis.ticks
          .filter((v) => v >= 0)
          .map((v) => (
            <Tick
              key={`p${v}`}
              x={L + pw + 5}
              y={Y(v) + 4}
              text={formatNumber(mmAt(v))}
              anchor="start"
            />
          ))}
        <Tick x={L - 5} y={TOP - 9} text="°C" anchor="end" />
        <Tick x={L + pw + 5} y={TOP - 9} text="mm" anchor="start" />
        {initials.map((m, k) => (
          <Tick key={`m${k}`} x={X(k)} y={TOP + ph + 15} text={m} anchor="middle" />
        ))}
      </Svg>
      <Legend
        entries={[
          {
            key: 't',
            label: `${t('figure.temperature')} (°C)`,
            swatch: <LineSwatch color={ink.warm} shape={0} />,
          },
          {
            key: 'p',
            label: `${t('figure.precipitation')} (mm)`,
            swatch: <BarSwatch color={ink.wet} />,
          },
        ]}
      />
    </View>
  );
}

// ─────────────── pie chart (issue #246) ───────────────

function PieChartView({ fig, width }: { fig: PieFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  // The circle above its legend, not beside it: beside it a 14-character label had 8 characters
  // of room on a 360 px phone, and a cut label is a lost answer.
  const d = Math.round(clamp(width * 0.56, 120, 200));
  const r = d / 2 - 2;
  const cx = d / 2;
  const cy = fig.half ? d / 2 : d / 2;
  const h = fig.half ? d / 2 + 4 : d;
  const total = fig.half ? Math.PI : 2 * Math.PI;
  // Full circle from 12 o'clock, half circle from 9 o'clock over the top — clockwise both.
  let a = fig.half ? Math.PI : -Math.PI / 2;
  const slices = fig.v.map((v, k) => {
    const a0 = a;
    const a1 = a + (v / 100) * total;
    a = a1;
    const mid = (a0 + a1) / 2;
    return { k, v, a0, a1, mid, color: ink.slices[k % ink.slices.length] ?? ink.fill };
  });
  const at = (ang: number, rr: number) =>
    [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)] as const;

  return (
    <View style={{ alignItems: 'center', gap: SPACE.md, alignSelf: 'stretch' }}>
      <Svg width={d} height={h}>
        {slices.map((s) => {
          const [x0, y0] = at(s.a0, r);
          const [x1, y1] = at(s.a1, r);
          const large = s.a1 - s.a0 > Math.PI ? 1 : 0;
          return (
            <Path
              key={s.k}
              d={`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`}
              fill={s.color}
              stroke={ink.paper}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          );
        })}
        {slices.map((s) => {
          // A number on every slice wide enough to hold one; the legend names them all.
          if (s.a1 - s.a0 < 0.38) return null;
          const [x, y] = at(s.mid, r * (fig.half ? 0.66 : 0.62));
          return (
            <HaloText
              key={`n${s.k}`}
              x={x}
              y={y + 5}
              size={13}
              color={palette.ink}
              anchor="middle"
              text={String(s.k + 1)}
            />
          );
        })}
      </Svg>
      <View style={{ alignSelf: 'stretch', gap: 6, paddingHorizontal: SPACE.xs }}>
        {slices.map((s) => (
          <View key={s.k} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                backgroundColor: s.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={[
                  TYPE.small,
                  { color: palette.ink, fontSize: 11, lineHeight: 14, fontWeight: '700' },
                ]}
              >
                {s.k + 1}
              </Text>
            </View>
            <Text
              style={[TYPE.small, { color: palette.ink, flex: 1, minWidth: 0 }]}
              numberOfLines={1}
            >
              {fig.l[s.k]}
            </Text>
            <Text
              style={[
                TYPE.small,
                { color: palette.ink, fontWeight: '700', fontVariant: ['tabular-nums'] },
              ]}
            >
              {`${formatNumber(s.v)} %`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─────────────── box plot (issue #246) ───────────────

function BoxPlotView({ fig, width }: { fig: BoxFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  const axis = boxAxis(fig);
  // Room for half a tick label at either end of the axis.
  const L = 18;
  const R = 18;
  const pw = width - L - R;
  const X = (v: number) => L + ((v - axis.lo) / (axis.hi - axis.lo)) * pw;
  const labelH = 20;
  const boxH = 32;
  const rowH = labelH + boxH + SPACE.md;
  const plotH = fig.b.length * rowH;
  const h = plotH + 26 + (fig.u ? 14 : 0);
  const step = every(axis.ticks.map(formatNumber), (axis.step / (axis.hi - axis.lo)) * pw);

  return (
    <Svg width={width} height={h}>
      <VGrid axis={axis} X={X} y1={0} y2={plotH} />
      {fig.b.map((b, k) => {
        const top = k * rowH + labelH;
        const mid = top + boxH / 2;
        const [mn, q1, md, q3, mx] = b.v as [number, number, number, number, number];
        return (
          <G key={b.l}>
            <HaloText x={L} y={top - 6} size={12} color={palette.ink} anchor="start" text={b.l} />
            <Line x1={X(mn)} y1={mid} x2={X(q1)} y2={mid} stroke={ink.stroke} strokeWidth={1.75} />
            <Line x1={X(q3)} y1={mid} x2={X(mx)} y2={mid} stroke={ink.stroke} strokeWidth={1.75} />
            <Line
              x1={X(mn)}
              y1={mid - 8}
              x2={X(mn)}
              y2={mid + 8}
              stroke={ink.stroke}
              strokeWidth={1.75}
            />
            <Line
              x1={X(mx)}
              y1={mid - 8}
              x2={X(mx)}
              y2={mid + 8}
              stroke={ink.stroke}
              strokeWidth={1.75}
            />
            <Rect
              x={X(q1)}
              y={top}
              width={Math.max(1, X(q3) - X(q1))}
              height={boxH}
              rx={3}
              fill={ink.fillSoft}
              stroke={ink.stroke}
              strokeWidth={1.75}
            />
            <Line
              x1={X(md)}
              y1={top}
              x2={X(md)}
              y2={top + boxH}
              stroke={ink.point}
              strokeWidth={3}
            />
          </G>
        );
      })}
      <Line x1={L} y1={plotH + 4} x2={L + pw} y2={plotH + 4} stroke={ink.axis} strokeWidth={1.5} />
      {axis.ticks.map((v, k) => (
        <G key={`t${v}`}>
          <Line
            x1={X(v)}
            y1={plotH + 1}
            x2={X(v)}
            y2={plotH + 7}
            stroke={ink.axis}
            strokeWidth={1}
          />
          {k % step === 0 ? (
            <Tick x={X(v)} y={plotH + 20} text={formatNumber(v)} anchor="middle" />
          ) : null}
        </G>
      ))}
      {fig.u ? <Tick x={L + pw} y={h - 2} text={fig.u} anchor="end" /> : null}
    </Svg>
  );
}

// ─────────────── histogram (issue #246) ───────────────

function HistogramView({ fig, width }: { fig: HistogramFig; width: number }) {
  const { figure: ink } = useTheme();
  const axis = histogramAxis(fig);
  const L = AXIS_ROOM;
  const R = EDGE_ROOM;
  const h = Math.round(clamp(width * 0.68, 180, 290));
  const bottom = X_LABELS + (fig.xt ? X_TITLE : 0);
  const pw = width - L - R;
  const ph = h - TOP - bottom;
  const Y = (v: number) => TOP + (1 - (v - axis.lo) / (axis.hi - axis.lo)) * ph;
  const n = fig.v.length;
  const slot = pw / n;
  // Whole-number class centres (a distribution over k = 0, 1, 2 …) are labelled at the centre;
  // anything else at the class boundaries.
  const centred = Number.isInteger(fig.x0 + fig.w / 2) && Number.isInteger(fig.w);
  const marks = centred
    ? fig.v.map((_, k) => ({ x: L + slot * (k + 0.5), v: fig.x0 + fig.w * (k + 0.5) }))
    : Array.from({ length: n + 1 }, (_, k) => ({ x: L + slot * k, v: fig.x0 + fig.w * k }));
  const step = every(
    marks.map((m) => formatNumber(m.v)),
    slot,
  );

  return (
    <Svg width={width} height={h}>
      <HGrid axis={axis} Y={Y} x1={L} x2={L + pw} />
      {fig.v.map((v, k) => (
        <Rect
          key={k}
          x={L + slot * k}
          y={Y(v)}
          width={slot}
          height={Math.max(0, Y(0) - Y(v))}
          fill={ink.fill}
          stroke={ink.stroke}
          strokeWidth={1}
        />
      ))}
      <Line x1={L} y1={Y(0)} x2={L + pw} y2={Y(0)} stroke={ink.axis} strokeWidth={1.5} />
      <Line x1={L} y1={TOP} x2={L} y2={Y(0)} stroke={ink.axis} strokeWidth={1.5} />
      {axis.ticks.map((v) => (
        <Tick key={`y${v}`} x={L - 5} y={Y(v) + 4} text={formatNumber(v)} anchor="end" />
      ))}
      {marks.map((m, k) =>
        k % step === 0 ? (
          <Tick key={`x${k}`} x={m.x} y={TOP + ph + 15} text={formatNumber(m.v)} anchor="middle" />
        ) : null,
      )}
      {fig.yt ? <Tick x={2} y={TOP - 9} text={fig.yt} anchor="start" /> : null}
      {fig.xt ? <Tick x={L + pw} y={h - 3} text={fig.xt} anchor="end" /> : null}
    </Svg>
  );
}

// ─────────────── scatter plot (issue #246) ───────────────

function ScatterPlotView({ fig, width }: { fig: ScatterFig; width: number }) {
  const { figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const clipId = `scatter-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { x: xa, y: ya } = scatterAxes(fig);
  const L = AXIS_ROOM;
  const R = EDGE_ROOM;
  const h = Math.round(clamp(width * 0.72, 190, 300));
  const bottom = X_LABELS + (fig.xt ? X_TITLE : 0);
  const pw = width - L - R;
  const ph = h - TOP - bottom;
  const X = (v: number) => L + ((v - xa.lo) / (xa.hi - xa.lo)) * pw;
  const Y = (v: number) => TOP + (1 - (v - ya.lo) / (ya.hi - ya.lo)) * ph;
  const fit = fig.fit ? regression(fig.x, fig.y) : null;
  const xStep = every(xa.ticks.map(formatNumber), (xa.step / (xa.hi - xa.lo)) * pw);

  return (
    <View style={{ gap: SPACE.sm, alignSelf: 'stretch' }}>
      <Svg width={width} height={h}>
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={L} y={TOP} width={pw} height={ph} />
          </ClipPath>
        </Defs>
        <HGrid axis={ya} Y={Y} x1={L} x2={L + pw} />
        <VGrid axis={xa} X={X} y1={TOP} y2={TOP + ph} />
        <Line x1={L} y1={TOP + ph} x2={L + pw} y2={TOP + ph} stroke={ink.axis} strokeWidth={1.5} />
        <Line x1={L} y1={TOP} x2={L} y2={TOP + ph} stroke={ink.axis} strokeWidth={1.5} />
        {fit ? (
          <G clipPath={`url(#${clipId})`}>
            <Line
              x1={X(xa.lo)}
              y1={Y(fit.intercept + fit.slope * xa.lo)}
              x2={X(xa.hi)}
              y2={Y(fit.intercept + fit.slope * xa.hi)}
              stroke={ink.series[1] ?? ink.stroke}
              strokeWidth={2}
              strokeDasharray={DASHES[1]}
              strokeLinecap="round"
            />
          </G>
        ) : null}
        {fig.x.map((x, k) => (
          <Circle
            key={k}
            cx={X(x)}
            cy={Y(fig.y[k] as number)}
            r={4.5}
            fill={ink.point}
            stroke={ink.paper}
            strokeWidth={1.5}
          />
        ))}
        {ya.ticks.map((v) => (
          <Tick key={`y${v}`} x={L - 5} y={Y(v) + 4} text={formatNumber(v)} anchor="end" />
        ))}
        {xa.ticks.map((v, k) =>
          k % xStep === 0 ? (
            <Tick key={`x${v}`} x={X(v)} y={TOP + ph + 15} text={formatNumber(v)} anchor="middle" />
          ) : null,
        )}
        {fig.yt ? <Tick x={2} y={TOP - 9} text={fig.yt} anchor="start" /> : null}
        {fig.xt ? <Tick x={L + pw} y={h - 3} text={fig.xt} anchor="end" /> : null}
      </Svg>
      {fit ? (
        <Legend
          entries={[
            {
              key: 'fit',
              label: t('figure.fit_line'),
              swatch: (
                <Svg width={26} height={12}>
                  <Line
                    x1={1}
                    y1={6}
                    x2={25}
                    y2={6}
                    stroke={ink.series[1] ?? ink.stroke}
                    strokeWidth={2}
                    strokeDasharray={DASHES[1]}
                    strokeLinecap="round"
                  />
                </Svg>
              ),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

// ─────────────── population pyramid (issue #246) ───────────────

function PyramidView({ fig, width }: { fig: PyramidFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const axis = pyramidAxis(fig);
  const n = fig.m.length;
  const cw = 50;
  const cx = width / 2;
  // Room for half a tick label at either outer end.
  const sw = (width - cw) / 2 - 12;
  const rowH = clamp(Math.floor(220 / n), 12, 22);
  const plotH = n * rowH;
  const h = plotH + 24 + (fig.u ? 14 : 0);
  const men = ink.slices[1] ?? ink.fill;
  const women = ink.slices[4] ?? ink.fill;
  const len = (v: number) => (v / axis.hi) * sw;
  const tickStep = every(axis.ticks.map(formatNumber), (axis.step / axis.hi) * sw);

  const side = (sign: -1 | 1) =>
    axis.ticks.map((v, k) => {
      const x = cx + sign * (cw / 2 + len(v));
      return (
        <G key={`${sign}${v}`}>
          <Line x1={x} y1={0} x2={x} y2={plotH} stroke={ink.grid} strokeWidth={1} />
          {k % tickStep === 0 ? (
            <Tick x={x} y={plotH + 15} text={formatNumber(v)} anchor="middle" />
          ) : null}
        </G>
      );
    });

  return (
    <View style={{ gap: SPACE.sm, alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <BarSwatch color={men} />
          <Text style={[TYPE.small, { color: palette.ink, fontWeight: '600' }]}>
            {t('figure.men')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[TYPE.small, { color: palette.ink, fontWeight: '600' }]}>
            {t('figure.women')}
          </Text>
          <BarSwatch color={women} />
        </View>
      </View>
      <Svg width={width} height={h}>
        {side(-1)}
        {side(1)}
        {fig.m.map((m, k) => {
          const y = (n - 1 - k) * rowH + 1;
          const f = fig.f[k] as number;
          return (
            <G key={k}>
              <Rect x={cx - cw / 2 - len(m)} y={y} width={len(m)} height={rowH - 2} fill={men} />
              <Rect x={cx + cw / 2} y={y} width={len(f)} height={rowH - 2} fill={women} />
              {rowH >= 14 || k % 2 === 0 ? (
                <Tick x={cx} y={y + rowH / 2 + 3} text={ageGroup(fig, k)} anchor="middle" />
              ) : null}
            </G>
          );
        })}
        <Line
          x1={cx - cw / 2}
          y1={plotH}
          x2={cx - cw / 2 - sw}
          y2={plotH}
          stroke={ink.axis}
          strokeWidth={1.5}
        />
        <Line
          x1={cx + cw / 2}
          y1={plotH}
          x2={cx + cw / 2 + sw}
          y2={plotH}
          stroke={ink.axis}
          strokeWidth={1.5}
        />
        {fig.u ? <Tick x={cx} y={h - 2} text={fig.u} anchor="middle" /> : null}
      </Svg>
    </View>
  );
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
