// The coordinate system itself — grid lines, the two axes with their arrows and names, tick marks
// and labels, the origin's 0 — laid out by `plotGeometry` (lib/math/plotLayout.ts). One drawing
// for the graph she READS (`FunctionPlotFigure.tsx`) and the grid she DRAWS on
// (`GridSheet.tsx`, issue #249): the same paper in both places, never a second renderer.
//
// It draws inside the caller's <Svg>; what stands on the paper (graphs, points, bars) is the
// caller's. `axes={false}` is squared paper: the grid lines alone, no numbers (mirroring, #249).

import { G, Line, Path, Text as SvgText } from 'react-native-svg';

import type { PlotGeometry } from '../../lib/math/plotLayout.js';
import { plotX, plotY } from '../../lib/math/plotLayout.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, FONT, HaloText, SMALL } from './figureText.js';

type Props = {
  g: PlotGeometry;
  /** Axes, names, ticks and labels; without them squared paper. */
  axes?: boolean;
  /** The axes' names x and y (a bar chart's axes have none). */
  names?: boolean;
  /** The origin may carry its 0 (not on a small option picture, issue #231). */
  zero?: boolean;
};

export function PlotAxes({ g, axes = true, names = true, zero = true }: Props) {
  const { figure: ink } = useTheme();
  const X = (v: number) => plotX(g, v);
  const Y = (v: number) => plotY(g, v);
  const { left, top, pw, ph, axisX, axisY } = g;
  return (
    <G>
      {g.xTicks.map((v) => (
        <Line
          key={`gx${v}`}
          x1={X(v)}
          y1={top}
          x2={X(v)}
          y2={top + ph}
          stroke={ink.grid}
          strokeWidth={1}
        />
      ))}
      {g.yTicks.map((v) => (
        <Line
          key={`gy${v}`}
          x1={left}
          y1={Y(v)}
          x2={left + pw}
          y2={Y(v)}
          stroke={ink.grid}
          strokeWidth={1}
        />
      ))}
      {axes ? (
        <G>
          <Line
            x1={left}
            y1={axisX}
            x2={left + pw + 6}
            y2={axisX}
            stroke={ink.axis}
            strokeWidth={1.5}
          />
          <Path
            d={`M ${left + pw} ${axisX - 4} L ${left + pw + 7} ${axisX} L ${left + pw} ${axisX + 4}`}
            stroke={ink.axis}
            strokeWidth={1.5}
            fill="none"
          />
          <Line
            x1={axisY}
            y1={top + ph}
            x2={axisY}
            y2={top - 6}
            stroke={ink.axis}
            strokeWidth={1.5}
          />
          <Path
            d={`M ${axisY - 4} ${top} L ${axisY} ${top - 7} L ${axisY + 4} ${top}`}
            stroke={ink.axis}
            strokeWidth={1.5}
            fill="none"
          />
          {names ? (
            <G>
              <SvgText
                fontFamily={FAMILY}
                x={left + pw - 2}
                y={axisX - 8}
                fontSize={FONT}
                fontStyle="italic"
                fill={ink.label}
                textAnchor="end"
              >
                x
              </SvgText>
              <SvgText
                fontFamily={FAMILY}
                x={axisY + 8}
                y={top + 6}
                fontSize={FONT}
                fontStyle="italic"
                fill={ink.label}
              >
                y
              </SvgText>
            </G>
          ) : null}
          {g.xLabels.map((l) => (
            <G key={`tx${l.v}`}>
              <Line
                x1={l.x}
                y1={axisX - 3}
                x2={l.x}
                y2={axisX + 3}
                stroke={ink.axis}
                strokeWidth={1}
              />
              <HaloText {...l} size={SMALL} weight="400" color={ink.label} anchor="middle" />
            </G>
          ))}
          {g.yMarks.map((v) => (
            <Line
              key={`ty${v}`}
              x1={axisY - 3}
              y1={Y(v)}
              x2={axisY + 3}
              y2={Y(v)}
              stroke={ink.axis}
              strokeWidth={1}
            />
          ))}
          {g.yLabels.map((l) => (
            <HaloText
              key={`yl${l.v}`}
              {...l}
              size={SMALL}
              weight="400"
              color={ink.label}
              anchor="end"
            />
          ))}
          {zero && g.origin ? (
            <SvgText
              fontFamily={FAMILY}
              x={axisY - 6}
              y={axisX + 15}
              fontSize={SMALL}
              fill={ink.label}
              textAnchor="end"
            >
              0
            </SvgText>
          ) : null}
        </G>
      ) : null}
    </G>
  );
}
