// A function plot (FigureView, `function_plot`): the coordinate system (`PlotAxes`, laid out by
// `functionPlotGeometry` — the frame the tap layer reads too, #248), the graphs a function the
// grammar can read gives, the marked points, and a legend naming each formula. A function the
// grammar can't read is left out — the figure never crashes the question. `bare` (an answer
// option, issue #231) drops the legend and the origin's 0.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';

// Imported by path: the mobile bundle takes only this small, dependency-free module
// of @learnbuddy/shared-math (its index also pulls in mathjs).
import { compileExpression } from '../../../../packages/shared-math/src/expression.js';
import { functionPlotGeometry } from '../../lib/math/plotLayout.js';
import { prettyExpr, tracePath } from '../../lib/math/plotMath.js';
import { SPACE } from '../../lib/theme/space.js';
import { useSvgId } from '../../lib/theme/svgId.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { PlotAxes } from './PlotAxes.js';
import { formatNumber, HaloText, SMALL } from './figureText.js';

type PlotFig = Extract<Figure, { type: 'function_plot' }>;

const DASHES: ReadonlyArray<string | undefined> = [undefined, '8 5', '2 4'];

export function FunctionPlotFigure({
  fig,
  width,
  bare,
}: {
  fig: PlotFig;
  width: number;
  bare: boolean;
}) {
  const { palette, figure: ink } = useTheme();
  // The frame is the one the tap layer reads too (#248); the axes are `PlotAxes` (#249).
  const g = functionPlotGeometry(fig, width, {
    bare,
    format: formatNumber,
    fontSize: SMALL,
  });
  const { x0, x1, y0, y1, left, top, pw, ph, X, Y, height: h } = g;

  const graphs = useMemo(
    () =>
      fig.functions
        .map((f, i) => ({ ...f, i, fn: compileExpression(f.expr) }))
        .filter((fn) => fn.fn !== null)
        .map((fn) => ({
          ...fn,
          d: tracePath(fn.fn as (x: number) => number, x0, x1, y0, y1, X, Y, pw),
        })),
    // X and Y only depend on the ranges and size listed here.
    [fig.functions, x0, x1, y0, y1, pw, ph],
  );

  // One id per drawing: on the web `url(#…)` finds the FIRST element with that id in the
  // document, so with four option graphs and the viewer's large one on the same page a shared
  // id clipped the large curve to the first small graph's box — and it vanished (issue #231).
  const clipId = useSvgId('plotclip');
  return (
    <View style={{ gap: SPACE.sm }}>
      <Svg width={width} height={h}>
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={left} y={top} width={pw} height={ph} />
          </ClipPath>
        </Defs>
        {/* On a small option picture the origin's 0 would sit on the −2 below it (issue #231). */}
        <PlotAxes g={g} zero={!bare} />
        <G clipPath={`url(#${clipId})`}>
          {graphs.map((fn) => (
            <Path
              key={fn.i}
              d={fn.d}
              stroke={ink.series[fn.i % ink.series.length]}
              strokeWidth={2.5}
              strokeDasharray={DASHES[fn.i % DASHES.length]}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </G>
        {fig.points
          .filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
          .map((p, i) => (
            <G key={`p${i}`}>
              <Circle
                cx={X(p.x)}
                cy={Y(p.y)}
                r={4.5}
                fill={ink.point}
                stroke={ink.paper}
                strokeWidth={1.5}
              />
              {p.label ? (
                <HaloText
                  x={X(p.x) + (X(p.x) > left + pw - 40 ? -8 : 8)}
                  y={Y(p.y) - 8}
                  color={ink.point}
                  anchor={X(p.x) > left + pw - 40 ? 'end' : 'start'}
                  text={p.label}
                />
              ) : null}
            </G>
          ))}
      </Svg>
      {graphs.length > 0 && !bare ? (
        <View style={{ gap: SPACE.xs }}>
          {graphs.map((fn) => (
            <View key={fn.i} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Svg width={28} height={10}>
                <Line
                  x1={2}
                  y1={5}
                  x2={26}
                  y2={5}
                  stroke={ink.series[fn.i % ink.series.length]}
                  strokeWidth={2.5}
                  strokeDasharray={DASHES[fn.i % DASHES.length]}
                  strokeLinecap="round"
                />
              </Svg>
              <Text style={[TYPE.small, { color: palette.ink }]}>
                {fn.label ? `${fn.label}: ` : ''}y = {prettyExpr(fn.expr)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
