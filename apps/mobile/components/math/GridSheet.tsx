// The paper she draws on (issue #249): a coordinate system, squared paper or the frame of a bar
// chart, and on it what the task shows and what she drew. The paper is `PlotAxes` — the same
// coordinate system as every graph she reads (`FigureView`) — laid out by `plotGeometry`; this
// file draws only what stands on it. It decides nothing: the key is never here, and her points
// are checked on the server (`apps/api/src/modules/practice/grid.ts`).
//
// Never colour alone: her points carry their names, the chosen one a ring as well, the mirror axis
// is dashed, the figure to mirror is filled while her image is only drawn, and the chosen bar's
// name is bold. Everything also stands in words under the paper (`GridAnswer`).

import type { GridDrawTaskView, GridXY } from '@learnbuddy/shared-types/contracts';
import Svg, { ClipPath, Circle, Defs, G, Line, Polygon, Polyline, Rect } from 'react-native-svg';

import {
  plotGeometry,
  plotValueAt,
  plotX,
  plotY,
  type PlotGeometry,
} from '../../lib/math/plotLayout.js';
import type { GridDrawState } from '../../lib/practice/gridDraw.js';
import { nameOf } from '../../lib/practice/gridDraw.js';
import { useSvgId } from '../../lib/theme/svgId.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { formatNumber, HaloText, SMALL } from './figureText.js';
import { PlotAxes } from './PlotAxes.js';

/**
 * A square of the paper: never larger than a touch target needs, never smaller than a finger can
 * still aim at — the crossing under the finger is taken, so the whole square around a crossing is
 * its target, and the arrow keys fix a miss (CLAUDE.md: 44 pt; the deviation is the note line's,
 * #275, measured in tests/web/grid.spec.ts).
 */
const GRID_UNIT_MAX = 44;
const GRID_UNIT_MIN = 22;
/** The smallest square that still carries the origin's 0 next to the −1. */
const ZERO_UNIT = 30;
/**
 * A bar chart's row at its smallest: only the height of a bar is set by tapping, and ↑ ↓ pull it a
 * step, so a row is never aimed at as a crossing is.
 */
const BAR_ROW_MIN = 20;
/** One row of a bar chart: its columns are as wide as the paper allows, its rows this tall. */
const BAR_ROW = 34;
/** Room under the paper for the x labels of a first-quadrant system, or the bars' names. */
const LABEL_ROOM = 22;

/** Room above the paper (the y-axis' arrow) and under it without labels there. */
const PAPER_TOP = 12;
const PAPER_BOTTOM = 8;

/** A first-quadrant system and a bar chart carry their labels under the paper. */
const labelsUnder = (view: GridDrawTaskView) =>
  view.sheet.mode === 'bars' || (view.frame.y_min >= 0 && view.sheet.mode !== 'mirror');

/** The least the paper takes: every square at its smallest, and its own margins. */
export function gridMinHeight(view: GridDrawTaskView): number {
  const rows = view.frame.y_max - view.frame.y_min;
  const unit = view.sheet.mode === 'bars' ? BAR_ROW_MIN : GRID_UNIT_MIN;
  return PAPER_TOP + rows * unit + (labelsUnder(view) ? LABEL_ROOM : PAPER_BOTTOM);
}

/** How the paper lies at `width` × `height` (the most it may take). */
export function gridLayout(view: GridDrawTaskView, width: number, height: number): PlotGeometry {
  const { frame, sheet } = view;
  const bars = sheet.mode === 'bars';
  const rows = frame.y_max - frame.y_min;
  return plotGeometry({
    width,
    // A bar chart's rows have a height of their own; its columns share the width.
    height: bars ? Math.min(height, PAPER_TOP + rows * BAR_ROW + LABEL_ROOM) : height,
    x0: frame.x_min,
    x1: frame.x_max,
    y0: frame.y_min,
    y1: frame.y_max,
    fontSize: SMALL,
    label: formatNumber,
    steps: { x: 1, y: 1 },
    ...(bars ? {} : { square: true, maxUnit: GRID_UNIT_MAX }),
    ...(labelsUnder(view) ? { bottom: LABEL_ROOM } : {}),
    ...(bars
      ? {
          xLabel: () => null,
          yLabel: (v: number) => formatNumber(v * sheet.step),
        }
      : {}),
  });
}

/** The whole size of the drawing. */
export function gridSize(g: PlotGeometry): { width: number; height: number } {
  return { width: g.left + g.pw + g.right, height: g.top + g.ph + g.bottom };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The crossing nearest the finger, held on the paper: the whole square around it is its target. */
export function crossingAt(g: PlotGeometry, at: { x: number; y: number }): GridXY {
  const v = plotValueAt(g, at);
  return { x: clamp(Math.round(v.x), g.x0, g.x1), y: clamp(Math.round(v.y), g.y0, g.y1) };
}

/** The bar whose column is under the finger, and the row its top is pulled to. */
export function barAt(
  g: PlotGeometry,
  at: { x: number; y: number },
): { bar: number; rows: number } {
  const v = plotValueAt(g, at);
  const columns = g.x1 - g.x0;
  return {
    bar: clamp(Math.floor(v.x - g.x0), 0, columns - 1),
    rows: clamp(Math.round(v.y), g.y0, g.y1),
  };
}

type Props = { view: GridDrawTaskView; state: GridDrawState; g: PlotGeometry };

export function GridSheet({ view, state, g }: Props) {
  const { figure: ink } = useTheme();
  const clipId = useSvgId('gridclip');
  const { sheet } = view;
  const size = gridSize(g);
  const X = (v: number) => plotX(g, v);
  const Y = (v: number) => plotY(g, v);
  const at = (p: GridXY) => `${X(p.x)},${Y(p.y)}`;
  const set = state.points.flatMap((p, i) => (p ? [{ p, i }] : []));
  return (
    <Svg width={size.width} height={size.height}>
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={g.left} y={g.top} width={g.pw} height={g.ph} />
        </ClipPath>
      </Defs>
      {/* The origin's 0 would run into the −1 beside it on small squares ("−10"); the axes cross
          there and say it. */}
      <PlotAxes
        g={g}
        axes={sheet.mode !== 'mirror'}
        names={sheet.mode !== 'bars'}
        zero={g.pw / (g.x1 - g.x0 || 1) >= ZERO_UNIT}
      />
      {sheet.mode === 'mirror' ? (
        <G>
          <Line
            {...(sheet.axis.dir === 'vertical'
              ? { x1: X(sheet.axis.at), x2: X(sheet.axis.at), y1: g.top, y2: g.top + g.ph }
              : { x1: g.left, x2: g.left + g.pw, y1: Y(sheet.axis.at), y2: Y(sheet.axis.at) })}
            stroke={ink.stroke}
            strokeWidth={2.5}
            strokeDasharray="7 5"
          />
          <Polygon
            points={sheet.figure.map(at).join(' ')}
            fill={ink.fillSoft}
            stroke={ink.stroke}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {sheet.figure.map((p) => (
            <G key={p.name}>
              <Circle cx={X(p.x)} cy={Y(p.y)} r={3.5} fill={ink.stroke} />
              <HaloText
                x={X(p.x) - 8}
                y={Y(p.y) - 8}
                color={ink.stroke}
                anchor="end"
                text={p.name}
              />
            </G>
          ))}
          <Mirrored state={state} at={at} />
        </G>
      ) : null}
      {sheet.mode === 'graph' && sheet.line ? (
        <LineThrough state={state} g={g} clipId={clipId} />
      ) : null}
      {sheet.mode === 'bars' ? <Bars view={view} state={state} g={g} /> : null}
      {set.map(({ p, i }) => {
        const name = nameOf(view, i);
        // A name stands up and to the right of its point — left of it at the right edge, under it
        // at the top edge, where it would otherwise be cut off.
        const nearRight = X(p.x) > g.left + g.pw - 24;
        const nearTop = Y(p.y) < g.top + 16;
        return (
          <G key={`p${i}`}>
            {state.selected === i ? (
              <Circle
                cx={X(p.x)}
                cy={Y(p.y)}
                r={11}
                fill="none"
                stroke={ink.point}
                strokeWidth={2}
              />
            ) : null}
            <Circle
              cx={X(p.x)}
              cy={Y(p.y)}
              r={6}
              fill={ink.point}
              stroke={ink.paper}
              strokeWidth={1.5}
            />
            {name ? (
              <HaloText
                x={X(p.x) + (nearRight ? -12 : 12)}
                y={Y(p.y) + (nearTop ? 20 : -10)}
                color={ink.point}
                anchor={nearRight ? 'end' : 'start'}
                text={name}
              />
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}

/** Her image of the figure: each side once both its ends are set, closed when all are. */
function Mirrored({ state, at }: { state: GridDrawState; at: (p: GridXY) => string }) {
  const { figure: ink } = useTheme();
  const pts = state.points;
  const all = pts.every((p) => p !== null);
  if (all) {
    return (
      <Polygon
        points={pts.map((p) => at(p!)).join(' ')}
        fill="none"
        stroke={ink.point}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    );
  }
  return (
    <G>
      {pts.slice(0, -1).map((p, i) => {
        const q = pts[i + 1];
        return p && q ? (
          <Polyline
            key={i}
            points={`${at(p)} ${at(q)}`}
            fill="none"
            stroke={ink.point}
            strokeWidth={2}
          />
        ) : null;
      })}
    </G>
  );
}

/** A line through her two points, drawn across the whole paper. */
function LineThrough({
  state,
  g,
  clipId,
}: {
  state: GridDrawState;
  g: PlotGeometry;
  clipId: string;
}) {
  const { figure: ink } = useTheme();
  const [a, b] = state.points;
  if (!a || !b || (a.x === b.x && a.y === b.y)) return null;
  // Far beyond both ends; the clip keeps it on the paper.
  const reach = (g.x1 - g.x0 + g.y1 - g.y0) * 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const from = { x: a.x - (dx / len) * reach, y: a.y - (dy / len) * reach };
  const to = { x: a.x + (dx / len) * reach, y: a.y + (dy / len) * reach };
  return (
    <G clipPath={`url(#${clipId})`}>
      <Line
        x1={plotX(g, from.x)}
        y1={plotY(g, from.y)}
        x2={plotX(g, to.x)}
        y2={plotY(g, to.y)}
        stroke={ink.series[0]}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </G>
  );
}

/** The bars she pulled, and their names under their columns. */
function Bars({ view, state, g }: Props) {
  const { figure: ink } = useTheme();
  if (view.sheet.mode !== 'bars') return null;
  const { bars, step } = view.sheet;
  return (
    <G>
      {bars.map((b, i) => {
        const value = state.bars[i] ?? 0;
        const chosen = state.selected === i;
        const left = plotX(g, i + 0.2);
        const width = plotX(g, i + 0.8) - left;
        const top = plotY(g, value / step);
        return (
          <G key={b.id}>
            {value > 0 ? (
              <Rect
                x={left}
                y={top}
                width={width}
                height={g.axisX - top}
                fill={ink.fill}
                stroke={chosen ? ink.point : ink.stroke}
                strokeWidth={chosen ? 3 : 1.5}
              />
            ) : chosen ? (
              <Line
                x1={left}
                x2={left + width}
                y1={g.axisX}
                y2={g.axisX}
                stroke={ink.point}
                strokeWidth={4}
              />
            ) : null}
            <HaloText
              x={plotX(g, i + 0.5)}
              y={g.top + g.ph + 16}
              size={SMALL}
              weight={chosen ? '600' : '400'}
              color={chosen ? ink.point : ink.label}
              anchor="middle"
              text={b.label}
            />
          </G>
        );
      })}
    </G>
  );
}
