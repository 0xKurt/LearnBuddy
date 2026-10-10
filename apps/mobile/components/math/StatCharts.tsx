// The charts of statistics (issue #246): the pie, the box plot, the histogram, the scatter plot
// with its least-squares line and the population pyramid. Every axis comes from
// packages/shared-math/src/charts.ts, the functions the API reads the key from; the slices are
// numbered and the halves of a pyramid named, so nothing is told apart by colour alone.

import type { ChartFigure } from '@learnbuddy/shared-types/contracts';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';

// Imported by path, like expression.ts: the mobile bundle takes only this dependency-free module.
import {
  ageGroup,
  boxAxis,
  histogramAxis,
  pyramidAxis,
  regression,
  scatterAxes,
} from '../../../../packages/shared-math/src/charts.js';
import { clamp } from '../../lib/gestures.js';
import { chartFrame, every, TOP } from '../../lib/math/chartLayout.js';
import { plotX } from '../../lib/math/plotLayout.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import {
  AxisLine,
  AxisTitles,
  BarSwatch,
  DASHES,
  Grid,
  Legend,
  LineSwatch,
  SWATCH_ROW,
  Tick,
  XTicks,
  YTicks,
} from './chartParts.js';
import { formatNumber, HaloText } from './figureText.js';

type PieFig = Extract<ChartFigure, { type: 'pie_chart' }>;
type BoxFig = Extract<ChartFigure, { type: 'box_plot' }>;
type HistogramFig = Extract<ChartFigure, { type: 'histogram' }>;
type ScatterFig = Extract<ChartFigure, { type: 'scatter_plot' }>;
type PyramidFig = Extract<ChartFigure, { type: 'pyramid' }>;

// ─────────────── pie chart (issue #246) ───────────────

export function PieChartView({ fig, width }: { fig: PieFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  // The circle above its legend, not beside it: beside it a 14-character label had 8 characters
  // of room on a 360 px phone, and a cut label is a lost answer.
  const d = Math.round(clamp(width * 0.56, 120, 200));
  const r = d / 2 - 2;
  const cx = d / 2;
  const cy = d / 2;
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
      {/* token-exempt: legend rows 6 pt apart, as a swatch and its name */}
      <View style={{ alignSelf: 'stretch', gap: 6, paddingHorizontal: SPACE.xs }}>
        {slices.map((s) => (
          <View key={s.k} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 6, // token-exempt: the slice number's badge, 20 pt with a soft corner
                backgroundColor: s.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={[
                  TYPE.small,
                  // token-exempt: the slice's number at 11/14, the size of the number in its slice
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

export function BoxPlotView({ fig, width }: { fig: BoxFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  const axis = boxAxis(fig);
  // Room for half a tick label at either end of the axis.
  const L = 18;
  const R = 18;
  const pw = width - L - R;
  const X = (v: number) => plotX({ left: L, pw, x0: axis.lo, x1: axis.hi }, v);
  const labelH = 20;
  const boxH = 32;
  const rowH = labelH + boxH + SPACE.md;
  const plotH = fig.b.length * rowH;
  const h = plotH + 26 + (fig.u ? 14 : 0);
  const step = every(axis.ticks.map(formatNumber), (axis.step / (axis.hi - axis.lo)) * pw);
  const whisker = (x1: number, y1: number, x2: number, y2: number) => (
    <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink.stroke} strokeWidth={1.75} />
  );

  return (
    <Svg width={width} height={h}>
      <Grid axis={axis} at={X} from={0} to={plotH} upright />
      {fig.b.map((b, k) => {
        const top = k * rowH + labelH;
        const mid = top + boxH / 2;
        const [mn, q1, md, q3, mx] = b.v as [number, number, number, number, number];
        return (
          <G key={b.l}>
            <HaloText x={L} y={top - 6} size={12} color={palette.ink} anchor="start" text={b.l} />
            {whisker(X(mn), mid, X(q1), mid)}
            {whisker(X(q3), mid, X(mx), mid)}
            {whisker(X(mn), mid - 8, X(mn), mid + 8)}
            {whisker(X(mx), mid - 8, X(mx), mid + 8)}
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
      <AxisLine x1={L} y1={plotH + 4} x2={L + pw} y2={plotH + 4} />
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

export function HistogramView({ fig, width }: { fig: HistogramFig; width: number }) {
  const { figure: ink } = useTheme();
  const axis = histogramAxis(fig);
  const n = fig.v.length;
  // Whole-number class centres (a distribution over k = 0, 1, 2 …) are labelled at the centre;
  // anything else at the class boundaries — the last of them on the plot's end (`edgeRoom`, #387).
  const centred = Number.isInteger(fig.x0 + fig.w / 2) && Number.isInteger(fig.w);
  const frame = chartFrame(width, {
    size: [0.68, 180, 290],
    rightAxis: false,
    xTitle: !!fig.xt,
    ends: centred ? [] : [formatNumber(fig.x0 + fig.w * n)],
  });
  const { left: L, height: h, pw, ph } = frame;
  const Y = frame.Y(axis);
  const slot = pw / n;
  const marks = (
    centred
      ? fig.v.map((_, k) => ({ x: L + slot * (k + 0.5), v: fig.x0 + fig.w * (k + 0.5) }))
      : Array.from({ length: n + 1 }, (_, k) => ({ x: L + slot * k, v: fig.x0 + fig.w * k }))
  ).map((m) => ({ x: m.x, text: formatNumber(m.v) }));

  return (
    <Svg width={width} height={h}>
      <Grid axis={axis} at={Y} from={L} to={L + pw} />
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
      <AxisLine x1={L} y1={Y(0)} x2={L + pw} y2={Y(0)} />
      <AxisLine x1={L} y1={TOP} x2={L} y2={Y(0)} />
      <YTicks axis={axis} Y={Y} x={L - 5} anchor="end" />
      <XTicks
        marks={marks}
        y={TOP + ph + 15}
        step={every(
          marks.map((m) => m.text),
          slot,
        )}
      />
      <AxisTitles xt={fig.xt} yt={fig.yt} right={L + pw} height={h} />
    </Svg>
  );
}

// ─────────────── scatter plot (issue #246) ───────────────

export function ScatterPlotView({ fig, width }: { fig: ScatterFig; width: number }) {
  const { figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const clipId = `scatter-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { x: xa, y: ya } = scatterAxes(fig);
  const frame = chartFrame(width, {
    size: [0.72, 190, 300],
    rightAxis: false,
    xTitle: !!fig.xt,
    // Its x-axis is measured: the last tick stands on the plot's end (`edgeRoom`, #387).
    ends: xa.ticks.map(formatNumber),
  });
  const { left: L, height: h, pw, ph } = frame;
  const X = frame.X(xa);
  const Y = frame.Y(ya);
  const fit = fig.fit ? regression(fig.x, fig.y) : null;
  const xStep = every(xa.ticks.map(formatNumber), (xa.step / (xa.hi - xa.lo)) * pw);
  const fitColor = ink.series[1] ?? ink.stroke;

  return (
    <View style={{ gap: SPACE.sm, alignSelf: 'stretch' }}>
      <Svg width={width} height={h}>
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={L} y={TOP} width={pw} height={ph} />
          </ClipPath>
        </Defs>
        <Grid axis={ya} at={Y} from={L} to={L + pw} />
        <Grid axis={xa} at={X} from={TOP} to={TOP + ph} upright />
        <AxisLine x1={L} y1={TOP + ph} x2={L + pw} y2={TOP + ph} />
        <AxisLine x1={L} y1={TOP} x2={L} y2={TOP + ph} />
        {fit ? (
          <G clipPath={`url(#${clipId})`}>
            <Line
              x1={X(xa.lo)}
              y1={Y(fit.intercept + fit.slope * xa.lo)}
              x2={X(xa.hi)}
              y2={Y(fit.intercept + fit.slope * xa.hi)}
              stroke={fitColor}
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
        <YTicks axis={ya} Y={Y} x={L - 5} anchor="end" />
        <XTicks
          marks={xa.ticks.map((v) => ({ x: X(v), text: formatNumber(v) }))}
          y={TOP + ph + 15}
          step={xStep}
        />
        <AxisTitles xt={fig.xt} yt={fig.yt} right={L + pw} height={h} />
      </Svg>
      {fit ? (
        <Legend
          entries={[
            {
              key: 'fit',
              label: t('figure.fit_line'),
              swatch: <LineSwatch color={fitColor} dash={DASHES[1]} strokeWidth={2} />,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

// ─────────────── population pyramid (issue #246) ───────────────

export function PyramidView({ fig, width }: { fig: PyramidFig; width: number }) {
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
  const name = { color: palette.ink, fontWeight: '600' } as const;

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
        <View style={SWATCH_ROW}>
          <BarSwatch color={men} />
          <Text style={[TYPE.small, name]}>{t('figure.men')}</Text>
        </View>
        <View style={SWATCH_ROW}>
          <Text style={[TYPE.small, name]}>{t('figure.women')}</Text>
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
        <AxisLine x1={cx - cw / 2} y1={plotH} x2={cx - cw / 2 - sw} y2={plotH} />
        <AxisLine x1={cx + cw / 2} y1={plotH} x2={cx + cw / 2 + sw} y2={plotH} />
        {fig.u ? <Tick x={cx} y={h - 2} text={fig.u} anchor="middle" /> : null}
      </Svg>
    </View>
  );
}
