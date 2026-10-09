// A fraction picture (FigureView, `fraction`): each fraction as a bar of equal parts or as a
// circle cut into slices, the filled parts in the figure's fill. `describeFigure` says it in words.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { useTheme } from '../../lib/theme/ThemeProvider.js';

type FractionFig = Extract<Figure, { type: 'fraction' }>;

export function FractionFigure({ fig, width }: { fig: FractionFig; width: number }) {
  const { figure: ink } = useTheme();
  const items = fig.fractions.map((f) => ({
    parts: Math.max(1, f.parts),
    filled: Math.min(Math.max(0, f.filled), Math.max(1, f.parts)),
  }));
  if (fig.shape === 'bar') {
    const barH = 40;
    const gap = 16;
    const h = items.length * barH + (items.length - 1) * gap + 4;
    const w = Math.min(width, 420);
    return (
      <Svg width={w} height={h}>
        {items.map((f, k) => {
          const y = 2 + k * (barH + gap);
          const seg = (w - 4) / f.parts;
          return (
            <G key={k}>
              {Array.from({ length: f.parts }, (_, i) => (
                <Rect
                  key={i}
                  x={2 + i * seg}
                  y={y}
                  width={seg}
                  height={barH}
                  fill={i < f.filled ? ink.fill : ink.empty}
                  stroke={ink.stroke}
                  strokeWidth={1.5}
                />
              ))}
            </G>
          );
        })}
      </Svg>
    );
  }
  const cell = width / items.length;
  // Drawn generously — the circles are what the question is about (issue #96); where the
  // screen is tight, FigureView scales the whole drawing down to its `maxHeight` anyway.
  const r = Math.min(cell * 0.45, 84);
  const h = 2 * r + 8;
  return (
    <Svg width={width} height={h}>
      {items.map((f, k) => {
        const cx = cell * k + cell / 2;
        const cy = h / 2;
        if (f.parts === 1) {
          return (
            <Circle
              key={k}
              cx={cx}
              cy={cy}
              r={r}
              fill={f.filled > 0 ? ink.fill : ink.empty}
              stroke={ink.stroke}
              strokeWidth={1.5}
            />
          );
        }
        return (
          <G key={k}>
            {Array.from({ length: f.parts }, (_, i) => {
              // Start at 12 o'clock and go clockwise, like in the schoolbook.
              const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / f.parts;
              const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / f.parts;
              const large = a1 - a0 > Math.PI ? 1 : 0;
              const d = `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
              return (
                <Path
                  key={i}
                  d={d}
                  fill={i < f.filled ? ink.fill : ink.empty}
                  stroke={ink.stroke}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              );
            })}
          </G>
        );
      })}
    </Svg>
  );
}
