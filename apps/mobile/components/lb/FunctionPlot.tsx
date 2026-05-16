// FunctionPlot — simple SVG-based plotter for stimulus.function_plot data.
// Doc 07 §3.5. Implementation uses react-native-svg (already a dep) to keep
// the bundle lean and avoid victory-native's Skia coupling.

import { evaluate } from 'mathjs';
import { useMemo } from 'react';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { LB } from '../../lib/theme/colors.js';

type Axis = { min: number; max: number; tick_step?: number; label?: string };
type Series =
  | { kind: 'line'; expression: string; color?: string; label?: string }
  | {
      kind: 'points';
      points: Array<[number, number]>;
      color?: string;
      label?: string;
    };

type Props = {
  width?: number;
  height?: number;
  x: Axis;
  y: Axis;
  series: Series[];
  grid?: boolean;
  highlights?: Array<{ x: number; y: number; label?: string }>;
};

const PADDING = 32;
const COLORS = [LB.primary, LB.success, LB.warning, LB.primaryDk];

export function FunctionPlot({
  width = 320,
  height = 220,
  x,
  y,
  series,
  grid = true,
  highlights = [],
}: Props) {
  const W = width - PADDING * 2;
  const H = height - PADDING * 2;
  const toPx = (px: number, py: number): [number, number] => {
    const sx = ((px - x.min) / (x.max - x.min)) * W + PADDING;
    const sy = height - PADDING - ((py - y.min) / (y.max - y.min)) * H;
    return [sx, sy];
  };

  const paths = useMemo(() => {
    return series.map((s, idx) => {
      const color = s.color ?? COLORS[idx % COLORS.length] ?? LB.primary;
      if (s.kind === 'line') {
        const samples = 64;
        const pts: Array<[number, number]> = [];
        for (let i = 0; i <= samples; i++) {
          const xv = x.min + ((x.max - x.min) * i) / samples;
          let yv: number;
          try {
            const v = evaluate(s.expression, { x: xv });
            yv = typeof v === 'number' ? v : Number.NaN;
          } catch {
            yv = Number.NaN;
          }
          if (Number.isFinite(yv) && yv >= y.min && yv <= y.max) pts.push([xv, yv]);
        }
        const d = pts
          .map(([px, py], i) => {
            const [sx, sy] = toPx(px, py);
            return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)} ${sy.toFixed(1)}`;
          })
          .join(' ');
        return { kind: 'path' as const, d, color };
      }
      return {
        kind: 'points' as const,
        color,
        points: s.points.map((p) => toPx(p[0], p[1])),
      };
    });
  }, [series, x.min, x.max, y.min, y.max]);

  const xTicks = useMemo(() => {
    const step = x.tick_step ?? (x.max - x.min) / 5;
    const out: number[] = [];
    for (let v = x.min; v <= x.max + 1e-9; v += step) out.push(Number(v.toFixed(4)));
    return out;
  }, [x.min, x.max, x.tick_step]);

  const yTicks = useMemo(() => {
    const step = y.tick_step ?? (y.max - y.min) / 5;
    const out: number[] = [];
    for (let v = y.min; v <= y.max + 1e-9; v += step) out.push(Number(v.toFixed(4)));
    return out;
  }, [y.min, y.max, y.tick_step]);

  return (
    <Svg width={width} height={height}>
      {grid && (
        <G>
          {xTicks.map((t) => {
            const [px] = toPx(t, y.min);
            return (
              <Line
                key={`gx-${t}`}
                x1={px}
                y1={PADDING}
                x2={px}
                y2={height - PADDING}
                stroke={LB.hairline}
                strokeWidth={1}
              />
            );
          })}
          {yTicks.map((t) => {
            const [, py] = toPx(x.min, t);
            return (
              <Line
                key={`gy-${t}`}
                x1={PADDING}
                y1={py}
                x2={width - PADDING}
                y2={py}
                stroke={LB.hairline}
                strokeWidth={1}
              />
            );
          })}
        </G>
      )}

      {/* Axes */}
      <Line
        x1={PADDING}
        y1={height - PADDING}
        x2={width - PADDING}
        y2={height - PADDING}
        stroke={LB.ink2}
        strokeWidth={1.4}
      />
      <Line
        x1={PADDING}
        y1={PADDING}
        x2={PADDING}
        y2={height - PADDING}
        stroke={LB.ink2}
        strokeWidth={1.4}
      />

      {/* Tick labels */}
      {xTicks.map((t) => {
        const [px] = toPx(t, y.min);
        return (
          <SvgText
            key={`xl-${t}`}
            x={px}
            y={height - PADDING + 14}
            fontSize={9}
            fill={LB.ink3}
            textAnchor="middle"
          >
            {String(t)}
          </SvgText>
        );
      })}
      {yTicks.map((t) => {
        const [, py] = toPx(x.min, t);
        return (
          <SvgText
            key={`yl-${t}`}
            x={PADDING - 6}
            y={py + 3}
            fontSize={9}
            fill={LB.ink3}
            textAnchor="end"
          >
            {String(t)}
          </SvgText>
        );
      })}

      {/* Series */}
      {paths.map((p, idx) => {
        if (p.kind === 'path') {
          return <Path key={`s-${idx}`} d={p.d} fill="none" stroke={p.color} strokeWidth={2} />;
        }
        return (
          <G key={`s-${idx}`}>
            {p.points.map(([sx, sy], i) => (
              <Circle key={i} cx={sx} cy={sy} r={3.5} fill={p.color} />
            ))}
          </G>
        );
      })}

      {/* Highlights */}
      {highlights.map((h, i) => {
        const [sx, sy] = toPx(h.x, h.y);
        return (
          <G key={`h-${i}`}>
            <Circle cx={sx} cy={sy} r={5} fill={LB.danger} />
            {h.label && (
              <SvgText x={sx + 8} y={sy + 4} fontSize={10} fill={LB.ink} fontWeight="600">
                {h.label}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}
