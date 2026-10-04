// Draws the figure that goes with a question (packages/shared-types/src/contracts/figure.ts):
// fraction pictures, number lines, function graphs, bar charts, geometry
// drawings, tables and the charts of ChartFigures.tsx. The model only sends data; this draws it with
// react-native-svg at the width that is available. Every figure also carries a
// text description for screen readers. A function the grammar can't read is
// left out — the figure never crashes the question.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
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
import { niceStep } from '../../../../packages/shared-math/src/charts.js';
import { isSpaceFigure } from '../../../../packages/shared-math/src/space.js';
import { isTreeFigure } from '../../../../packages/shared-math/src/trees.js';
import {
  BARE_FIGURE_CHROME,
  BARE_FIGURE_PAD,
  figureBodyWidth,
  figureScale,
  naturalFigureHeight,
  newFigureWidth,
} from '../../lib/math/figureScale.js';
import { plotFrame, ticksFor, yLabelsClearOf, Y_LABEL_GAP } from '../../lib/math/plotLayout.js';
import { pointsOnGraph, prettyExpr, tracePath } from '../../lib/math/plotMath.js';
import { speakMathText } from '../../lib/math/speak.js';
import { SPACE } from '../../lib/theme/space.js';
import { useSvgId } from '../../lib/theme/svgId.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { describeStaff } from '../../lib/music/words.js';
import { ChartBody, describeChart } from './ChartFigures.js';
import { MathText } from './MathText.js';
import { StaffLine } from './StaffLine.js';
import { FAMILY, FONT, formatNumber, HaloText, SMALL } from './figureText.js';
import { describeMolecule, MoleculeView } from './MoleculeView.js';
import { describeSpace, SpaceBody } from './SolidFigures.js';
import { describeTree, TreeBody } from './TreeFigures.js';
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

/**
 * `maxHeight` keeps a drawing from pushing the answer off a small screen: a figure
 * that comes out taller is drawn again, narrower (its height follows its width).
 *
 * `bare`: the figure IS an answer option ("Welcher Graph passt?", issue #231). Then it names
 * no formula — no legend under a graph, none in its description, which describes the graph
 * by points it passes instead (a legend reading "y = x² − 1" would answer the question) —
 * it draws no frame of its own (the option card is the frame), its height follows its width
 * alone so four fit a phone, and it is not a screen-reader element of its own: the option
 * that holds it says what it shows.
 */
export function FigureView({
  figure,
  maxHeight,
  bare = false,
}: {
  figure: Figure;
  maxHeight?: number;
  bare?: boolean;
}) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const [width, setWidth] = useState(0);
  // The drawing's full height at this width, measured once; the scale is then DERIVED
  // from whatever `maxHeight` is right now (the rules and why they matter for issue #96
  // are in lib/math/figureScale.ts, where they are tested).
  const [fullHeight, setFullHeight] = useState(0);
  const scale = figureScale(fullHeight, maxHeight);
  const words = useSpokenWords();
  const description = useMemo(
    () => describeFigure(figure, t, (s) => speakMathText(s, words), { formulas: !bare }),
    [figure, t, words, bare],
  );

  return (
    <View
      accessible={!bare}
      accessibilityRole={bare ? undefined : 'image'}
      accessibilityLabel={bare ? undefined : `${t('figure.label')}: ${description}`}
      onLayout={(e) => {
        const w = newFigureWidth(width, e.nativeEvent.layout.width);
        if (w !== null) {
          setWidth(w);
          setFullHeight(0); // a new width means a new natural height: measure again
        }
      }}
      style={{
        alignSelf: 'stretch',
        backgroundColor: ink.paper,
        borderRadius: bare ? SPACE.md : 16,
        borderWidth: bare ? 0 : 1,
        borderColor: palette.hairline,
        // Half the chrome on each side (BARE_FIGURE_CHROME / FIGURE_CHROME minus the border).
        padding: bare ? BARE_FIGURE_PAD : 12,
        minHeight: bare ? 0 : 60,
      }}
    >
      {width > 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ alignItems: 'center' }}
          onLayout={(e) => {
            // The first layout after a width change renders at scale 1: that is the
            // drawing's natural height, the one number the derived scale needs.
            const h = naturalFigureHeight(fullHeight, e.nativeEvent.layout.height);
            if (h !== null) setFullHeight(h);
          }}
        >
          <FigureBody
            figure={figure}
            width={figureBodyWidth(width, scale, bare ? BARE_FIGURE_CHROME : undefined)}
            bare={bare}
          />
        </View>
      ) : null}
    </View>
  );
}

function FigureBody({ figure, width, bare }: { figure: Figure; width: number; bare: boolean }) {
  // Trees, pedigrees, automata (#256) and solids, nets, points in space (#255) are drawn in
  // their own files.
  if (isTreeFigure(figure)) return <TreeBody figure={figure} width={width} />;
  if (isSpaceFigure(figure)) return <SpaceBody figure={figure} width={width} />;
  switch (figure.type) {
    case 'fraction':
      return <FractionPicture fig={figure} width={width} />;
    case 'number_line':
      return <NumberLine fig={figure} width={width} />;
    case 'function_plot':
      return <FunctionPlot fig={figure} width={width} bare={bare} />;
    case 'bar_chart':
      return <BarChart fig={figure} width={width} />;
    case 'geometry':
      return <Geometry fig={figure} width={width} />;
    case 'table':
      return <Table fig={figure} />;
    case 'molecule':
      return <MoleculeView fig={figure} width={width} />;
    // Die Notenzeile (issue #226). Gezeichnet wird sie in `StaffLine.tsx`, weil dieselbe
    // Zeichnung die Fläche ist, auf die sie schreibt — eine Figur ist, was sie LIEST.
    case 'staff':
      return <StaffLine fig={figure} width={width} />;
    // Charts (issues #245, #246) are drawn in ChartFigures.tsx.
    case 'line_chart':
    case 'climate_chart':
    case 'pie_chart':
    case 'box_plot':
    case 'histogram':
    case 'scatter_plot':
    case 'pyramid':
      return <ChartBody figure={figure} width={width} />;
  }
}

// ─────────────── fractions ───────────────

function FractionPicture({ fig, width }: { fig: FractionFig; width: number }) {
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

// ─────────────── number line ───────────────

function NumberLine({ fig, width }: { fig: NumberLineFig; width: number }) {
  const { figure: ink } = useTheme();
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

// ─────────────── function plot ───────────────

const DASHES: ReadonlyArray<string | undefined> = [undefined, '8 5', '2 4'];

function FunctionPlot({ fig, width, bare }: { fig: PlotFig; width: number; bare: boolean }) {
  const { palette, figure: ink } = useTheme();
  const x0 = Math.min(fig.x_min, fig.x_max);
  const x1 = Math.max(fig.x_min, fig.x_max);
  const y0 = Math.min(fig.y_min, fig.y_max);
  const y1 = Math.max(fig.y_min, fig.y_max);
  const xs = x1 - x0 || 1;
  const ys = y1 - y0 || 1;
  // An option's graph is small by design: four of them share a phone (issue #231).
  const h = bare
    ? Math.round(Math.max(width * 0.8, 60))
    : Math.round(Math.min(Math.max(width * 0.8, 220), 380));
  const ph0 = h - 12 - 8;
  const yStep = niceStep(ys, Math.max(4, Math.min(10, Math.floor(ph0 / 32))));
  const yTicks = ticksFor(y0, y1, yStep);
  // The left margin makes room for the y labels when the y-axis runs along the left edge.
  const { left, top, pw, ph, axisY } = plotFrame({
    width,
    height: h,
    x0,
    x1,
    yLabels: [...yTicks.map(formatNumber), '0'],
    fontSize: SMALL,
  });
  const X = (v: number) => left + ((v - x0) / xs) * pw;
  const Y = (v: number) => top + (1 - (v - y0) / ys) * ph;

  const xStep = niceStep(xs, Math.max(4, Math.min(10, Math.floor(pw / 40))));
  const xTicks = ticksFor(x0, x1, xStep);
  // Axes through 0 when 0 is in range, else along the edge.
  const axisX = Y(y0 <= 0 && y1 >= 0 ? 0 : y0);

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

  // Every tick label where it is drawn, so a y label that would sit on an x label can give
  // way (issue #326: "−2" and "−2" on each other next to the origin of a small option graph).
  const yLabelled = (v: number) => Math.abs(v) > yStep / 2 || axisX !== Y(0);
  const xLabels = xTicks
    .filter((v) => Math.abs(v) > xStep / 2 || axisY !== X(0))
    .map((v) => ({ v, x: X(v), y: Math.min(axisX + 15, top + ph - 2), text: formatNumber(v) }));
  const yLabels = yLabelsClearOf(
    xLabels,
    yTicks
      .filter(yLabelled)
      .map((v) => ({ v, x: axisY - Y_LABEL_GAP, y: Y(v) + 4, text: formatNumber(v) })),
    SMALL,
  );
  // One id per drawing: on the web `url(#…)` finds the FIRST element with that id in the
  // document, so with four option graphs and the viewer's large one on the same page a shared
  // id clipped the large curve to the first small graph's box — and it vanished (issue #231).
  const clipId = useSvgId('plotclip');
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
            stroke={ink.grid}
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
            stroke={ink.grid}
            strokeWidth={1}
          />
        ))}
        {/* axes with arrows */}
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
        {xLabels.map((l) => (
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
        {yTicks.filter(yLabelled).map((v) => (
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
        {yLabels.map((l) => (
          <HaloText
            key={`yl${l.v}`}
            {...l}
            size={SMALL}
            weight="400"
            color={ink.label}
            anchor="end"
          />
        ))}
        {/* On a small option picture the origin's 0 would sit on the −2 below it (issue #231). */}
        {!bare && x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0 ? (
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
        <G clipPath={`url(#${clipId})`}>
          {graphs.map((g) => (
            <Path
              key={g.i}
              d={g.d}
              stroke={ink.series[g.i % ink.series.length]}
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
        <View style={{ gap: 4 }}>
          {graphs.map((g) => (
            <View key={g.i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Svg width={28} height={10}>
                <Line
                  x1={2}
                  y1={5}
                  x2={26}
                  y2={5}
                  stroke={ink.series[g.i % ink.series.length]}
                  strokeWidth={2.5}
                  strokeDasharray={DASHES[g.i % DASHES.length]}
                  strokeLinecap="round"
                />
              </Svg>
              <Text style={[TYPE.small, { color: palette.ink }]}>
                {g.label ? `${g.label}: ` : ''}y = {prettyExpr(g.expr)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ─────────────── bar chart ───────────────

function BarChart({ fig, width }: { fig: BarFig; width: number }) {
  const { palette, figure: ink } = useTheme();
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

// ─────────────── geometry ───────────────

type ScreenXY = { x: number; y: number };

/** Where a line from `p` in direction `d` leaves the drawing (inset a little from its edge). */
function toEdge(p: ScreenXY, d: ScreenXY, w: number, h: number): ScreenXY {
  const inset = 4;
  let t = Infinity;
  if (d.x > 1e-9) t = Math.min(t, (w - inset - p.x) / d.x);
  if (d.x < -1e-9) t = Math.min(t, (inset - p.x) / d.x);
  if (d.y > 1e-9) t = Math.min(t, (h - inset - p.y) / d.y);
  if (d.y < -1e-9) t = Math.min(t, (inset - p.y) / d.y);
  if (!Number.isFinite(t) || t < 0) return p;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

const unit = (from: ScreenXY, to: ScreenXY): ScreenXY => {
  const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / l, y: (to.y - from.y) / l };
};

/** A filled arrowhead with its tip at `tip`, pointing along `d`. */
function headPath(tip: ScreenXY, d: ScreenXY, size = 10): string {
  const back = { x: tip.x - d.x * size, y: tip.y - d.y * size };
  const n = { x: -d.y * size * 0.45, y: d.x * size * 0.45 };
  return `M${tip.x},${tip.y} L${back.x + n.x},${back.y + n.y} L${back.x - n.x},${back.y - n.y} Z`;
}

function Geometry({ fig, width }: { fig: GeometryFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  const { angles, lengths, arrows, rays, lines } = fig;
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
  // Room around the drawing for point names, measures and arrow labels.
  // Measures written beside the sides and arrows need more room than point names do.
  const margin = lengths.length > 0 || arrows.length > 0 || lines.length > 0 ? 42 : 30;
  const maxH = Math.min(320, width);
  const scale = Math.min((width - 2 * margin) / spanX, (maxH - 2 * margin) / spanY);
  const h = Math.round(spanY * scale + 2 * margin);
  const offX = (width - spanX * scale) / 2;
  const X = (x: number) => offX + (x - minX) * scale;
  const Y = (y: number) => margin + (maxY - y) * scale;
  const at = (n: string): ScreenXY | null => {
    const p = byName.get(n);
    return p ? { x: X(p.x), y: Y(p.y) } : null;
  };
  const cx = fig.points.reduce((s, p) => s + p.x, 0) / fig.points.length;
  const cy = fig.points.reduce((s, p) => s + p.y, 0) / fig.points.length;
  const middle = { x: X(cx), y: Y(cy) };
  /** The side of a segment that faces away from the middle of the drawing. */
  const outward = (p: ScreenXY, q: ScreenXY): ScreenXY => {
    const d = unit(p, q);
    let n = { x: -d.y, y: d.x };
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if ((mid.x - middle.x) * n.x + (mid.y - middle.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    return n;
  };
  // A point that only marks where an arrow ends, or only gives a line (and the arm of an angle
  // on it) its direction, is no point of the figure: no dot, no name — a mirror's two ends or
  // the top of a normal would otherwise crowd the drawing with letters nobody asked about.
  const named = new Set<string>([
    ...fig.segments.flatMap((sg) => [sg.from, sg.to]),
    ...fig.polygons.flat(),
    ...fig.circles.map((c) => c.center),
    ...angles.map((a) => a.at[1] ?? ''),
    ...lengths.flatMap((l) => [l.from, l.to]),
    ...arrows.map((a) => a.from),
    ...rays.flatMap((r) => [r.from, r.through]),
  ]);
  const helpers = new Set([
    ...arrows.map((a) => a.to),
    ...lines.flatMap((l) => [l.a, l.b]),
    ...angles.flatMap((a) => [a.at[0] ?? '', a.at[2] ?? '']),
  ]);
  const tipsOnly = new Set(
    [...helpers].filter(
      (n) =>
        !named.has(n) &&
        (arrows.some((a) => a.to === n) || lines.some((l) => l.a === n || l.b === n)),
    ),
  );
  /** A measure or a name, kept whole inside the drawing (never cut at its edge). */
  const label = (key: string, x: number, y: number, text: string, color = palette.ink) => {
    const half = ((FONT + 1) * 0.6 * [...text].length) / 2 + 3;
    const cx = Math.min(Math.max(x, half), width - half);
    const cy = Math.min(Math.max(y, FONT), h - 8);
    return (
      <HaloText
        key={key}
        x={cx}
        y={cy + 5}
        size={FONT + 1}
        color={color}
        anchor="middle"
        text={text}
      />
    );
  };

  /**
   * How far a label's centre stands off a line along the normal `n`, so that the whole text —
   * not just its middle — clears the line: a wide "F₂ = 40 N" beside an upright arrow needs
   * half its width, the same text above a level side only half its height.
   */
  const clear = (text: string, n: ScreenXY) =>
    8 + Math.abs(n.x) * (((FONT + 1) * 0.6 * [...text].length) / 2) + Math.abs(n.y) * 8;

  const nodes: ReactNode[] = [];
  const labels: ReactNode[] = [];
  fig.polygons.forEach((poly, i) => {
    const pts = poly.map((n) => byName.get(n)).filter((p) => p !== undefined);
    if (pts.length < 3) return;
    nodes.push(
      <Polygon
        key={`poly${i}`}
        points={pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}
        fill={ink.fillSoft}
        stroke={ink.stroke}
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
        stroke={ink.stroke}
        strokeWidth={1.75}
      />,
    );
  });
  lines.forEach((l, i) => {
    const p = at(l.a);
    const q = at(l.b);
    if (!p || !q) return;
    const d = unit(p, q);
    const end1 = toEdge(p, d, width, h);
    const end2 = toEdge(p, { x: -d.x, y: -d.y }, width, h);
    nodes.push(
      <Line
        key={`l${i}`}
        x1={end1.x}
        y1={end1.y}
        x2={end2.x}
        y2={end2.y}
        stroke={ink.axis}
        strokeWidth={1.5}
      />,
    );
    if (l.label) {
      const n = outward(end2, end1);
      const off = clear(l.label, n);
      const spot = { x: end1.x - d.x * 18 + n.x * off, y: end1.y - d.y * 18 + n.y * off };
      labels.push(label(`ll${i}`, spot.x, spot.y, l.label, palette.ink2));
    }
  });
  fig.segments.forEach((seg, i) => {
    const p = at(seg.from);
    const q = at(seg.to);
    if (!p || !q) return;
    nodes.push(
      <Line
        key={`s${i}`}
        x1={p.x}
        y1={p.y}
        x2={q.x}
        y2={q.y}
        stroke={ink.stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
      />,
    );
  });
  rays.forEach((r, i) => {
    const p = at(r.from);
    const q = at(r.through);
    if (!p || !q) return;
    const d = unit(p, q);
    // Light that falls onto a mirror or a lens ends there; every other ray runs to the edge.
    const end = r.kind === 'light_in' ? q : toEdge(p, d, width, h);
    const light = r.kind !== 'ray';
    const color = light ? ink.series[1] : ink.stroke;
    nodes.push(
      <Line
        key={`r${i}`}
        x1={p.x}
        y1={p.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth={light ? 2.25 : 1.75}
        strokeLinecap="round"
      />,
    );
    // A light ray carries its direction on the line, as in a physics book.
    if (light) {
      // Between its two points, clear of both: early on incoming light, late on outgoing
      // light, so neither sits on the angle values where the light meets the mirror.
      const at = r.kind === 'light_in' ? 0.4 : 0.7;
      const tip = { x: p.x + (q.x - p.x) * at + d.x * 5, y: p.y + (q.y - p.y) * at + d.y * 5 };
      nodes.push(<Path key={`rh${i}`} d={headPath(tip, d, 11)} fill={color} />);
    }
  });
  angles.forEach((a, i) => {
    const [pa, pb, pc] = a.at.map(at);
    if (!pa || !pb || !pc) return;
    const a1 = Math.atan2(pa.y - pb.y, pa.x - pb.x);
    const a2 = Math.atan2(pc.y - pb.y, pc.x - pb.x);
    let delta = a2 - a1;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    const reflex = a.deg !== null && a.deg > 180;
    const sweep = reflex ? delta - Math.sign(delta) * 2 * Math.PI : delta;
    const size = Math.abs(sweep);
    const mid = a1 + sweep / 2;
    const text = a.label ?? (a.deg !== null ? `${formatNumber(a.deg)}°` : null);
    if (a.deg === 90) {
      // A right angle is a square with a dot, never an arc.
      const s = 13;
      const u = unit(pb, pa);
      const v = unit(pb, pc);
      const c1 = { x: pb.x + u.x * s, y: pb.y + u.y * s };
      const c2 = { x: pb.x + (u.x + v.x) * s, y: pb.y + (u.y + v.y) * s };
      const c3 = { x: pb.x + v.x * s, y: pb.y + v.y * s };
      nodes.push(
        <G key={`a${i}`}>
          <Path
            d={`M${c1.x},${c1.y} L${c2.x},${c2.y} L${c3.x},${c3.y}`}
            fill="none"
            stroke={ink.point}
            strokeWidth={1.5}
          />
          <Circle
            cx={pb.x + (u.x + v.x) * s * 0.5}
            cy={pb.y + (u.y + v.y) * s * 0.5}
            r={1.8}
            fill={ink.point}
          />
        </G>,
      );
      if (a.label) {
        const r = 30;
        labels.push(
          label(`al${i}`, pb.x + Math.cos(mid) * r, pb.y + Math.sin(mid) * r, a.label, ink.point),
        );
      }
      return;
    }
    // A narrow angle gets a wider arc, so its value still fits between the arms.
    const r = size < (35 * Math.PI) / 180 ? 36 : 24;
    const start = { x: pb.x + Math.cos(a1) * r, y: pb.y + Math.sin(a1) * r };
    const end = { x: pb.x + Math.cos(a1 + sweep) * r, y: pb.y + Math.sin(a1 + sweep) * r };
    const large = size > Math.PI ? 1 : 0;
    const flag = sweep > 0 ? 1 : 0;
    nodes.push(
      <Path
        key={`a${i}`}
        d={`M${pb.x},${pb.y} L${start.x},${start.y} A${r},${r} 0 ${large} ${flag} ${end.x},${end.y} Z`}
        fill={ink.fillSoft}
        stroke="none"
      />,
      <Path
        key={`ae${i}`}
        d={`M${start.x},${start.y} A${r},${r} 0 ${large} ${flag} ${end.x},${end.y}`}
        fill="none"
        stroke={ink.point}
        strokeWidth={1.75}
      />,
    );
    if (text) {
      const lr = r + 19;
      labels.push(
        label(`al${i}`, pb.x + Math.cos(mid) * lr, pb.y + Math.sin(mid) * lr, text, ink.point),
      );
    }
  });
  lengths.forEach((l, i) => {
    const p = at(l.from);
    const q = at(l.to);
    if (!p || !q) return;
    const text = l.label ?? (l.value !== null ? formatNumber(l.value) : null);
    if (!text) return;
    const n = outward(p, q);
    const off = clear(text, n);
    const mid = { x: (p.x + q.x) / 2 + n.x * off, y: (p.y + q.y) / 2 + n.y * off };
    labels.push(label(`len${i}`, mid.x, mid.y, text));
  });
  arrows.forEach((a, i) => {
    const p = at(a.from);
    const q = at(a.to);
    if (!p || !q) return;
    const d = unit(p, q);
    const color = a.resultant ? ink.series[1] : ink.point;
    nodes.push(
      <G key={`v${i}`}>
        <Line
          x1={p.x}
          y1={p.y}
          x2={q.x - d.x * 8}
          y2={q.y - d.y * 8}
          stroke={color}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeDasharray={a.resultant ? '7 4' : undefined}
        />
        <Path d={headPath(q, d, 11)} fill={color} />
      </G>,
    );
    const text = a.label ?? (a.value !== null ? formatNumber(a.value) : null);
    if (!text) return;
    // The name sits beside the arrow's tip half, on the side away from the middle — or, on an
    // arrow that runs (nearly) upright, beyond its tip: a name as wide as "F₂ = 40 N" beside it
    // would need more room at the edge than the drawing has.
    const n = outward(p, q);
    const upright = Math.abs(n.x) > 0.8;
    const off = clear(text, n);
    const spot = upright
      ? { x: q.x + d.x * 16, y: q.y + d.y * 16 }
      : { x: p.x + (q.x - p.x) * 0.62 + n.x * off, y: p.y + (q.y - p.y) * 0.62 + n.y * off };
    labels.push(label(`vl${i}`, spot.x, spot.y, text, color));
  });

  return (
    <Svg width={width} height={h}>
      {nodes}
      {fig.points
        .filter((p) => !tipsOnly.has(p.name))
        .map((p) => {
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
              <Circle cx={X(p.x)} cy={Y(p.y)} r={3.5} fill={ink.stroke} />
              <HaloText
                x={lx}
                y={ly}
                size={FONT + 2}
                color={palette.ink}
                anchor="middle"
                text={p.name}
              />
            </G>
          );
        })}
      {labels}
    </Svg>
  );
}

// ─────────────── table ───────────────

function Table({ fig }: { fig: TableFig }) {
  const { palette, figure: ink } = useTheme();
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
        borderColor: ink.gridStrong,
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
        backgroundColor: header ? palette.lavender : ink.paper,
        borderTopWidth: header ? 0 : 1,
        borderColor: ink.gridStrong,
      }}
    >
      {Array.from({ length: cols }, (_, i) => cell(cells[i] ?? '', i, header, i === cols - 1))}
    </View>
  );
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: ink.gridStrong,
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

export function describeFigure(
  figure: Figure,
  t: T,
  speak: Speak = (s) => s,
  { formulas = true }: { formulas?: boolean } = {},
): string {
  const list = (items: string[]) => items.join(', ');
  if (isTreeFigure(figure)) return describeTree(figure, t);
  if (isSpaceFigure(figure)) return describeSpace(figure, t);
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
      // An answer option (issue #231): the graph by points it passes, never by its formula.
      if (!formulas) {
        const through = figure.functions
          .map((f) => pointsOnGraph(f.expr, figure))
          .filter((pts) => pts.length > 0)
          .map((pts) =>
            t('figure.graph_through', {
              list: list(pts.map((p) => `(${formatNumber(p.x)} | ${formatNumber(p.y)})`)),
            }),
          );
        if (through.length > 0) return through.join('. ');
      }
      const parts = [
        t('figure.function_plot', {
          x_min: formatNumber(figure.x_min),
          x_max: formatNumber(figure.x_max),
          y_min: formatNumber(figure.y_min),
          y_max: formatNumber(figure.y_max),
        }),
      ];
      for (const f of formulas ? figure.functions : []) {
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
      for (const a of figure.angles) {
        const value = a.label ?? (a.deg !== null ? `${formatNumber(a.deg)}°` : null);
        parts.push(
          value
            ? t('figure.angle_value', { name: a.at.join(''), value: speak(value) })
            : t('figure.angle', { name: a.at.join('') }),
        );
      }
      for (const l of figure.lengths) {
        const value = l.label ?? (l.value !== null ? formatNumber(l.value) : null);
        if (value)
          parts.push(t('figure.length', { name: `${l.from}${l.to}`, value: speak(value) }));
      }
      for (const a of figure.arrows) {
        const value = a.label ?? (a.value !== null ? formatNumber(a.value) : null);
        const key = a.resultant ? 'figure.resultant' : 'figure.arrow';
        parts.push(t(key, { from: a.from, to: a.to, value: value ? speak(value) : '' }).trim());
      }
      for (const r of figure.rays) {
        parts.push(
          t(r.kind === 'ray' ? 'figure.ray' : 'figure.light_ray', {
            from: r.from,
            through: r.through,
          }),
        );
      }
      for (const l of figure.lines) {
        parts.push(t('figure.line', { a: l.a, b: l.b }) + (l.label ? ` (${l.label})` : ''));
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
    case 'molecule':
      return describeMolecule(figure, t);
    // In Worten, wie issue #226 es verlangt („Violinschlüssel, Viervierteltakt: C, E, G,
    // Viertelnoten"). Das ist keine Beschreibung des Bildes, sondern derselbe Inhalt in Sprache:
    // mit dem Screenreader ist die Aufgabe damit lösbar, nicht nur vorhanden.
    case 'staff':
      return describeStaff(figure, t);
    case 'line_chart':
    case 'climate_chart':
    case 'pie_chart':
    case 'box_plot':
    case 'histogram':
    case 'scatter_plot':
    case 'pyramid':
      return describeChart(figure, t);
  }
}
