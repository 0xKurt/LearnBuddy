// Draws the figure that goes with a question (packages/shared-types/src/contracts/figure.ts):
// fraction pictures, number lines, function graphs, bar charts, geometry
// drawings and tables. The model only sends data; this draws it with
// react-native-svg at the width that is available. Every figure also carries a
// text description for screen readers. A function the grammar can't read is
// left out — the figure never crashes the question.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
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

// Imported by path: the mobile bundle takes only this small, dependency-free module
// of @learnbuddy/shared-math (its index also pulls in mathjs).
import { compileExpression } from '../../../../packages/shared-math/src/expression.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { speakMathText } from '../../lib/math/speak.js';
import { localDecimal } from '../../lib/numbers.js';
import { FIGURE, LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { MathText } from './MathText.js';
import { useSpokenWords } from './useSpokenMath.js';

type FractionFig = Extract<Figure, { type: 'fraction' }>;
type NumberLineFig = Extract<Figure, { type: 'number_line' }>;
type PlotFig = Extract<Figure, { type: 'function_plot' }>;
type BarFig = Extract<Figure, { type: 'bar_chart' }>;
type GeometryFig = Extract<Figure, { type: 'geometry' }>;
type TableFig = Extract<Figure, { type: 'table' }>;

type T = (key: string, values?: Record<string, string | number>) => string;
/** Reads a cell text with math out in words. */
type Speak = (text: string) => string;

const FONT = 13;
/** The app's sans-serif inside SVG too (the web would fall back to a serif). */
const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});
const SMALL = 12;

/** 0.30000000000000004 → "0,3" (decimal comma where usual). */
export function formatNumber(n: number): string {
  const rounded = Math.round(n * 1e6) / 1e6;
  const plain = Object.is(rounded, -0) ? '0' : String(rounded);
  return localDecimal(plain, currentLocale()).replace('-', '−');
}

/**
 * `maxHeight` keeps a drawing from pushing the answer off a small screen: a figure
 * that comes out taller is drawn again, narrower (its height follows its width).
 */
export function FigureView({ figure, maxHeight }: { figure: Figure; maxHeight?: number }) {
  const { t } = useTranslation('math');
  const [width, setWidth] = useState(0);
  const [scale, setScale] = useState(1);
  const words = useSpokenWords();
  const description = useMemo(
    () => describeFigure(figure, t, (s) => speakMathText(s, words)),
    [figure, t, words],
  );

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${t('figure.label')}: ${description}`}
      onLayout={(e) => {
        const w = Math.floor(e.nativeEvent.layout.width);
        if (w > 0 && Math.abs(w - width) > 1) {
          setWidth(w);
          setScale(1);
        }
      }}
      style={{
        alignSelf: 'stretch',
        backgroundColor: FIGURE.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: LB.hairline,
        padding: 12,
        minHeight: 60,
      }}
    >
      {width > 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ alignItems: 'center' }}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            // Measured at full width once; a smaller scale is final (no ping-pong).
            if (maxHeight && scale === 1 && h > maxHeight + 2)
              setScale(Math.max(0.4, maxHeight / h));
          }}
        >
          <FigureBody figure={figure} width={Math.floor((width - 26) * scale)} />
        </View>
      ) : null}
    </View>
  );
}

function FigureBody({ figure, width }: { figure: Figure; width: number }) {
  switch (figure.type) {
    case 'fraction':
      return <FractionPicture fig={figure} width={width} />;
    case 'number_line':
      return <NumberLine fig={figure} width={width} />;
    case 'function_plot':
      return <FunctionPlot fig={figure} width={width} />;
    case 'bar_chart':
      return <BarChart fig={figure} width={width} />;
    case 'geometry':
      return <Geometry fig={figure} width={width} />;
    case 'table':
      return <Table fig={figure} />;
  }
}

// ─────────────── fractions ───────────────

function FractionPicture({ fig, width }: { fig: FractionFig; width: number }) {
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
                  fill={i < f.filled ? FIGURE.fill : FIGURE.empty}
                  stroke={FIGURE.stroke}
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
  const r = Math.min(cell * 0.4, 72);
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
              fill={f.filled > 0 ? FIGURE.fill : FIGURE.empty}
              stroke={FIGURE.stroke}
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
                  fill={i < f.filled ? FIGURE.fill : FIGURE.empty}
                  stroke={FIGURE.stroke}
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

// ─────────────── number line ───────────────

function NumberLine({ fig, width }: { fig: NumberLineFig; width: number }) {
  const lo = Math.min(fig.min, fig.max);
  const hi = Math.max(fig.min, fig.max);
  const span = hi - lo || 1;
  const pad = 18;
  const x = (v: number) => pad + ((v - lo) / span) * (width - 2 * pad - 10);
  const count = Math.floor(span / fig.step + 1e-9);
  const ticks = count <= 200 ? Array.from({ length: count + 1 }, (_, i) => lo + i * fig.step) : [];
  const every = Math.max(1, Math.ceil(ticks.length / Math.max(2, Math.floor(width / 44))));
  const hasLabels = fig.points.some((p) => p.label);
  const axisY = hasLabels ? 46 : 26;
  const h = axisY + 34;
  return (
    <Svg width={width} height={h}>
      <Line
        x1={pad - 8}
        y1={axisY}
        x2={width - 6}
        y2={axisY}
        stroke={FIGURE.axis}
        strokeWidth={1.5}
      />
      <Path
        d={`M ${width - 12} ${axisY - 5} L ${width - 4} ${axisY} L ${width - 12} ${axisY + 5}`}
        stroke={FIGURE.axis}
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
              stroke={FIGURE.axis}
              strokeWidth={major ? 1.5 : 1}
            />
            {major ? (
              <SvgText
                fontFamily={FAMILY}
                x={x(v)}
                y={axisY + 24}
                fontSize={FONT}
                fill={FIGURE.label}
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
              fill={FIGURE.point}
              stroke={FIGURE.paper}
              strokeWidth={1.5}
            />
            {p.label ? (
              <SvgText
                fontFamily={FAMILY}
                x={x(p.value)}
                y={axisY - 14}
                fontSize={FONT + 1}
                fontWeight="600"
                fill={FIGURE.point}
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

// ─────────────── function plot ───────────────

/** A step of 1, 2 or 5 × 10^k that gives about `target` intervals. */
function niceStep(span: number, target: number): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function ticksFor(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let v = start; v <= hi + 1e-9 && out.length < 60; v += step)
    out.push(Math.round(v / step) * step);
  return out;
}

const DASHES: ReadonlyArray<string | undefined> = [undefined, '8 5', '2 4'];

function FunctionPlot({ fig, width }: { fig: PlotFig; width: number }) {
  const x0 = Math.min(fig.x_min, fig.x_max);
  const x1 = Math.max(fig.x_min, fig.x_max);
  const y0 = Math.min(fig.y_min, fig.y_max);
  const y1 = Math.max(fig.y_min, fig.y_max);
  const xs = x1 - x0 || 1;
  const ys = y1 - y0 || 1;
  const h = Math.round(Math.min(Math.max(width * 0.8, 220), 380));
  const left = 8;
  const right = 12;
  const top = 12;
  const bottom = 8;
  const pw = width - left - right;
  const ph = h - top - bottom;
  const X = (v: number) => left + ((v - x0) / xs) * pw;
  const Y = (v: number) => top + (1 - (v - y0) / ys) * ph;

  const xStep = niceStep(xs, Math.max(4, Math.min(10, Math.floor(pw / 40))));
  const yStep = niceStep(ys, Math.max(4, Math.min(10, Math.floor(ph / 32))));
  const xTicks = ticksFor(x0, x1, xStep);
  const yTicks = ticksFor(y0, y1, yStep);
  // Axes through 0 when 0 is in range, else along the edge.
  const axisX = Y(y0 <= 0 && y1 >= 0 ? 0 : y0);
  const axisY = X(x0 <= 0 && x1 >= 0 ? 0 : x0);

  const graphs = useMemo(
    () =>
      fig.functions
        .map((f, i) => ({ ...f, i, fn: compileExpression(f.expr) }))
        .filter((g) => g.fn !== null)
        .map((g) => ({
          ...g,
          d: tracePath(g.fn as (x: number) => number, x0, x1, y0, y1, X, Y, pw),
        })),
    // X and Y only depend on the ranges and size listed here.
    [fig.functions, x0, x1, y0, y1, pw, ph],
  );

  const clipId = 'plot-clip';
  return (
    <View style={{ gap: 8 }}>
      <Svg width={width} height={h}>
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={left} y={top} width={pw} height={ph} />
          </ClipPath>
        </Defs>
        {xTicks.map((v) => (
          <Line
            key={`gx${v}`}
            x1={X(v)}
            y1={top}
            x2={X(v)}
            y2={top + ph}
            stroke={FIGURE.grid}
            strokeWidth={1}
          />
        ))}
        {yTicks.map((v) => (
          <Line
            key={`gy${v}`}
            x1={left}
            y1={Y(v)}
            x2={left + pw}
            y2={Y(v)}
            stroke={FIGURE.grid}
            strokeWidth={1}
          />
        ))}
        {/* axes with arrows */}
        <Line
          x1={left}
          y1={axisX}
          x2={left + pw + 6}
          y2={axisX}
          stroke={FIGURE.axis}
          strokeWidth={1.5}
        />
        <Path
          d={`M ${left + pw} ${axisX - 4} L ${left + pw + 7} ${axisX} L ${left + pw} ${axisX + 4}`}
          stroke={FIGURE.axis}
          strokeWidth={1.5}
          fill="none"
        />
        <Line
          x1={axisY}
          y1={top + ph}
          x2={axisY}
          y2={top - 6}
          stroke={FIGURE.axis}
          strokeWidth={1.5}
        />
        <Path
          d={`M ${axisY - 4} ${top} L ${axisY} ${top - 7} L ${axisY + 4} ${top}`}
          stroke={FIGURE.axis}
          strokeWidth={1.5}
          fill="none"
        />
        <SvgText
          fontFamily={FAMILY}
          x={left + pw - 2}
          y={axisX - 8}
          fontSize={FONT}
          fontStyle="italic"
          fill={FIGURE.label}
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
          fill={FIGURE.label}
        >
          y
        </SvgText>
        {xTicks
          .filter((v) => Math.abs(v) > xStep / 2 || axisY !== X(0))
          .map((v) => (
            <G key={`tx${v}`}>
              <Line
                x1={X(v)}
                y1={axisX - 3}
                x2={X(v)}
                y2={axisX + 3}
                stroke={FIGURE.axis}
                strokeWidth={1}
              />
              <HaloText
                x={X(v)}
                y={Math.min(axisX + 15, top + ph - 2)}
                size={SMALL}
                weight="400"
                color={FIGURE.label}
                anchor="middle"
                text={formatNumber(v)}
              />
            </G>
          ))}
        {yTicks
          .filter((v) => Math.abs(v) > yStep / 2 || axisX !== Y(0))
          .map((v) => (
            <G key={`ty${v}`}>
              <Line
                x1={axisY - 3}
                y1={Y(v)}
                x2={axisY + 3}
                y2={Y(v)}
                stroke={FIGURE.axis}
                strokeWidth={1}
              />
              <HaloText
                x={axisY - 6}
                y={Y(v) + 4}
                size={SMALL}
                weight="400"
                color={FIGURE.label}
                anchor="end"
                text={formatNumber(v)}
              />
            </G>
          ))}
        {x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0 ? (
          <SvgText
            fontFamily={FAMILY}
            x={axisY - 6}
            y={axisX + 15}
            fontSize={SMALL}
            fill={FIGURE.label}
            textAnchor="end"
          >
            0
          </SvgText>
        ) : null}
        <G clipPath={`url(#${clipId})`}>
          {graphs.map((g) => (
            <Path
              key={g.i}
              d={g.d}
              stroke={FIGURE.series[g.i % FIGURE.series.length]}
              strokeWidth={2.5}
              strokeDasharray={DASHES[g.i % DASHES.length]}
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
                fill={FIGURE.point}
                stroke={FIGURE.paper}
                strokeWidth={1.5}
              />
              {p.label ? (
                <HaloText
                  x={X(p.x) + (X(p.x) > left + pw - 40 ? -8 : 8)}
                  y={Y(p.y) - 8}
                  color={FIGURE.point}
                  anchor={X(p.x) > left + pw - 40 ? 'end' : 'start'}
                  text={p.label}
                />
              ) : null}
            </G>
          ))}
      </Svg>
      {graphs.length > 0 ? (
        <View style={{ gap: 4 }}>
          {graphs.map((g) => (
            <View key={g.i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Svg width={28} height={10}>
                <Line
                  x1={2}
                  y1={5}
                  x2={26}
                  y2={5}
                  stroke={FIGURE.series[g.i % FIGURE.series.length]}
                  strokeWidth={2.5}
                  strokeDasharray={DASHES[g.i % DASHES.length]}
                  strokeLinecap="round"
                />
              </Svg>
              <Text style={[TYPE.small, { color: LB.ink }]}>
                {g.label ? `${g.label}: ` : ''}y = {prettyExpr(g.expr)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A label with a paper-coloured outline underneath, so it stays readable over grid and graphs. */
function HaloText({
  x,
  y,
  color,
  anchor,
  text,
  size = FONT + 1,
  weight = '600',
}: {
  x: number;
  y: number;
  color: string;
  anchor: 'start' | 'middle' | 'end';
  text: string;
  size?: number;
  weight?: '400' | '600';
}) {
  return (
    <G>
      <SvgText
        fontFamily={FAMILY}
        x={x}
        y={y}
        fontSize={size}
        fontWeight={weight}
        fill={FIGURE.paper}
        stroke={FIGURE.paper}
        strokeWidth={4}
        strokeLinejoin="round"
        textAnchor={anchor}
      >
        {text}
      </SvgText>
      <SvgText
        fontFamily={FAMILY}
        x={x}
        y={y}
        fontSize={size}
        fontWeight={weight}
        fill={color}
        textAnchor={anchor}
      >
        {text}
      </SvgText>
    </G>
  );
}

/** "x^2 - 2*x" → "x² − 2·x" for the legend. */
export function prettyExpr(expr: string): string {
  const sup: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  return expr
    .replace(/^\s*(?:y|[a-z]\s*\(\s*x\s*\))\s*=\s*/i, '')
    .replace(/\^(\d+)/g, (_, d: string) =>
      d
        .split('')
        .map((c) => sup[c] ?? c)
        .join(''),
    )
    .replace(/\*/g, '·')
    .replace(/-/g, '−')
    .replace(/sqrt/g, '√')
    .replace(/\bpi\b/g, 'π')
    .replace(/\s*([+−=])\s*/g, ' $1 ')
    .replace(/^ − /, '−')
    .replace(/\(\s*−\s*/g, '(−')
    .trim();
}

/** Samples f across the plot; lifts the pen at gaps (NaN, ±∞) and jumps (asymptotes). */
function tracePath(
  f: (x: number) => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  X: (v: number) => number,
  Y: (v: number) => number,
  pw: number,
): string {
  const n = Math.max(120, Math.min(800, Math.round(pw * 2)));
  const ys = y1 - y0;
  const lo = y0 - ys * 2;
  const hi = y1 + ys * 2;
  let d = '';
  let pen = false;
  let prev: number | null = null;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    let y: number;
    try {
      y = f(x);
    } catch {
      y = NaN;
    }
    if (!Number.isFinite(y)) {
      pen = false;
      prev = null;
      continue;
    }
    // A jump across most of the view between two samples is a pole, not a line.
    if (prev !== null && Math.abs(y - prev) > ys * 1.5 && (prev - y0) * (y - y0) !== 0) {
      const crosses = (prev > y1 && y < y0) || (prev < y0 && y > y1);
      if (crosses) pen = false;
    }
    prev = y;
    const yc = Math.min(hi, Math.max(lo, y));
    const cmd = pen ? 'L' : 'M';
    d += `${cmd} ${X(x).toFixed(1)} ${Y(yc).toFixed(1)} `;
    pen = true;
  }
  return d.trim();
}

// ─────────────── bar chart ───────────────

function BarChart({ fig, width }: { fig: BarFig; width: number }) {
  const unit = fig.unit ? ` ${fig.unit}` : '';
  const values = fig.bars.map((b) => b.value);
  const vmin = Math.min(0, ...values);
  const vmax = Math.max(0, ...values);
  const span = vmax - vmin || 1;
  const longest = Math.max(...fig.bars.map((b) => b.label.length));
  const horizontal = fig.bars.length > 6 || longest * 7 > width / fig.bars.length - 6;

  if (horizontal) {
    const rowH = 30;
    const labelW = Math.min(width * 0.38, longest * 7.2 + 8);
    const valueW = 64;
    const pw = width - labelW - valueW;
    const X = (v: number) => labelW + ((v - vmin) / span) * pw;
    const h = fig.bars.length * rowH + 4;
    const maxChars = Math.max(4, Math.floor((labelW - 8) / 7.2));
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
                fill={LB.ink}
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
                fill={FIGURE.fill}
              />
              <SvgText
                fontFamily={FAMILY}
                x={xb + 6}
                y={y + rowH / 2 + 4}
                fontSize={FONT}
                fontWeight="600"
                fill={LB.ink}
              >
                {`${formatNumber(b.value)}${unit}`}
              </SvgText>
            </G>
          );
        })}
        <Line x1={X(0)} y1={0} x2={X(0)} y2={h} stroke={FIGURE.axis} strokeWidth={1.5} />
      </Svg>
    );
  }

  const top = 22;
  const bottom = 26;
  const h = 220;
  const ph = h - top - bottom;
  const Y = (v: number) => top + (1 - (v - vmin) / span) * ph;
  const slot = width / fig.bars.length;
  const bw = Math.min(56, slot * 0.62);
  return (
    <Svg width={width} height={h}>
      {fig.bars.map((b, i) => {
        const cx = slot * i + slot / 2;
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
              fill={FIGURE.fill}
            />
            <SvgText
              fontFamily={FAMILY}
              x={cx}
              y={b.value >= 0 ? ya - 6 : yb + 14}
              fontSize={FONT}
              fontWeight="600"
              fill={LB.ink}
              textAnchor="middle"
            >
              {`${formatNumber(b.value)}${unit}`}
            </SvgText>
            <SvgText
              fontFamily={FAMILY}
              x={cx}
              y={h - 8}
              fontSize={FONT}
              fill={LB.ink2}
              textAnchor="middle"
            >
              {b.label}
            </SvgText>
          </G>
        );
      })}
      <Line x1={0} y1={Y(0)} x2={width} y2={Y(0)} stroke={FIGURE.axis} strokeWidth={1.5} />
    </Svg>
  );
}

// ─────────────── geometry ───────────────

function Geometry({ fig, width }: { fig: GeometryFig; width: number }) {
  const byName = new Map(fig.points.map((p) => [p.name, p]));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const p of fig.points) extend(p.x, p.y);
  for (const c of fig.circles) {
    const p = byName.get(c.center);
    if (!p) continue;
    extend(p.x - c.radius, p.y - c.radius);
    extend(p.x + c.radius, p.y + c.radius);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const margin = 24;
  const maxH = Math.min(340, width);
  const scale = Math.min((width - 2 * margin) / spanX, (maxH - 2 * margin) / spanY);
  const h = Math.round(spanY * scale + 2 * margin);
  const offX = (width - spanX * scale) / 2;
  const X = (x: number) => offX + (x - minX) * scale;
  const Y = (y: number) => margin + (maxY - y) * scale;
  const cx = fig.points.reduce((s, p) => s + p.x, 0) / fig.points.length;
  const cy = fig.points.reduce((s, p) => s + p.y, 0) / fig.points.length;

  const nodes: ReactNode[] = [];
  fig.polygons.forEach((poly, i) => {
    const pts = poly.map((n) => byName.get(n)).filter((p) => p !== undefined);
    if (pts.length < 3) return;
    nodes.push(
      <Polygon
        key={`poly${i}`}
        points={pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}
        fill={FIGURE.fillSoft}
        stroke={FIGURE.stroke}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />,
    );
  });
  fig.circles.forEach((c, i) => {
    const p = byName.get(c.center);
    if (!p) return;
    nodes.push(
      <Circle
        key={`c${i}`}
        cx={X(p.x)}
        cy={Y(p.y)}
        r={c.radius * scale}
        fill="none"
        stroke={FIGURE.stroke}
        strokeWidth={1.75}
      />,
    );
  });
  fig.segments.forEach((seg, i) => {
    const p = byName.get(seg.from);
    const q = byName.get(seg.to);
    if (!p || !q) return;
    nodes.push(
      <Line
        key={`s${i}`}
        x1={X(p.x)}
        y1={Y(p.y)}
        x2={X(q.x)}
        y2={Y(q.y)}
        stroke={FIGURE.stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
      />,
    );
  });

  return (
    <Svg width={width} height={h}>
      {nodes}
      {fig.points.map((p) => {
        // Name away from the middle of the drawing so it doesn't sit on a line.
        let dx = p.x - cx;
        let dy = p.y - cy;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) {
          dx = 0;
          dy = 1;
        } else {
          dx /= len;
          dy /= len;
        }
        const lx = X(p.x) + dx * 14;
        const ly = Y(p.y) - dy * 14 + 5;
        return (
          <G key={p.name}>
            <Circle cx={X(p.x)} cy={Y(p.y)} r={3.5} fill={FIGURE.stroke} />
            <HaloText x={lx} y={ly} size={FONT + 2} color={LB.ink} anchor="middle" text={p.name} />
          </G>
        );
      })}
    </Svg>
  );
}

// ─────────────── table ───────────────

function Table({ fig }: { fig: TableFig }) {
  const cols = Math.max(fig.header.length, ...fig.rows.map((r) => r.length));
  const cell = (text: string, key: number, header: boolean, last: boolean) => (
    <View
      key={key}
      style={{
        flex: 1,
        minWidth: 0,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRightWidth: last ? 0 : 1,
        borderColor: FIGURE.gridStrong,
        justifyContent: 'center',
      }}
    >
      <MathText
        accessible={false}
        text={text}
        style={[TYPE.body, { fontSize: 15, lineHeight: 20, fontWeight: header ? '700' : '400' }]}
      />
    </View>
  );
  const row = (cells: string[], header: boolean, key: string) => (
    <View
      key={key}
      style={{
        flexDirection: 'row',
        backgroundColor: header ? LB.lavender : FIGURE.paper,
        borderTopWidth: header ? 0 : 1,
        borderColor: FIGURE.gridStrong,
      }}
    >
      {Array.from({ length: cols }, (_, i) => cell(cells[i] ?? '', i, header, i === cols - 1))}
    </View>
  );
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: FIGURE.gridStrong,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {row(fig.header, true, 'h')}
      {fig.rows.map((r, i) => row(r, false, `r${i}`))}
    </View>
  );
}

// ─────────────── description for screen readers ───────────────

export function describeFigure(figure: Figure, t: T, speak: Speak = (s) => s): string {
  const list = (items: string[]) => items.join(', ');
  switch (figure.type) {
    case 'fraction':
      return figure.fractions
        .map((f) =>
          t(figure.shape === 'circle' ? 'figure.fraction_circle' : 'figure.fraction_bar', {
            parts: f.parts,
            filled: Math.min(f.filled, f.parts),
          }),
        )
        .join('. ');
    case 'number_line': {
      const base = t('figure.number_line', {
        min: formatNumber(figure.min),
        max: formatNumber(figure.max),
        step: formatNumber(figure.step),
      });
      if (figure.points.length === 0) return base;
      const pts = figure.points.map((p) =>
        p.label ? `${p.label} (${formatNumber(p.value)})` : formatNumber(p.value),
      );
      return `${base}. ${t('figure.marked', { list: list(pts) })}`;
    }
    case 'function_plot': {
      const parts = [
        t('figure.function_plot', {
          x_min: formatNumber(figure.x_min),
          x_max: formatNumber(figure.x_max),
          y_min: formatNumber(figure.y_min),
          y_max: formatNumber(figure.y_max),
        }),
      ];
      for (const f of figure.functions) {
        if (!compileExpression(f.expr)) continue;
        const expr = prettyExpr(f.expr);
        parts.push(
          f.label ? t('figure.graph_named', { label: f.label, expr }) : t('figure.graph', { expr }),
        );
      }
      if (figure.points.length > 0) {
        const pts = figure.points.map(
          (p) => `${p.label ? `${p.label} ` : ''}(${formatNumber(p.x)} | ${formatNumber(p.y)})`,
        );
        parts.push(t('figure.points', { list: list(pts) }));
      }
      return parts.join('. ');
    }
    case 'bar_chart': {
      const unit = figure.unit ? ` ${figure.unit}` : '';
      return t('figure.bar_chart', {
        list: list(figure.bars.map((b) => `${b.label} ${formatNumber(b.value)}${unit}`)),
      });
    }
    case 'geometry': {
      const parts = [
        t('figure.geometry', {
          list: list(
            figure.points.map((p) => `${p.name} (${formatNumber(p.x)} | ${formatNumber(p.y)})`),
          ),
        }),
      ];
      if (figure.segments.length > 0) {
        parts.push(
          t('figure.segments', {
            list: list(figure.segments.map((seg) => `${seg.from}${seg.to}`)),
          }),
        );
      }
      if (figure.polygons.length > 0) {
        parts.push(t('figure.polygons', { list: list(figure.polygons.map((p) => p.join(''))) }));
      }
      for (const c of figure.circles) {
        parts.push(t('figure.circle', { center: c.center, radius: formatNumber(c.radius) }));
      }
      return parts.join('. ');
    }
    case 'table': {
      const parts = [
        t('figure.table', { rows: figure.rows.length, header: list(figure.header.map(speak)) }),
      ];
      figure.rows.forEach((r, i) =>
        parts.push(t('figure.row', { n: i + 1, cells: list(r.map(speak)) })),
      );
      return parts.join('. ');
    }
  }
}
