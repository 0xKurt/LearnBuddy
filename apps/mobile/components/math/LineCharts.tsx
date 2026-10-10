// Charts over an x-axis of categories or measured values (issue #245): the line chart — lines
// with markers, columns, a second axis on the right — and the Walter–Lieth climate chart. The
// axes come from packages/shared-math/src/charts.ts, the functions the API reads the key from.

import type { ChartFigure } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

// Imported by path, like expression.ts: the mobile bundle takes only this dependency-free module.
import {
  CLIMATE_P_KNEE,
  CLIMATE_T_STEP,
  climateAxes,
  lineAxes,
  lineX,
  niceAxis,
  precipUnits,
  TICK_CHAR,
  type Axis,
} from '../../../../packages/shared-math/src/charts.js';
import { chartFrame, every, TOP } from '../../lib/math/chartLayout.js';
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
  type LegendEntry,
  linePath,
  LineSwatch,
  Marker,
  Tick,
  XTicks,
  YTicks,
} from './chartParts.js';
import { formatNumber } from './figureText.js';

type LineFig = Extract<ChartFigure, { type: 'line_chart' }>;
type ClimateFig = Extract<ChartFigure, { type: 'climate_chart' }>;

// ─────────────── line chart (issue #245) ───────────────

/** The labels a measured x-axis is spaced for: those of its round ticks (`measuredAxis`). */
function measuredLabels(lo: number, hi: number): string[] {
  return niceAxis(lo, hi, 5).ticks.map(formatNumber);
}

function measuredAxis(lo: number, hi: number, room: number, sample: readonly string[]): Axis {
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

export function LineChartView({ fig, width }: { fig: LineFig; width: number }) {
  const { figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const { left: la, right: ra } = lineAxes(fig);
  const n = fig.x.length;
  const xs = lineX(fig);
  // A measured x runs exactly from the first value to the last (no empty stretch after the
  // data), with round ticks inside it, as many as their labels leave room for — the last of them
  // on the plot's end, so the frame keeps half a label's room there (`edgeRoom`, #387).
  const range = xs ? ([xs[0] as number, xs[n - 1] as number] as const) : null;
  const sample = range ? measuredLabels(...range) : [];
  const frame = chartFrame(width, {
    size: [0.8, 200, 320],
    rightAxis: !!ra,
    xTitle: !!fig.xt,
    ends: sample,
  });
  const { left: L, height: h, pw, ph } = frame;
  const Yl = frame.Y(la);
  const Yr = ra ? frame.Y(ra) : Yl;
  const xAxis = range ? measuredAxis(...range, pw, sample) : null;
  const Xm = xAxis ? frame.X(xAxis) : null;
  const slot = pw / n;
  const X = (k: number) => (xs && Xm ? Xm(xs[k] as number) : L + slot * (k + 0.5));
  const barW = Math.min(28, slot * 0.58);
  const leftUnit = fig.s.find((s) => !s.r)?.u ?? '';
  const rightUnit = fig.s.find((s) => s.r)?.u ?? '';
  const bars = fig.s.filter((s) => s.bar);
  const lines = fig.s.filter((s) => !s.bar);
  // The x-axis: on zero when zero is in range, else along the bottom.
  const axisY = la.lo <= 0 && la.hi >= 0 ? Yl(0) : TOP + ph;

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
        <Grid axis={la} at={Yl} from={L} to={L + pw} />
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
        <AxisLine x1={L} y1={axisY} x2={L + pw} y2={axisY} />
        <AxisLine x1={L} y1={TOP} x2={L} y2={TOP + ph} />
        {ra ? <AxisLine x1={L + pw} y1={TOP} x2={L + pw} y2={TOP + ph} /> : null}
        {lines.map((s, k) => {
          const Y = s.r ? Yr : Yl;
          const color = ink.series[k % ink.series.length] ?? ink.stroke;
          return (
            <G key={s.n}>
              <Path
                d={linePath(s.v.map((v, i) => [X(i), Y(v)]))}
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
        <YTicks axis={la} Y={Yl} x={L - 5} anchor="end" />
        {ra ? <YTicks axis={ra} Y={Yr} x={L + pw + 5} anchor="start" /> : null}
        {leftUnit ? <Tick x={L - 5} y={TOP - 9} text={leftUnit} anchor="end" /> : null}
        {rightUnit ? <Tick x={L + pw + 5} y={TOP - 9} text={rightUnit} anchor="start" /> : null}
        {xAxis && Xm ? (
          <XTicks
            marks={xAxis.ticks.map((v) => ({ x: Xm(v), text: formatNumber(v) }))}
            y={TOP + ph + 15}
          />
        ) : (
          <XTicks
            marks={fig.x.map((l, k) => ({ x: X(k), text: l }))}
            y={TOP + ph + 15}
            step={every(fig.x, slot)}
          />
        )}
        <AxisTitles xt={fig.xt} right={L + pw} height={h} />
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
export function ClimateChartView({ fig, width }: { fig: ClimateFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const { lo, hi } = climateAxes(fig);
  const frame = chartFrame(width, { size: [0.74, 200, 320], rightAxis: true, xTitle: false });
  const { left: L, height: h, pw, ph } = frame;
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
  const Y = frame.Y(axis);
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
        <Grid axis={axis} at={Y} from={L} to={L + pw} />
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
        <AxisLine x1={L} y1={Y(0)} x2={L + pw} y2={Y(0)} />
        <AxisLine x1={L} y1={TOP} x2={L} y2={TOP + ph} />
        <AxisLine x1={L + pw} y1={TOP} x2={L + pw} y2={Y(0)} />
        <Path
          d={linePath(fig.t.map((v, k) => [X(k), Y(v)]))}
          stroke={ink.warm}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {fig.t.map((v, k) => (
          <Marker key={k} shape={0} x={X(k)} y={Y(v)} color={ink.warm} />
        ))}
        <YTicks axis={axis} Y={Y} x={L - 5} anchor="end" />
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
        <XTicks marks={initials.map((m, k) => ({ x: X(k), text: m }))} y={TOP + ph + 15} />
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
