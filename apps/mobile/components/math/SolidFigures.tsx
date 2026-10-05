// Solids, cube nets and points in space (issue #255): a solid as a Schrägbild with its measures
// on the edges and its hidden edges dashed, six squares on squared paper, a 3D coordinate system
// in the schoolbook's oblique view with each point's dashed path from the origin. Nothing here
// decides anything — the projection, which edges are hidden and every key come from
// packages/shared-math/src/solids.ts and space.ts, the same code that checked the figure on the
// server. Each figure also says in words what it shows (`describeSpace`).
//
// Since #368: a prism with a non-regular base (drawn lying, its base in true shape), any solid but
// a sphere as its net (`solidNets.ts`, faces filled), and Würfelgebäude (`CubeBuildings.tsx`).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import type { ReactNode } from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

// Imported by path, like trees.js in TreeFigures: dependency-free, no mathjs in the bundle.
import { solidNet } from '../../../../packages/shared-math/src/solidNets.js';
import {
  baseHeight,
  edgeLength,
  solidDrawing,
  SOLID_MEASURES,
  writtenSides,
  type SolidXY,
} from '../../../../packages/shared-math/src/solids.js';
import { axesRange, spaceProject } from '../../../../packages/shared-math/src/space.js';
import { solidLayout } from '../../lib/math/solidLayout.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { CubesBody, describeCubes, type CubesFig } from './CubeBuildings.js';
import { FONT, formatNumber, HaloText, SMALL } from './figureText.js';
import { arrowHead } from './TreeFigures.js';

type SolidFig = Extract<Figure, { type: 'solid' }>;
type NetFig = Extract<Figure, { type: 'cube_net' }>;
type AxesFig = Extract<Figure, { type: 'axes3d' }>;
export type SpaceFig = SolidFig | NetFig | AxesFig | CubesFig;
type T = (key: string, values?: Record<string, string | number>) => string;

/** The tallest a solid or a net is drawn, so the answer stays on a small screen. */
const MAX_HEIGHT = 160;
const DASH = '5 4';
/** A measure's size on a solid or a net. */
const LABEL_SIZE = FONT + 1;

export function SpaceBody({ figure, width }: { figure: SpaceFig; width: number }) {
  switch (figure.type) {
    case 'solid':
      return <SolidView fig={figure} width={width} />;
    case 'cube_net':
      return <NetView fig={figure} width={width} />;
    case 'axes3d':
      return <AxesView fig={figure} width={width} />;
    case 'cubes':
      return <CubesBody fig={figure} width={width} />;
  }
}

const pathOf = (pts: readonly SolidXY[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

// ─────────────── solid ───────────────

const countAsked = (ask: SolidFig['ask']) =>
  ask === 'vertices' || ask === 'edges' || ask === 'faces';

function SolidView({ fig, width }: { fig: SolidFig; width: number }) {
  const { figure: ink } = useTheme();
  // Its net, or (a sphere has none, and the server refuses one) its Schrägbild.
  const drawing = (fig.w === 'net' ? solidNet(fig) : null) ?? solidDrawing(fig);
  // A count is read off the edges alone; the measures would only be in the way.
  const labels = countAsked(fig.ask) ? [] : drawing.labels;
  const text = (v: number) => `${formatNumber(v)} ${fig.u}`;
  const { at, height, spots, dimensions } = solidLayout(drawing, labels, text, width, LABEL_SIZE);
  const strokes = [...drawing.strokes].sort((a, b) => Number(b.hidden) - Number(a.hidden));
  return (
    <Svg width={width} height={height}>
      {(drawing.faces ?? []).map((face, i) => (
        <Path key={`f${i}`} d={`${pathOf(face.map(at))} Z`} fill={ink.fillSoft} stroke="none" />
      ))}
      {strokes.map((st, i) => (
        <Path
          key={`s${i}`}
          d={pathOf(st.pts.map(at))}
          stroke={st.hidden ? ink.axis : ink.stroke}
          strokeWidth={st.hidden ? 1.3 : 2}
          strokeDasharray={st.hidden ? DASH : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
      ))}
      {drawing.dots.map((p, i) => {
        const q = at(p);
        return <Circle key={`d${i}`} cx={q.x} cy={q.y} r={2.5} fill={ink.stroke} />;
      })}
      {dimensions.flatMap((d, i) =>
        d === null
          ? []
          : [
              ...d.lines.map((line, j) => (
                <Path
                  key={`m${i}-${j}`}
                  d={pathOf(line)}
                  stroke={ink.axis}
                  strokeWidth={1.2}
                  fill="none"
                />
              )),
              ...d.arrows.map(([from, tip], j) => (
                <Path key={`a${i}-${j}`} d={arrowHead(from, tip, 6)} fill={ink.axis} />
              )),
            ],
      )}
      {labels.map((l, i) => (
        <HaloText
          key={`l${i}`}
          x={spots[i]!.x}
          y={spots[i]!.y}
          anchor="middle"
          size={LABEL_SIZE}
          text={text(l.v)}
          color={ink.point}
        />
      ))}
    </Svg>
  );
}

// ─────────────── cube net ───────────────

function NetView({ fig, width }: { fig: NetFig; width: number }) {
  const { figure: ink } = useTheme();
  const xs = fig.c.map((c) => c.x);
  const ys = fig.c.map((c) => c.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  // One empty row and column of squared paper around the net.
  const cols = Math.max(...xs) - x0 + 3;
  const rows = Math.max(...ys) - y0 + 3;
  const cell = Math.min(44, width / cols, MAX_HEIGHT / rows);
  const ox = (width - cols * cell) / 2;
  const lines: ReactNode[] = [];
  for (let i = 0; i <= cols; i++) {
    const x = ox + i * cell;
    lines.push(
      <Line
        key={`v${i}`}
        x1={x}
        y1={0}
        x2={x}
        y2={rows * cell}
        stroke={ink.grid}
        strokeWidth={1}
      />,
    );
  }
  for (let j = 0; j <= rows; j++) {
    const y = j * cell;
    lines.push(
      <Line
        key={`h${j}`}
        x1={ox}
        y1={y}
        x2={ox + cols * cell}
        y2={y}
        stroke={ink.grid}
        strokeWidth={1}
      />,
    );
  }
  const numbered = fig.ask === 'opposite';
  return (
    <Svg width={width} height={rows * cell}>
      {lines}
      {fig.c.map((c, i) => (
        <Rect
          key={`c${i}`}
          x={ox + (c.x - x0 + 1) * cell}
          y={(c.y - y0 + 1) * cell}
          width={cell}
          height={cell}
          fill={ink.fillSoft}
          stroke={ink.stroke}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ))}
      {numbered
        ? fig.c.map((c, i) => (
            <HaloText
              key={`n${i}`}
              x={ox + (c.x - x0 + 1.5) * cell}
              y={(c.y - y0 + 1.5) * cell + FONT * 0.4}
              anchor="middle"
              text={String(i + 1)}
              size={FONT + 2}
              color={i === fig.at ? ink.point : ink.stroke}
            />
          ))
        : null}
    </Svg>
  );
}

// ─────────────── points in space ───────────────

function AxesView({ fig, width }: { fig: AxesFig; width: number }) {
  const { figure: ink } = useTheme();
  const range = axesRange(fig);
  const ends: [number, number, number][] = [
    [range.x[0], 0, 0],
    [range.x[1], 0, 0],
    [0, range.y[0], 0],
    [0, range.y[1], 0],
    [0, 0, range.z[0]],
    [0, 0, range.z[1]],
  ];
  const flat = ends.map(([x, y, z]) => spaceProject(x, y, z));
  const x0 = Math.min(...flat.map((p) => p.x));
  const x1 = Math.max(...flat.map((p) => p.x));
  const y0 = Math.min(...flat.map((p) => p.y));
  const y1 = Math.max(...flat.map((p) => p.y));
  const pad = 22;
  const unit = Math.min(36, (width - 2 * pad) / (x1 - x0), (MAX_HEIGHT + 10 - 2 * pad) / (y1 - y0));
  const ox = (width - (x1 - x0) * unit) / 2 - x0 * unit;
  const oy = pad - y0 * unit;
  const at = (x: number, y: number, z: number): SolidXY => {
    const p = spaceProject(x, y, z);
    return { x: ox + p.x * unit, y: oy + p.y * unit };
  };
  const out: ReactNode[] = [];
  const axis = (name: 'x' | 'y' | 'z', dir: (k: number) => SolidXY, tick: SolidXY) => {
    const [lo, hi] = range[name];
    const from = dir(lo);
    const tip = dir(hi + 0.4);
    out.push(
      <Line
        key={`a${name}`}
        x1={from.x}
        y1={from.y}
        x2={tip.x}
        y2={tip.y}
        stroke={ink.axis}
        strokeWidth={1.4}
      />,
      <Path key={`h${name}`} d={arrowHead(from, tip, 7)} fill={ink.axis} />,
    );
    const label =
      name === 'x'
        ? { x: tip.x - 8, y: tip.y + 4 }
        : name === 'y'
          ? { x: tip.x, y: tip.y + 16 }
          : { x: tip.x + 10, y: tip.y + 6 };
    out.push(
      <HaloText
        key={`n${name}`}
        x={label.x}
        y={label.y}
        anchor="middle"
        text={name}
        color={ink.axis}
      />,
    );
    for (let k = lo; k < hi; k++) {
      if (k === 0) continue;
      const p = dir(k);
      out.push(
        <Line
          key={`t${name}${k}`}
          x1={p.x - tick.x}
          y1={p.y - tick.y}
          x2={p.x + tick.x}
          y2={p.y + tick.y}
          stroke={ink.axis}
          strokeWidth={1.2}
        />,
      );
      const nx = name === 'z' ? p.x - 9 : name === 'x' ? p.x - 10 : p.x;
      const ny = name === 'y' ? p.y + 15 : p.y + 4;
      out.push(
        <HaloText
          key={`k${name}${k}`}
          x={nx}
          y={ny}
          anchor={name === 'y' ? 'middle' : 'end'}
          text={formatNumber(k)}
          size={SMALL - 1}
          weight="400"
          color={ink.label}
        />,
      );
    }
  };
  axis('x', (k) => at(k, 0, 0), { x: 4, y: 0 });
  axis('y', (k) => at(0, k, 0), { x: 0, y: 4 });
  axis('z', (k) => at(0, 0, k), { x: 4, y: 0 });
  fig.p.forEach((q, i) => {
    const path = [at(0, 0, 0), at(q.x, 0, 0), at(q.x, q.y, 0), at(q.x, q.y, q.z)];
    out.push(
      <Path
        key={`p${i}`}
        d={pathOf(path)}
        stroke={ink.point}
        strokeOpacity={0.55}
        strokeWidth={1.2}
        strokeDasharray="4 3"
        fill="none"
      />,
    );
  });
  fig.v.forEach((arrow, i) => {
    const a = fig.p[arrow.a];
    const b = fig.p[arrow.b];
    if (!a || !b) return;
    const from = at(a.x, a.y, a.z);
    const tip = at(b.x, b.y, b.z);
    out.push(
      <Line
        key={`v${i}`}
        x1={from.x}
        y1={from.y}
        x2={tip.x}
        y2={tip.y}
        stroke={ink.series[1]}
        strokeWidth={2.2}
      />,
      <Path key={`vh${i}`} d={arrowHead(from, tip, 9)} fill={ink.series[1]} />,
    );
  });
  fig.p.forEach((q, i) => {
    const p = at(q.x, q.y, q.z);
    out.push(
      <Circle key={`c${i}`} cx={p.x} cy={p.y} r={4} fill={ink.point} />,
      <HaloText
        key={`l${i}`}
        x={p.x + 7}
        y={p.y - 7}
        anchor="start"
        text={q.l}
        size={FONT + 1}
        color={ink.point}
      />,
    );
  });
  return (
    <Svg width={width} height={(y1 - y0) * unit + 2 * pad}>
      {out}
    </Svg>
  );
}

// ─────────────── in words ───────────────

export function describeSpace(fig: SpaceFig, t: T): string {
  switch (fig.type) {
    case 'solid': {
      const kind = t(`figure.solid_${fig.k}`, { n: fig.n });
      // A net never names its solid where that is the question, nor its faces where they are.
      const title =
        fig.w !== 'net'
          ? t('figure.solid', { kind })
          : fig.ask === 'kind' || countAsked(fig.ask)
            ? t('figure.solid_net_any')
            : t('figure.solid_net', { kind });
      if (countAsked(fig.ask)) return title;
      const v = (x: number) => `${formatNumber(x)} ${fig.u}`;
      const base = fig.g ?? [];
      const height = base.length > 0 ? baseHeight(base) : null;
      const measures =
        base.length > 0
          ? [
              t('figure.solid_base', {
                sides: writtenSides(base)
                  .map((i) => v(edgeLength(base[i]!, base[(i + 1) % base.length]!)))
                  .join(', '),
              }),
              // The base's height where it is drawn: with its sides it gives the base's area.
              ...(height === null ? [] : [t('figure.solid_base_h', { v: v(height.v) })]),
              t('figure.solid_h', { v: v(fig.h) }),
            ]
          : SOLID_MEASURES[fig.k].map((m) => t(`figure.solid_${m}`, { v: v(fig[m]) }));
      return `${title}. ${measures.join(', ')}`;
    }
    case 'cubes':
      return describeCubes(fig, t);
    case 'cube_net': {
      const x0 = Math.min(...fig.c.map((c) => c.x));
      const y0 = Math.min(...fig.c.map((c) => c.y));
      const squares = fig.c.map((c, i) => ({ i, row: c.y - y0 + 1, col: c.x - x0 + 1 }));
      if (fig.ask === 'opposite') {
        const list = squares.map((s) =>
          t('figure.net_square', { n: s.i + 1, row: s.row, col: s.col }),
        );
        return t('figure.net', { list: list.join('; ') });
      }
      const rows = [...new Set(squares.map((s) => s.row))].sort((a, b) => a - b);
      const list = rows.map((row) =>
        t('figure.net_row', {
          row,
          cols: squares
            .filter((s) => s.row === row)
            .map((s) => s.col)
            .sort((a, b) => a - b)
            .join(', '),
        }),
      );
      return t('figure.net', { list: list.join('; ') });
    }
    case 'axes3d': {
      const name = (k: number) => fig.p[k]?.l ?? '';
      const parts = [
        t('figure.axes3d'),
        ...fig.p.map((q) =>
          t('figure.axes3d_point', {
            l: q.l,
            x: formatNumber(q.x),
            y: formatNumber(q.y),
            z: formatNumber(q.z),
          }),
        ),
        ...fig.v.map((a) => t('figure.arrow_to', { a: name(a.a), b: name(a.b) })),
      ];
      return parts.join('. ');
    }
  }
}
