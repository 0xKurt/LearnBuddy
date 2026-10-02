// A coordinate plane or squared paper she works on (issues #248, #249): grid, axes and numbers,
// what the task gives (points, a shape, coloured squares, a mirror line), and what she set.
// One drawing for both kinds and for the magnified view — the zoom is the same plane with a
// smaller window (`lib/math/gridFrame.ts`), so it never looks like a different figure.
//
// Colour is never the only signal: her points are larger and ringed, given points carry their
// names, the mirror line is dashed, her squares are filled AND framed. What is on the plane is
// also written in words under it (the readout) and read out as the figure's description.

import { Platform } from 'react-native';
import { useId } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import type { DrawBar, GridMark, MirrorLine } from '@learnbuddy/shared-types/contracts';

import { gridValue, type Pt } from '../../../../../packages/shared-math/src/grid.js';
import { labelEvery, toPx, type Frame } from '../../../lib/math/gridFrame.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { formatNumber } from '../../math/FigureView.js';

const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});
const SMALL = 11;

/**
 * Where a point's name goes: up and right of it, and for a closed shape away from its centre,
 * so "A" never sits on an edge or inside the shape (shot 64, round 2).
 */
function labelAt(
  p: { px: number; py: number },
  centre: { px: number; py: number } | null,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const dx = centre ? p.px - centre.px : 1;
  const dy = centre ? p.py - centre.py : -1;
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n;
  const uy = dy / n;
  const anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
  // `y` is the baseline: a name below the point needs its own height (~10 pt at 13 pt) more.
  const y = uy > 0.3 ? p.py + uy * 8 + 10 : uy < -0.3 ? p.py + uy * 8 - 1 : p.py + 4;
  return { x: p.px + ux * 9, y, anchor };
}

type Props = {
  frame: Frame;
  axes: boolean;
  /** Points the task shows, with their names. */
  marks?: readonly GridMark[];
  /** Join the marks to a closed shape. */
  closed?: boolean;
  givenCells?: readonly Pt[];
  mirror?: MirrorLine | null;
  /** Her squares. */
  cells?: readonly Pt[];
  /** Her points, in the order she set them. */
  points?: readonly Pt[];
  /** Draw the straight line through her first two points. */
  line?: boolean;
  /** Bars she pulls: one step wide each, from x = 0, at their height. */
  bars?: ReadonlyArray<DrawBar & { value: number }>;
};

export function PlaneSvg({
  frame: f,
  axes,
  marks = [],
  closed = false,
  givenCells = [],
  mirror = null,
  cells = [],
  points = [],
  line = false,
  bars,
}: Props) {
  const { palette, figure: ink } = useTheme();
  // Several figures can be on one page (a question and the magnified one): each clips itself.
  const clip = `plot${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { window: w, step } = f;
  const nx = Math.round((w.x1 - w.x0) / step);
  const ny = Math.round((w.y1 - w.y0) / step);
  const px = (x: number) => toPx(f, { x, y: 0 }).px;
  const py = (y: number) => toPx(f, { x: 0, y }).py;
  const left = f.left;
  const top = f.top;
  const right = f.left + f.plotW;
  const bottom = f.top + f.plotH;
  const everyX = labelEvery(f.sx);
  const everyY = labelEvery(f.sy);
  const xs = Array.from({ length: nx + 1 }, (_, i) => gridValue(w.x0, step, i));
  const ys = Array.from({ length: ny + 1 }, (_, i) => gridValue(w.y0, step, i));
  const labelledX = (v: number) => Math.round(v / step) % everyX === 0;
  const labelledY = (v: number) => Math.round(v / step) % everyY === 0;
  // The axes go through 0 where 0 is in the window, else along the edge.
  const ax = w.y0 <= 0 && w.y1 >= 0 ? py(0) : bottom;
  const ay = w.x0 <= 0 && w.x1 >= 0 ? px(0) : left;
  const showAxes = axes && !bars;
  const cellRect = (c: Pt, key: string, fill: string, stroke: string) => {
    const a = toPx(f, { x: c.x, y: c.y + step });
    return (
      <Rect
        key={key}
        x={a.px + 1}
        y={a.py + 1}
        width={f.sx - 2}
        height={f.sy - 2}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
      />
    );
  };
  const marked = marks.map((m) => toPx(f, m));
  const centre =
    marked.length > 0
      ? {
          px: marked.reduce((t, p) => t + p.px, 0) / marked.length,
          py: marked.reduce((t, p) => t + p.py, 0) / marked.length,
        }
      : null;
  // The line through her first two points, across the whole window.
  let through: { x1: number; y1: number; x2: number; y2: number } | null = null;
  const [a, b] = points;
  if (line && a && b) {
    if (a.x === b.x) {
      through = { x1: px(a.x), y1: top, x2: px(a.x), y2: bottom };
    } else {
      const m = (b.y - a.y) / (b.x - a.x);
      const yAt = (x: number) => a.y + m * (x - a.x);
      through = { x1: left, y1: py(yAt(w.x0)), x2: right, y2: py(yAt(w.x1)) };
    }
  }

  return (
    <Svg width={f.width} height={f.height}>
      <Defs>
        <ClipPath id={clip}>
          <Rect x={left - 9} y={top - 9} width={f.plotW + 18} height={f.plotH + 18} />
        </ClipPath>
        {/* The line ends at the grid's edge; points on the edge keep their whole circle. */}
        <ClipPath id={`${clip}l`}>
          <Rect x={left} y={top} width={f.plotW} height={f.plotH} />
        </ClipPath>
      </Defs>
      {/* Squares, under everything: given in the soft tint, hers filled and framed. */}
      {givenCells.map((c, i) => cellRect(c, `g${i}`, ink.fillSoft, ink.gridStrong))}
      {cells.map((c, i) => cellRect(c, `c${i}`, ink.fill, ink.point))}
      {xs.map((x, i) => (
        <Line
          key={`vx${i}`}
          x1={px(x)}
          y1={top}
          x2={px(x)}
          y2={bottom}
          stroke={ink.grid}
          strokeWidth={1}
        />
      ))}
      {ys.map((y, i) => (
        <Line
          key={`hy${i}`}
          x1={left}
          y1={py(y)}
          x2={right}
          y2={py(y)}
          stroke={ink.grid}
          strokeWidth={1}
        />
      ))}
      {showAxes ? (
        <G>
          <Line x1={left} y1={ax} x2={right + 6} y2={ax} stroke={ink.axis} strokeWidth={1.5} />
          <Path
            d={`M ${right + 1} ${ax - 4} L ${right + 7} ${ax} L ${right + 1} ${ax + 4}`}
            stroke={ink.axis}
            strokeWidth={1.5}
            fill="none"
          />
          <Line x1={ay} y1={bottom} x2={ay} y2={top - 6} stroke={ink.axis} strokeWidth={1.5} />
          <Path
            d={`M ${ay - 4} ${top - 1} L ${ay} ${top - 7} L ${ay + 4} ${top - 1}`}
            stroke={ink.axis}
            strokeWidth={1.5}
            fill="none"
          />
          {xs
            .filter((x) => x !== 0 && labelledX(x))
            .map((x) => (
              <SvgText
                key={`lx${x}`}
                fontFamily={FAMILY}
                x={px(x)}
                y={Math.min(ax + 15, f.height - 4)}
                fontSize={SMALL}
                fill={ink.label}
                textAnchor="middle"
              >
                {formatNumber(x)}
              </SvgText>
            ))}
          {ys
            .filter((y) => y !== 0 && labelledY(y))
            .map((y) => (
              <SvgText
                key={`ly${y}`}
                fontFamily={FAMILY}
                x={ay - 5}
                y={py(y) + 4}
                fontSize={SMALL}
                fill={ink.label}
                textAnchor="end"
              >
                {formatNumber(y)}
              </SvgText>
            ))}
          {w.x0 <= 0 && w.x1 >= 0 && w.y0 <= 0 && w.y1 >= 0 ? (
            <SvgText
              fontFamily={FAMILY}
              x={ay - 5}
              y={ax + 15}
              fontSize={SMALL}
              fill={ink.label}
              textAnchor="end"
            >
              0
            </SvgText>
          ) : null}
        </G>
      ) : null}
      {bars ? (
        <G>
          <Line x1={left} y1={bottom} x2={right} y2={bottom} stroke={ink.axis} strokeWidth={1.5} />
          <Line x1={left} y1={bottom} x2={left} y2={top - 4} stroke={ink.axis} strokeWidth={1.5} />
          {ys
            .filter((y) => labelledY(y))
            .map((y) => (
              <SvgText
                key={`by${y}`}
                fontFamily={FAMILY}
                x={left - 5}
                y={py(y) + 4}
                fontSize={SMALL}
                fill={ink.label}
                textAnchor="end"
              >
                {formatNumber(y)}
              </SvgText>
            ))}
          {bars.map((bar, i) => {
            const x0 = left + i * f.sx;
            const yTop = py(bar.value);
            const inset = Math.min(10, f.sx * 0.18);
            return (
              <G key={bar.id}>
                {bar.value > w.y0 ? (
                  <Rect
                    x={x0 + inset}
                    y={yTop}
                    width={f.sx - 2 * inset}
                    height={bottom - yTop}
                    rx={4}
                    fill={ink.fill}
                  />
                ) : null}
                {/* The grip: the top edge she pulls, visible even at height 0. */}
                <Rect
                  x={x0 + inset + 4}
                  y={yTop - 3}
                  width={f.sx - 2 * inset - 8}
                  height={6}
                  rx={3}
                  fill={ink.point}
                />
                <SvgText
                  fontFamily={FAMILY}
                  x={x0 + f.sx / 2}
                  y={bottom + 15}
                  fontSize={SMALL}
                  fill={palette.ink2}
                  textAnchor="middle"
                >
                  {bar.label}
                </SvgText>
              </G>
            );
          })}
        </G>
      ) : null}
      <G clipPath={`url(#${clip})`}>
        {mirror ? (
          mirror.direction === 'vertical' ? (
            <Line
              x1={px(mirror.at)}
              y1={top - 6}
              x2={px(mirror.at)}
              y2={bottom + 6}
              stroke={ink.series[1]}
              strokeWidth={2.5}
              strokeDasharray="7 5"
            />
          ) : (
            <Line
              x1={left - 6}
              y1={py(mirror.at)}
              x2={right + 6}
              y2={py(mirror.at)}
              stroke={ink.series[1]}
              strokeWidth={2.5}
              strokeDasharray="7 5"
            />
          )
        ) : null}
        {closed && marks.length >= 3 ? (
          <Polygon
            points={marks
              .map((m) => {
                const p = toPx(f, m);
                return `${p.px},${p.py}`;
              })
              .join(' ')}
            fill={ink.fillSoft}
            stroke={ink.stroke}
            strokeWidth={1.5}
          />
        ) : null}
        {through ? (
          <G clipPath={`url(#${clip}l)`}>
            <Line
              x1={through.x1}
              y1={through.y1}
              x2={through.x2}
              y2={through.y2}
              stroke={ink.point}
              strokeWidth={2.5}
            />
          </G>
        ) : null}
        {marks.map((m, i) => {
          const p = toPx(f, m);
          const at = labelAt(p, closed ? centre : null);
          return (
            <G key={`m${i}`}>
              <Circle cx={p.px} cy={p.py} r={4.5} fill={ink.stroke} />
              {m.label ? (
                <SvgText
                  fontFamily={FAMILY}
                  x={at.x}
                  y={at.y}
                  textAnchor={at.anchor}
                  fontSize={13}
                  fontWeight="700"
                  fill={ink.stroke}
                >
                  {m.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {/* Mirroring a closed shape: her points read as a shape too (dashed — it is hers, and
            the order she set them in is the order they are joined). */}
        {closed && points.length >= 3 ? (
          <Polygon
            points={points
              .map((pt) => {
                const p = toPx(f, pt);
                return `${p.px},${p.py}`;
              })
              .join(' ')}
            fill="none"
            stroke={ink.point}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        ) : null}
        {points.map((pt, i) => {
          const p = toPx(f, pt);
          return (
            <G key={`p${i}`}>
              <Circle cx={p.px} cy={p.py} r={9} fill={ink.fillSoft} />
              <Circle
                cx={p.px}
                cy={p.py}
                r={6}
                fill={ink.point}
                stroke={ink.paper}
                strokeWidth={2}
              />
            </G>
          );
        })}
      </G>
    </Svg>
  );
}
