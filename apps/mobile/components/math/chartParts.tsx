// The pieces every chart is drawn from (LineCharts.tsx, StatCharts.tsx): tick labels and rows of
// them, the grid with its half steps, the axis lines, the point markers and the legend with its
// swatches. One drawing each, so the same thing looks the same in every chart.

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect } from 'react-native-svg';

import { TICK_FONT, type Axis } from '../../../../packages/shared-math/src/charts.js';
import { TOP } from '../../lib/math/chartLayout.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatNumber, HaloText } from './figureText.js';

export const DASHES: ReadonlyArray<string | undefined> = [undefined, '7 4', '2 4'];

type Anchor = 'start' | 'middle' | 'end';

/** A text label in the axis ink. */
export function Tick({
  x,
  y,
  text,
  anchor,
}: {
  x: number;
  y: number;
  text: string;
  anchor: Anchor;
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

/** The labels of a y-axis, one per tick, standing at `x`. */
export function YTicks({
  axis,
  Y,
  x,
  anchor,
}: {
  axis: Axis;
  Y: (v: number) => number;
  x: number;
  anchor: 'start' | 'end';
}) {
  return (
    <>
      {axis.ticks.map((v) => (
        <Tick key={v} x={x} y={Y(v) + 4} text={formatNumber(v)} anchor={anchor} />
      ))}
    </>
  );
}

/** The labels under the plot, centred on their places: every `step`-th, so they never touch. */
export function XTicks({
  marks,
  y,
  step = 1,
}: {
  marks: ReadonlyArray<{ x: number; text: string }>;
  y: number;
  step?: number;
}) {
  return (
    <>
      {marks.map((m, k) =>
        k % step === 0 ? <Tick key={k} x={m.x} y={y} text={m.text} anchor="middle" /> : null,
      )}
    </>
  );
}

/** The axes' titles: the y-axis' above it at the left edge, the x-axis' under the plot's end. */
export function AxisTitles({
  xt,
  yt = '',
  right,
  height,
}: {
  xt: string;
  yt?: string;
  right: number;
  height: number;
}) {
  return (
    <>
      {yt ? <Tick x={2} y={TOP - 9} text={yt} anchor="start" /> : null}
      {xt ? <Tick x={right} y={height - 3} text={xt} anchor="end" /> : null}
    </>
  );
}

/**
 * Grid lines at every labelled step and, fainter, at every half step: the half lines are what
 * makes a reading to a fifth of a step possible (`readingTolerance`). Level lines from `from` to
 * `to` across at `at(v)`; `upright` ones from `from` to `to` down at `at(v)`.
 */
export function Grid({
  axis,
  at,
  from,
  to,
  upright = false,
}: {
  axis: Axis;
  at: (v: number) => number;
  from: number;
  to: number;
  upright?: boolean;
}) {
  const { figure: ink } = useTheme();
  const line = (key: string, v: number, faint: boolean) => {
    const p = at(v);
    return (
      <Line
        key={key}
        x1={upright ? p : from}
        y1={upright ? from : p}
        x2={upright ? p : to}
        y2={upright ? to : p}
        stroke={ink.grid}
        strokeOpacity={faint ? 0.5 : undefined}
        strokeWidth={1}
      />
    );
  };
  const lines: ReactNode[] = [];
  axis.ticks.forEach((v, k) => {
    lines.push(line(`g${k}`, v, false));
    const half = v + axis.step / 2;
    if (half < axis.hi) lines.push(line(`h${k}`, half, true));
  });
  return <G>{lines}</G>;
}

/** An axis line in the axis ink. */
export function AxisLine(p: { x1: number; y1: number; x2: number; y2: number }) {
  const { figure: ink } = useTheme();
  return <Line {...p} stroke={ink.axis} strokeWidth={1.5} />;
}

/** A point marker per series: circle, square, triangle — the second signal next to colour. */
export function Marker({
  shape,
  x,
  y,
  color,
}: {
  shape: number;
  x: number;
  y: number;
  color: string;
}) {
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

/** A swatch beside its name (the legend, the halves of a pyramid). */
export const SWATCH_ROW = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6, // token-exempt: swatch and name 6 pt apart, between SPACE.xs and SPACE.sm
} as const;

export type LegendEntry = { key: string; label: string; swatch: ReactNode };

/** The legend under a chart: one wrapping row of swatches with their names. */
export function Legend({ entries }: { entries: LegendEntry[] }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.md, rowGap: SPACE.xs }}>
      {entries.map((e) => (
        <View key={e.key} style={SWATCH_ROW}>
          {e.swatch}
          <Text style={[TYPE.small, { color: palette.ink }]}>{e.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** A series' line in the legend, with its marker (`shape`) when its points carry one. */
export function LineSwatch({
  color,
  dash,
  shape,
  strokeWidth = 2.5,
}: {
  color: string;
  dash?: string;
  shape?: number;
  strokeWidth?: number;
}) {
  return (
    <Svg width={26} height={12}>
      <Line
        x1={1}
        y1={6}
        x2={25}
        y2={6}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      {shape === undefined ? null : <Marker shape={shape} x={13} y={6} color={color} />}
    </Svg>
  );
}

export function BarSwatch({ color }: { color: string }) {
  return (
    <Svg width={14} height={14}>
      <Rect x={1} y={1} width={12} height={12} rx={3} fill={color} />
    </Svg>
  );
}

/** A polyline through the points, as an SVG path. */
export function linePath(points: Array<[number, number]>): string {
  return points
    .map(([x, y], k) => `${k === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
}
