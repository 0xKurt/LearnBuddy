// A bar chart (FigureView, `bar_chart`): columns, or rows when the names are long
// (`barChartGeometry` decides), each with its value written at its end and its name beside it.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { barChartGeometry } from '../../lib/math/figureGeometry.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, FONT, formatNumber } from './figureText.js';

type BarFig = Extract<Figure, { type: 'bar_chart' }>;

export function BarChartFigure({ fig, width }: { fig: BarFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  const unit = fig.unit ? ` ${fig.unit}` : '';
  const geo = barChartGeometry(fig, width);

  if (geo.horizontal) {
    const { rowH, labelW, X, height: h, maxChars } = geo;
    return (
      <Svg width={width} height={h}>
        {fig.bars.map((b, i) => {
          const y = 2 + i * rowH;
          const xa = X(Math.min(0, b.value));
          const xb = X(Math.max(0, b.value));
          return (
            <G key={i}>
              <SvgText
                fontFamily={FAMILY}
                x={labelW - 8}
                y={y + rowH / 2 + 4}
                fontSize={FONT}
                fill={palette.ink}
                textAnchor="end"
              >
                {b.label.length > maxChars ? `${b.label.slice(0, maxChars - 1)}…` : b.label}
              </SvgText>
              <Rect
                x={xa}
                y={y + 5}
                width={Math.max(1, xb - xa)}
                height={rowH - 10}
                rx={4}
                fill={ink.fill}
              />
              <SvgText
                fontFamily={FAMILY}
                x={xb + 6}
                y={y + rowH / 2 + 4}
                fontSize={FONT}
                fontWeight="600"
                fill={palette.ink}
              >
                {`${formatNumber(b.value)}${unit}`}
              </SvgText>
            </G>
          );
        })}
        <Line x1={X(0)} y1={0} x2={X(0)} y2={h} stroke={ink.axis} strokeWidth={1.5} />
      </Svg>
    );
  }

  const { height: h, Y, bw } = geo;
  return (
    <Svg width={width} height={h}>
      {fig.bars.map((b, i) => {
        const cx = geo.cx(i);
        const ya = Y(Math.max(0, b.value));
        const yb = Y(Math.min(0, b.value));
        return (
          <G key={i}>
            <Rect
              x={cx - bw / 2}
              y={ya}
              width={bw}
              height={Math.max(1, yb - ya)}
              rx={4}
              fill={ink.fill}
            />
            <SvgText
              fontFamily={FAMILY}
              x={cx}
              y={b.value >= 0 ? ya - 6 : yb + 14}
              fontSize={FONT}
              fontWeight="600"
              fill={palette.ink}
              textAnchor="middle"
            >
              {`${formatNumber(b.value)}${unit}`}
            </SvgText>
            <SvgText
              fontFamily={FAMILY}
              x={cx}
              y={h - 8}
              fontSize={FONT}
              fill={palette.ink2}
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
