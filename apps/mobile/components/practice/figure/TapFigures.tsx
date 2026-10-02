// The figures of a tap task that are not a plane (issue #248): a number line, a bar chart and
// a clock face. Each draws what she has chosen so far and lies under a `TouchLayer`; the
// arithmetic of where a tap lands is in `lib/math/gridFrame.ts` and shared-math `grid.ts`.

import { Platform } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import type { TapFigure } from '@learnbuddy/shared-types/contracts';

import { gridValue } from '../../../../../packages/shared-math/src/grid.js';
import { lineX, type LineFrame } from '../../../lib/math/gridFrame.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { formatNumber } from '../../math/FigureView.js';

const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

type LineFig = Extract<TapFigure, { kind: 'number_line' }>;
type BarsFig = Extract<TapFigure, { kind: 'bars' }>;

/** How tall the number line is drawn: room for a name above and the numbers below. */
export const LINE_HEIGHT = 96;
const LINE_AXIS = 52;

export function NumberLineSvg({
  fig,
  frame: f,
  width,
  chosen,
}: {
  fig: LineFig;
  frame: LineFrame;
  width: number;
  chosen: number | null;
}) {
  const { figure: ink } = useTheme();
  const ticks = Math.round((f.v1 - f.v0) / fig.step);
  const snaps = Math.round((f.v1 - f.v0) / f.snap);
  const every = Math.max(1, Math.ceil(ticks / Math.max(2, Math.floor(width / 40))));
  const visible = (v: number) => v >= f.v0 - 1e-9 && v <= f.v1 + 1e-9;
  return (
    <Svg width={width} height={LINE_HEIGHT}>
      <Line
        x1={f.left - 12}
        y1={LINE_AXIS}
        x2={width - 4}
        y2={LINE_AXIS}
        stroke={ink.axis}
        strokeWidth={1.5}
      />
      {Array.from({ length: snaps + 1 }, (_, i) => gridValue(f.v0, f.snap, i)).map((v, i) => (
        <Line
          key={`s${i}`}
          x1={lineX(f, v)}
          y1={LINE_AXIS - 4}
          x2={lineX(f, v)}
          y2={LINE_AXIS + 4}
          stroke={ink.gridStrong}
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: ticks + 1 }, (_, i) => gridValue(f.v0, fig.step, i)).map((v, i) => (
        <G key={`t${i}`}>
          <Line
            x1={lineX(f, v)}
            y1={LINE_AXIS - 9}
            x2={lineX(f, v)}
            y2={LINE_AXIS + 9}
            stroke={ink.axis}
            strokeWidth={1.5}
          />
          {i % every === 0 ? (
            <SvgText
              fontFamily={FAMILY}
              x={lineX(f, v)}
              y={LINE_AXIS + 27}
              fontSize={13}
              fill={ink.label}
              textAnchor="middle"
            >
              {formatNumber(v)}
            </SvgText>
          ) : null}
        </G>
      ))}
      {fig.marks
        .filter((m) => visible(m.value))
        .map((m, i) => (
          <G key={`m${i}`}>
            <Circle cx={lineX(f, m.value)} cy={LINE_AXIS} r={4.5} fill={ink.stroke} />
            {m.label ? (
              <SvgText
                fontFamily={FAMILY}
                x={lineX(f, m.value)}
                y={LINE_AXIS - 16}
                fontSize={13}
                fontWeight="700"
                fill={ink.stroke}
                textAnchor="middle"
              >
                {m.label}
              </SvgText>
            ) : null}
          </G>
        ))}
      {chosen !== null && visible(chosen) ? (
        <G>
          <Line
            x1={lineX(f, chosen)}
            y1={LINE_AXIS - 30}
            x2={lineX(f, chosen)}
            y2={LINE_AXIS - 10}
            stroke={ink.point}
            strokeWidth={2.5}
          />
          <Circle cx={lineX(f, chosen)} cy={LINE_AXIS} r={10} fill={ink.fillSoft} />
          <Circle
            cx={lineX(f, chosen)}
            cy={LINE_AXIS}
            r={6.5}
            fill={ink.point}
            stroke={ink.paper}
            strokeWidth={2}
          />
        </G>
      ) : null}
    </Svg>
  );
}

/** Bars she taps: each column's whole slot is its target (≥ 44 pt wide: at most six bars). */
export function TapBarsSvg({
  fig,
  width,
  height,
  chosen,
}: {
  fig: BarsFig;
  width: number;
  height: number;
  chosen: string | null;
}) {
  const { palette, figure: ink } = useTheme();
  const unit = fig.unit ? ` ${fig.unit}` : '';
  const values = fig.bars.map((b) => b.value);
  const vmin = Math.min(0, ...values);
  const vmax = Math.max(0, ...values);
  const span = vmax - vmin || 1;
  const top = 24;
  const bottom = 26;
  const ph = height - top - bottom;
  const Y = (v: number) => top + (1 - (v - vmin) / span) * ph;
  const slot = width / fig.bars.length;
  const bw = Math.min(56, slot * 0.64);
  return (
    <Svg width={width} height={height}>
      {fig.bars.map((b, i) => {
        const cx = slot * i + slot / 2;
        const ya = Y(Math.max(0, b.value));
        const yb = Y(Math.min(0, b.value));
        const on = b.id === chosen;
        return (
          <G key={b.id}>
            {on ? (
              <Rect
                x={slot * i + 3}
                y={2}
                width={slot - 6}
                height={height - 4}
                rx={12}
                fill={ink.fillSoft}
                stroke={ink.point}
                strokeWidth={2}
              />
            ) : null}
            <Rect
              x={cx - bw / 2}
              y={ya}
              width={bw}
              height={Math.max(1, yb - ya)}
              rx={4}
              fill={on ? ink.point : ink.fill}
            />
            <SvgText
              fontFamily={FAMILY}
              x={cx}
              y={b.value >= 0 ? ya - 6 : yb + 14}
              fontSize={13}
              fontWeight="600"
              fill={palette.ink}
              textAnchor="middle"
            >
              {`${formatNumber(b.value)}${unit}`}
            </SvgText>
            <SvgText
              fontFamily={FAMILY}
              x={cx}
              y={height - 9}
              fontSize={13}
              fontWeight={on ? '700' : '400'}
              fill={on ? palette.ink : palette.ink2}
              textAnchor="middle"
            >
              {b.label}
            </SvgText>
          </G>
        );
      })}
      <Line x1={0} y1={Y(0)} x2={width} y2={Y(0)} stroke={ink.axis} strokeWidth={1.5} />
    </Svg>
  );
}

/** Where on the face a tap is, as an angle: 0 at twelve o'clock, clockwise. */
export function clockAngle(size: number, x: number, y: number): number {
  return Math.atan2(x - size / 2, size / 2 - y);
}

export function ClockSvg({
  size,
  h,
  m,
  set,
  active,
}: {
  size: number;
  h: number;
  m: number;
  /** Faint hands at twelve until she has set one. */
  set: boolean;
  /** The hand a tap moves now — drawn on top and thicker. */
  active: 'hour' | 'minute';
}) {
  const { figure: ink, palette } = useTheme();
  const c = size / 2;
  const R = c - 4;
  const at = (turn: number, r: number) => ({
    x: c + Math.sin(turn * 2 * Math.PI) * r,
    y: c - Math.cos(turn * 2 * Math.PI) * r,
  });
  const hourTurn = ((h % 12) + m / 60) / 12;
  const minuteTurn = m / 60;
  const hourEnd = at(hourTurn, R * 0.5);
  const minuteEnd = at(minuteTurn, R * 0.78);
  const hour = { key: 'hour', end: hourEnd, width: active === 'hour' ? 8 : 6, color: ink.stroke };
  const minute = {
    key: 'minute',
    end: minuteEnd,
    width: active === 'minute' ? 5 : 3.5,
    color: ink.point,
  };
  // The hand a tap moves is drawn last, on top.
  const hands = active === 'hour' ? [minute, hour] : [hour, minute];
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={R} fill={ink.paper} stroke={ink.axis} strokeWidth={2} />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        const a = at(i / 60, R - 2);
        const b = at(i / 60, R - (big ? 12 : 6));
        return (
          <Line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={big ? ink.axis : ink.gridStrong}
            strokeWidth={big ? 2 : 1}
          />
        );
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const p = at((i + 1) / 12, R * 0.74);
        return (
          <SvgText
            key={i}
            fontFamily={FAMILY}
            x={p.x}
            y={p.y + 6}
            fontSize={Math.max(14, R * 0.15)}
            fontWeight="600"
            fill={palette.ink}
            textAnchor="middle"
          >
            {String(i + 1)}
          </SvgText>
        );
      })}
      <G opacity={set ? 1 : 0.35}>
        {hands.map((hand) => (
          <Line
            key={hand.key}
            x1={c}
            y1={c}
            x2={hand.end.x}
            y2={hand.end.y}
            stroke={hand.color}
            strokeWidth={hand.width}
            strokeLinecap="round"
          />
        ))}
      </G>
      <Circle cx={c} cy={c} r={6} fill={ink.stroke} />
    </Svg>
  );
}
