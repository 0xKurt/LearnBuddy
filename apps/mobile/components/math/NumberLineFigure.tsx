// A number line (FigureView, `number_line`): the axis with its arrow, ticks at every step and a
// number at every major one (`numberLineGeometry`), the marked points with their names above.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { numberLineGeometry } from '../../lib/math/figureGeometry.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, FONT, formatNumber } from './figureText.js';

type NumberLineFig = Extract<Figure, { type: 'number_line' }>;

export function NumberLineFigure({ fig, width }: { fig: NumberLineFig; width: number }) {
  const { figure: ink } = useTheme();
  const { lo, hi, pad, x, ticks, every, axisY, height: h } = numberLineGeometry(fig, width);
  return (
    <Svg width={width} height={h}>
      <Line x1={pad - 8} y1={axisY} x2={width - 6} y2={axisY} stroke={ink.axis} strokeWidth={1.5} />
      <Path
        d={`M ${width - 12} ${axisY - 5} L ${width - 4} ${axisY} L ${width - 12} ${axisY + 5}`}
        stroke={ink.axis}
        strokeWidth={1.5}
        fill="none"
      />
      {ticks.map((v, i) => {
        const major = i % every === 0;
        return (
          <G key={i}>
            <Line
              x1={x(v)}
              y1={axisY - (major ? 7 : 4)}
              x2={x(v)}
              y2={axisY + (major ? 7 : 4)}
              stroke={ink.axis}
              strokeWidth={major ? 1.5 : 1}
            />
            {major ? (
              <SvgText
                fontFamily={FAMILY}
                x={x(v)}
                y={axisY + 24}
                fontSize={FONT}
                fill={ink.label}
                textAnchor="middle"
              >
                {formatNumber(v)}
              </SvgText>
            ) : null}
          </G>
        );
      })}
      {fig.points
        .filter((p) => p.value >= lo && p.value <= hi)
        .map((p, i) => (
          <G key={i}>
            <Circle
              cx={x(p.value)}
              cy={axisY}
              r={5.5}
              fill={ink.point}
              stroke={ink.paper}
              strokeWidth={1.5}
            />
            {p.label ? (
              <SvgText
                fontFamily={FAMILY}
                x={x(p.value)}
                y={axisY - 14}
                // token-exempt: point names one step above the tick numbers, as in GeometryFigure
                fontSize={FONT + 1}
                fontWeight="600"
                fill={ink.point}
                textAnchor="middle"
              >
                {p.label}
              </SvgText>
            ) : null}
          </G>
        ))}
    </Svg>
  );
}
