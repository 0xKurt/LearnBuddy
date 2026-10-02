// The pictures whose answer is read off them (issues #254, #255): a clock with hands, euro money,
// the twenty and hundred field, base-ten blocks and the place-value chart, a solid drawn
// obliquely, a cube net and a 3D coordinate system. Drawn with react-native-svg from the data
// code computed (`apps/api/src/modules/practice/visual.ts`) — never from anything the model drew.
// Money is drawn SCHEMATICALLY (a disc, a rectangle and the value), never as an image of a real
// coin or banknote. Every picture also has a description for screen readers (`describeVisual`).

import type {
  Axes3dFigure,
  BaseTenFigure,
  ClockFigure,
  CubeNetFigure,
  DotFieldFigure,
  MoneyFigure,
  SolidFigure,
} from '@learnbuddy/shared-types/contracts';
import { Fragment, type ReactNode } from 'react';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { currentLocale } from '../../lib/i18n/index.js';
import {
  coneTangents,
  cylinderTangents,
  drawnDims,
  edgesOf,
  hull,
  onBackArc,
  polyhedronOf,
  project,
  rim,
  visibleFaces,
  type V2,
  type V3,
} from '../../lib/math/solid.js';
import { localDecimal } from '../../lib/numbers.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY } from './svgFont.js';

type T = (key: string, values?: Record<string, string | number>) => string;

const num = (n: number) => localDecimal(String(Math.round(n * 1000) / 1000), currentLocale());

// ─────────────── the clock ───────────────

/** Where a hand points, in radians clockwise from 12. */
export function handAngles(hour: number, minute: number): { hour: number; minute: number } {
  return {
    hour: (((hour % 12) + minute / 60) / 12) * 2 * Math.PI,
    minute: (minute / 60) * 2 * Math.PI,
  };
}

/**
 * A clock face. The figure above a question and the clock she sets (`ClockAnswer`) are the SAME
 * drawing, so a hand she sets lands exactly where a drawn one would stand.
 */
export function ClockFace({
  hour,
  minute,
  size,
  chosen = null,
}: {
  hour: number;
  minute: number;
  size: number;
  /** The hand she is moving: drawn with a soft halo (the toggle below also says it in words). */
  chosen?: 'hour' | 'minute' | null;
}) {
  const { figure: ink } = useTheme();
  const r = size / 2 - 3;
  const c = size / 2;
  const at = (angle: number, len: number): V2 => [
    c + len * Math.sin(angle),
    c - len * Math.cos(angle),
  ];
  const a = handAngles(hour, minute);
  const hourTip = at(a.hour, r * 0.5);
  const minuteTip = at(a.minute, r * 0.8);
  const fontSize = Math.max(12, Math.round(r * 0.17));
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} fill={ink.paper} stroke={ink.stroke} strokeWidth={2} />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        const [x1, y1] = at((i / 60) * 2 * Math.PI, r - (big ? 9 : 4));
        const [x2, y2] = at((i / 60) * 2 * Math.PI, r - 1);
        return (
          <Line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={big ? ink.stroke : ink.label}
            strokeWidth={big ? 2 : 1}
            strokeLinecap="round"
          />
        );
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const [x, y] = at(((i + 1) / 12) * 2 * Math.PI, r * 0.7);
        return (
          <SvgText
            key={i}
            fontFamily={FAMILY}
            x={x}
            y={y + fontSize * 0.36}
            fontSize={fontSize}
            fontWeight="600"
            fill={ink.stroke}
            textAnchor="middle"
          >
            {i + 1}
          </SvgText>
        );
      })}
      {chosen === 'hour' ? (
        <Line
          x1={c}
          y1={c}
          x2={hourTip[0]}
          y2={hourTip[1]}
          stroke={ink.fill}
          strokeWidth={12}
          strokeLinecap="round"
          opacity={0.4}
        />
      ) : null}
      {chosen === 'minute' ? (
        <Line
          x1={c}
          y1={c}
          x2={minuteTip[0]}
          y2={minuteTip[1]}
          stroke={ink.fill}
          strokeWidth={10}
          strokeLinecap="round"
          opacity={0.4}
        />
      ) : null}
      <Line
        x1={c}
        y1={c}
        x2={hourTip[0]}
        y2={hourTip[1]}
        stroke={ink.stroke}
        strokeWidth={Math.max(5, r * 0.06)}
        strokeLinecap="round"
      />
      <Line
        x1={c}
        y1={c}
        x2={minuteTip[0]}
        y2={minuteTip[1]}
        stroke={ink.point}
        strokeWidth={Math.max(3, r * 0.035)}
        strokeLinecap="round"
      />
      <Circle cx={c} cy={c} r={Math.max(4, r * 0.05)} fill={ink.point} />
    </Svg>
  );
}

function ClockPicture({ fig, width }: { fig: ClockFigure; width: number }) {
  return <ClockFace hour={fig.hour} minute={fig.minute} size={Math.min(width, 260)} />;
}

// ─────────────── money ───────────────

/** Radius of each coin, in proportion to the real one (16.25 mm … 25.75 mm). */
const COIN_MM: Record<number, number> = {
  1: 16.25,
  2: 18.75,
  5: 21.25,
  10: 19.75,
  20: 22.25,
  50: 24.25,
  100: 23.25,
  200: 25.75,
};
const NOTE_W: Record<number, number> = { 500: 96, 1000: 101, 2000: 106, 5000: 110 };
const NOTE_H = 55;

/** How much room one piece takes. */
export function pieceSize(cents: number): { w: number; h: number } {
  const mm = COIN_MM[cents];
  if (mm !== undefined) {
    const d = Math.round(mm * 2.3);
    return { w: d, h: d };
  }
  return { w: NOTE_W[cents] ?? 80, h: NOTE_H };
}

/** The value written on a piece: "50 ct", "2 €". */
export function pieceText(cents: number): string {
  return cents >= 100 ? `${cents / 100} €` : `${cents} ct`;
}

/** One coin or note at (x, y) — its top left corner. */
export function Piece({ cents, x = 0, y = 0 }: { cents: number; x?: number; y?: number }) {
  const { figure: ink } = useTheme();
  const { w, h } = pieceSize(cents);
  const label = pieceText(cents);
  if (cents >= 500) {
    const fill = {
      500: ink.money.note5,
      1000: ink.money.note10,
      2000: ink.money.note20,
      5000: ink.money.note50,
    }[cents as 500 | 1000 | 2000 | 5000];
    return (
      <G>
        <Rect
          x={x + 1}
          y={y + 1}
          width={w - 2}
          height={h - 2}
          rx={6}
          fill={fill}
          stroke={ink.stroke}
          strokeWidth={1.2}
        />
        <Rect
          x={x + 6}
          y={y + 6}
          width={w - 12}
          height={h - 12}
          rx={3}
          fill="none"
          stroke={ink.stroke}
          strokeWidth={0.6}
          opacity={0.45}
        />
        <SvgText
          fontFamily={FAMILY}
          x={x + w / 2}
          y={y + h / 2 + 5.5}
          fontSize={16}
          fontWeight="700"
          fill={ink.stroke}
          textAnchor="middle"
        >
          {label}
        </SvgText>
      </G>
    );
  }
  const r = w / 2 - 1;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const metal = cents <= 5 ? ink.money.copper : cents <= 50 ? ink.money.brass : null;
  // 1 € is brass outside and silver inside, 2 € the other way round.
  const outer = metal ?? (cents === 100 ? ink.money.brass : ink.money.silver);
  const inner = metal ?? (cents === 100 ? ink.money.silver : ink.money.brass);
  const fontSize = r < 16 ? 10.5 : 12;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={outer} stroke={ink.stroke} strokeWidth={1.2} />
      <Circle
        cx={cx}
        cy={cy}
        r={r * 0.7}
        fill={inner}
        stroke={ink.stroke}
        strokeWidth={0.6}
        opacity={metal ? 0.6 : 1}
      />
      <SvgText
        fontFamily={FAMILY}
        x={cx}
        y={cy + fontSize * 0.36}
        fontSize={fontSize}
        fontWeight="700"
        fill={ink.stroke}
        textAnchor="middle"
      >
        {label}
      </SvgText>
    </G>
  );
}

/** Pieces in rows that wrap at `width`, each row centred. */
export function layoutPieces(pieces: readonly number[], width: number, gap = 10) {
  const rows: { cents: number; x: number; w: number; h: number }[][] = [[]];
  let x = 0;
  for (const cents of pieces) {
    const s = pieceSize(cents);
    const row = rows[rows.length - 1] as { cents: number; x: number; w: number; h: number }[];
    if (row.length > 0 && x + s.w > width) {
      rows.push([]);
      x = 0;
    }
    (rows[rows.length - 1] as typeof row).push({ cents, x, ...s });
    x += s.w + gap;
  }
  const placed: { cents: number; x: number; y: number }[] = [];
  let y = 0;
  for (const row of rows) {
    const used = row.reduce((sum, p) => sum + p.w, 0) + gap * Math.max(0, row.length - 1);
    const shift = (width - used) / 2;
    const tall = Math.max(...row.map((p) => p.h), 0);
    for (const p of row) placed.push({ cents: p.cents, x: p.x + shift, y: y + (tall - p.h) / 2 });
    y += tall + gap;
  }
  return { placed, height: Math.max(0, y - gap) };
}

function MoneyPicture({ fig, width }: { fig: MoneyFigure; width: number }) {
  const { placed, height } = layoutPieces(fig.pieces, width);
  return (
    <Svg width={width} height={height}>
      {placed.map((p, i) => (
        <Piece key={i} cents={p.cents} x={p.x} y={p.y} />
      ))}
    </Svg>
  );
}

// ─────────────── twenty and hundred field ───────────────

function DotField({ fig, width }: { fig: DotFieldFigure; width: number }) {
  const { figure: ink } = useTheme();
  const rows = fig.size === 20 ? 2 : 10;
  const split = 8;
  const cell = Math.min((width - split - 4) / 10, fig.size === 20 ? 34 : 30);
  const w = cell * 10 + split + 4;
  const h = cell * rows + (rows > 5 ? split : 0) + 4;
  const dx = (col: number) => 2 + col * cell + (col >= 5 ? split : 0);
  const dy = (row: number) => 2 + row * cell + (rows > 5 && row >= 5 ? split : 0);
  return (
    <Svg width={w} height={h}>
      {[0, 1].map((bx) =>
        (rows > 5 ? [0, 1] : [0]).map((by) => (
          <Rect
            key={`${bx}${by}`}
            x={dx(bx * 5) - 1}
            y={dy(by * 5) - 1}
            width={cell * 5 + 2}
            height={cell * Math.min(5, rows) + 2}
            rx={6}
            fill={ink.paper}
            stroke={ink.gridStrong}
            strokeWidth={1.2}
          />
        )),
      )}
      {Array.from({ length: fig.size }, (_, i) => {
        const row = Math.floor(i / 10);
        const col = i % 10;
        const on = i < fig.filled;
        return (
          <Circle
            key={i}
            cx={dx(col) + cell / 2}
            cy={dy(row) + cell / 2}
            r={cell * 0.34}
            fill={on ? ink.fill : 'none'}
            stroke={on ? ink.stroke : ink.gridStrong}
            strokeWidth={on ? 1.2 : 1}
          />
        );
      })}
    </Svg>
  );
}

// ─────────────── base-ten blocks and the place-value chart ───────────────

/** The column heads of the place-value chart, in the reading language (T H Z E in German). */
const PLACES = ['thousands', 'hundreds', 'tens', 'ones'] as const;

function BaseTen({ fig, width, t }: { fig: BaseTenFigure; width: number; t: T }) {
  if (fig.look === 'chart') return <PlaceChart fig={fig} width={width} t={t} />;
  return <Blocks fig={fig} width={width} />;
}

function Blocks({ fig, width }: { fig: BaseTenFigure; width: number }) {
  const { figure: ink } = useTheme();
  const u = Math.max(6.5, Math.min(10, width / 40));
  const side = u * 10;
  const gap = 8;
  // Three groups — plates, rods, cubes — flowing left to right and wrapping as a whole.
  type Group = { w: number; h: number; draw: (x: number, y: number) => ReactNode };
  const groups: Group[] = [];
  if (fig.hundreds > 0) {
    const perRow = Math.max(1, Math.min(fig.hundreds, Math.floor((width + gap) / (side + gap))));
    const rows = Math.ceil(fig.hundreds / perRow);
    groups.push({
      w: perRow * side + (perRow - 1) * gap,
      h: rows * side + (rows - 1) * gap,
      draw: (x, y) =>
        Array.from({ length: fig.hundreds }, (_, i) => {
          const px = x + (i % perRow) * (side + gap);
          const py = y + Math.floor(i / perRow) * (side + gap);
          return (
            <G key={`h${i}`}>
              <Rect
                x={px}
                y={py}
                width={side}
                height={side}
                fill={ink.fill}
                stroke={ink.stroke}
                strokeWidth={1.2}
              />
              {Array.from({ length: 9 }, (_, k) => (
                <Fragment key={k}>
                  <Line
                    x1={px + (k + 1) * u}
                    y1={py}
                    x2={px + (k + 1) * u}
                    y2={py + side}
                    stroke={ink.stroke}
                    strokeWidth={0.4}
                    opacity={0.5}
                  />
                  <Line
                    x1={px}
                    y1={py + (k + 1) * u}
                    x2={px + side}
                    y2={py + (k + 1) * u}
                    stroke={ink.stroke}
                    strokeWidth={0.4}
                    opacity={0.5}
                  />
                </Fragment>
              ))}
            </G>
          );
        }),
    });
  }
  if (fig.tens > 0) {
    groups.push({
      w: fig.tens * u + (fig.tens - 1) * 4,
      h: side,
      draw: (x, y) =>
        Array.from({ length: fig.tens }, (_, i) => (
          <G key={`t${i}`}>
            <Rect
              x={x + i * (u + 4)}
              y={y}
              width={u}
              height={side}
              fill={ink.fill}
              stroke={ink.stroke}
              strokeWidth={1.2}
            />
            {Array.from({ length: 9 }, (_, k) => (
              <Line
                key={k}
                x1={x + i * (u + 4)}
                y1={y + (k + 1) * u}
                x2={x + i * (u + 4) + u}
                y2={y + (k + 1) * u}
                stroke={ink.stroke}
                strokeWidth={0.4}
                opacity={0.5}
              />
            ))}
          </G>
        )),
    });
  }
  if (fig.ones > 0) {
    const cube = u + 3;
    const cols = Math.ceil(fig.ones / 5);
    groups.push({
      w: cols * cube + (cols - 1) * 4,
      h: side,
      draw: (x, y) =>
        Array.from({ length: fig.ones }, (_, i) => (
          <Rect
            key={`o${i}`}
            x={x + Math.floor(i / 5) * (cube + 4)}
            y={y + side - (1 + (i % 5)) * (cube + 4) + 4}
            width={cube}
            height={cube}
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={1.2}
          />
        )),
    });
  }
  // Flow: a group goes on the current line if it fits, otherwise on the next.
  const lines: { groups: Group[]; w: number; h: number }[] = [];
  for (const g of groups) {
    const line = lines[lines.length - 1];
    if (line && line.w + 16 + g.w <= width) {
      line.groups.push(g);
      line.w += 16 + g.w;
      line.h = Math.max(line.h, g.h);
    } else lines.push({ groups: [g], w: g.w, h: g.h });
  }
  const height = lines.reduce((s, l) => s + l.h, 0) + 14 * Math.max(0, lines.length - 1) + 4;
  let y = 2;
  return (
    <Svg width={width} height={height}>
      {lines.map((line, li) => {
        let x = (width - line.w) / 2;
        const top = y;
        y += line.h + 14;
        return (
          <G key={li}>
            {line.groups.map((g, gi) => {
              const node = g.draw(x, top + (line.h - g.h));
              x += g.w + 16;
              return <G key={gi}>{node}</G>;
            })}
          </G>
        );
      })}
    </Svg>
  );
}

function PlaceChart({ fig, width, t }: { fig: BaseTenFigure; width: number; t: T }) {
  const { figure: ink } = useTheme();
  const first = fig.thousands > 0 ? 0 : 1;
  const places = PLACES.slice(first);
  const colW = Math.min(width / places.length, 78);
  const w = colW * places.length;
  const head = 28;
  const pitch = 15;
  const body = pitch * 3 + 18;
  return (
    <Svg width={w + 2} height={head + body + 2}>
      <Rect
        x={1}
        y={1}
        width={w}
        height={head + body}
        rx={8}
        fill={ink.paper}
        stroke={ink.stroke}
        strokeWidth={1.2}
      />
      <Line x1={1} y1={head + 1} x2={w + 1} y2={head + 1} stroke={ink.stroke} strokeWidth={1.2} />
      {places.map((place, i) => {
        const x0 = 1 + i * colW;
        const count = fig[place];
        return (
          <G key={place}>
            {i > 0 ? (
              <Line
                x1={x0}
                y1={1}
                x2={x0}
                y2={head + body + 1}
                stroke={ink.stroke}
                strokeWidth={1.2}
              />
            ) : null}
            <SvgText
              fontFamily={FAMILY}
              x={x0 + colW / 2}
              y={20}
              fontSize={14}
              fontWeight="700"
              fill={ink.stroke}
              textAnchor="middle"
            >
              {t(`figure.place_${place}`)}
            </SvgText>
            {Array.from({ length: count }, (_, k) => (
              <Circle
                key={k}
                cx={x0 + colW / 2 + ((k % 3) - 1) * pitch}
                cy={head + 1 + 9 + pitch / 2 + Math.floor(k / 3) * pitch}
                r={5.5}
                fill={ink.fill}
                stroke={ink.stroke}
                strokeWidth={1.1}
              />
            ))}
          </G>
        );
      })}
    </Svg>
  );
}

// ─────────────── solids ───────────────

const PAD = 30;

function SolidPicture({ fig, width }: { fig: SolidFigure; width: number }) {
  const { figure: ink } = useTheme();
  const d = drawnDims(fig.solid, fig.dims);
  const poly = polyhedronOf(fig.solid, d);
  const r = d.r ?? 1;
  const h = d.h ?? 1;
  // Every point of the drawing in space, to fit the page.
  const outline: V3[] = poly
    ? poly.vertices
    : fig.solid === 'sphere'
      ? [[-r, -r, 0], [r, r, 0], ...rim(r, 0, 24).map((p) => p.at)]
      : [
          ...rim(r, 0, 48).map((p) => p.at),
          ...rim(r, fig.solid === 'cylinder' ? h : 0, 48).map((p) => p.at),
          [0, h, 0],
        ];
  const flat = outline.map(project);
  const xs = flat.map((p) => p[0]);
  const ys = flat.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  // Drawn as large as the width allows; FigureView scales it down where the card is short.
  const maxH = Math.min(300, width * 0.8);
  // Room on both sides for a label such as "h = 5 cm" beside an edge; none needed unlabelled.
  const side = fig.labeled ? 80 : 12;
  const scale = Math.min(
    (width - 2 * side) / (maxX - minX || 1),
    (maxH - 2 * PAD) / (maxY - minY || 1),
  );
  const H = (maxY - minY) * scale + 2 * PAD;
  const ox = (width - (maxX - minX) * scale) / 2;
  const page = (p: V3): V2 => {
    const q = project(p);
    return [ox + (q[0] - minX) * scale, PAD + (maxY - q[1]) * scale];
  };
  const pts = (list: readonly V3[]) => list.map((p) => page(p).join(',')).join(' ');
  const solid = { stroke: ink.stroke, strokeWidth: 1.6, strokeLinejoin: 'round' as const };
  const hidden = { stroke: ink.label, strokeWidth: 1.2, strokeDasharray: '5 4' };
  const labels: ReactNode[] = [];
  const unit = fig.unit;
  const label = (name: string, at: V2, anchor: 'start' | 'middle' | 'end' = 'middle') => {
    if (!fig.labeled) return;
    const value = fig.dims.find((x) => x.name === name)?.value;
    if (value === undefined) return;
    labels.push(
      <SvgText
        key={name}
        fontFamily={FAMILY}
        x={at[0]}
        y={at[1]}
        fontSize={12.5}
        fontWeight="600"
        fill={ink.point}
        textAnchor={anchor}
      >
        {`${name} = ${num(value)} ${unit}`}
      </SvgText>,
    );
  };

  let body: ReactNode;
  if (poly) {
    const seen = visibleFaces(poly);
    const edges = edgesOf(poly);
    body = (
      <>
        {poly.faces.map((face, f) =>
          seen[f] ? (
            <Polygon
              key={`f${f}`}
              points={pts(face.map((i) => poly.vertices[i] as V3))}
              fill={ink.fillSoft}
            />
          ) : null,
        )}
        {edges
          .filter((e) => e.hidden)
          .map((e, i) => {
            const [a, b] = [page(poly.vertices[e.from] as V3), page(poly.vertices[e.to] as V3)];
            return <Line key={`h${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...hidden} />;
          })}
        {edges
          .filter((e) => !e.hidden)
          .map((e, i) => {
            const [a, b] = [page(poly.vertices[e.from] as V3), page(poly.vertices[e.to] as V3)];
            return (
              <Line
                key={`v${i}`}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                {...solid}
                strokeLinecap="round"
              />
            );
          })}
      </>
    );
    const v = poly.vertices;
    if (fig.solid === 'cube' || fig.solid === 'cuboid') {
      const [p0, p1, p2, p5] = [
        page(v[0] as V3),
        page(v[1] as V3),
        page(v[2] as V3),
        page(v[5] as V3),
      ];
      label('a', [(p0[0] + p1[0]) / 2, p0[1] + 18]);
      label('b', [(p1[0] + p2[0]) / 2 + 8, (p1[1] + p2[1]) / 2 + 12], 'start');
      label('h', [p1[0] - 6, (p1[1] + p5[1]) / 2 + 4], 'end');
    } else {
      const n = poly.faces[0]?.length ?? 4;
      const [b0, b1] = [page(v[0] as V3), page(v[1] as V3)];
      label('a', [(b0[0] + b1[0]) / 2, Math.max(b0[1], b1[1]) + 18]);
      if (fig.solid.startsWith('pyramid')) {
        const [foot, apex] = [page([0, 0, 0]), page([0, h, 0])];
        if (fig.labeled) {
          body = (
            <>
              {body}
              <Line
                x1={foot[0]}
                y1={foot[1]}
                x2={apex[0]}
                y2={apex[1]}
                {...hidden}
                stroke={ink.point}
              />
            </>
          );
        }
        label('h', [apex[0] + 8, (foot[1] + apex[1]) / 2], 'start');
      } else {
        // The front right edge, from base corner 1 up to its top corner.
        const right = page(v[1] as V3);
        const up = page(v[n + 1] as V3);
        label('h', [Math.max(right[0], up[0]) + 6, (right[1] + up[1]) / 2], 'start');
      }
    }
  } else if (fig.solid === 'sphere') {
    const c = page([0, 0, 0]);
    const rad = r * scale;
    // The equator: its back half (further into the page) is hidden behind the ball.
    const ring = rim(r, 0);
    const back = ring.filter((p) => onBackArc(p.phi, 0));
    const front = sortedArc(
      ring.filter((p) => !onBackArc(p.phi, 0)),
      Math.PI,
    );
    body = (
      <>
        <Circle cx={c[0]} cy={c[1]} r={rad} fill={ink.fillSoft} {...solid} />
        <Path d={pathOf(back.map((p) => page(p.at)))} fill="none" {...hidden} />
        <Path d={pathOf(front.map((p) => page(p.at)))} fill="none" {...solid} />
        {fig.labeled ? (
          <Line
            x1={c[0]}
            y1={c[1]}
            x2={c[0] + rad}
            y2={c[1]}
            stroke={ink.point}
            strokeWidth={1.4}
          />
        ) : null}
        <Circle cx={c[0]} cy={c[1]} r={2.5} fill={ink.stroke} />
      </>
    );
    label('r', [c[0] + rad / 2, c[1] - 8]);
  } else {
    const cylinder = fig.solid === 'cylinder';
    const tangents = cylinder ? cylinderTangents() : coneTangents(r, h);
    const from = tangents ? tangents[0] : 0;
    const to = tangents ? tangents[1] : 2 * Math.PI;
    const bottom = rim(r, 0, 144);
    const isBack = (phi: number) => {
      if (!tangents) return false;
      const t = (((phi - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return t > 0 && t < to - from;
    };
    const backArc = bottom.filter((p) => isBack(p.phi));
    const frontArc = bottom.filter((p) => !isBack(p.phi));
    const hullPts = hull([
      ...bottom.map((p) => page(p.at)),
      ...(cylinder ? rim(r, h, 72).map((p) => page(p.at)) : [page([0, h, 0])]),
    ]);
    const [c0, ch] = [page([0, 0, 0]), page([0, h, 0])];
    const sides: ReactNode[] = [];
    if (cylinder) {
      for (const phi of [from, to]) {
        const a = page([r * Math.cos(phi), 0, r * Math.sin(phi)]);
        const b = page([r * Math.cos(phi), h, r * Math.sin(phi)]);
        sides.push(<Line key={phi} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...solid} />);
      }
    } else if (tangents) {
      for (const phi of [from, to]) {
        const a = page([r * Math.cos(phi), 0, r * Math.sin(phi)]);
        sides.push(<Line key={phi} x1={a[0]} y1={a[1]} x2={ch[0]} y2={ch[1]} {...solid} />);
      }
    }
    body = (
      <>
        <Polygon points={hullPts.map((p) => p.join(',')).join(' ')} fill={ink.fillSoft} />
        <Path d={pathOf(sortedArc(backArc, from).map((p) => page(p.at)))} fill="none" {...hidden} />
        <Path d={pathOf(sortedArc(frontArc, to).map((p) => page(p.at)))} fill="none" {...solid} />
        {sides}
        {cylinder ? (
          <Path d={pathOf(rim(r, h, 96).map((p) => page(p.at)))} fill="none" {...solid} />
        ) : null}
        {fig.labeled ? (
          <>
            <Line
              x1={c0[0]}
              y1={c0[1]}
              x2={page([r, 0, 0])[0]}
              y2={c0[1]}
              stroke={ink.point}
              strokeWidth={1.4}
            />
            {!cylinder ? (
              <Line x1={c0[0]} y1={c0[1]} x2={ch[0]} y2={ch[1]} {...hidden} stroke={ink.point} />
            ) : null}
            <Circle cx={c0[0]} cy={c0[1]} r={2.5} fill={ink.stroke} />
          </>
        ) : null}
      </>
    );
    // Under the rim's front edge: on its line it would sit on the dashed back arc.
    label('r', [(c0[0] + page([r, 0, 0])[0]) / 2, page([0, 0, -r])[1] + 17]);
    if (cylinder) {
      // h beside the RIGHT outline: of the two tangents, the one drawn further right.
      const side = (phi: number) => page([r * Math.cos(phi), 0, r * Math.sin(phi)])[0];
      const phi = side(from) > side(to) ? from : to;
      const right = page([r * Math.cos(phi), 0, r * Math.sin(phi)]);
      const rightTop = page([r * Math.cos(phi), h, r * Math.sin(phi)]);
      const x = Math.max(right[0], rightTop[0]);
      label('h', [x + 6, (right[1] + rightTop[1]) / 2], 'start');
    } else label('h', [ch[0] + 8, (c0[1] + ch[1]) / 2], 'start');
  }
  return (
    <Svg width={width} height={H}>
      {body}
      {labels}
    </Svg>
  );
}

/** Points along a rim as one open path, in angle order starting after `start`. */
function sortedArc(points: { phi: number; at: V3 }[], start: number) {
  const rel = (phi: number) => (((phi - start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return [...points].sort((a, b) => rel(a.phi) - rel(b.phi));
}

function pathOf(points: readonly V2[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(' ');
}

// ─────────────── cube nets ───────────────

function CubeNet({ fig, width }: { fig: CubeNetFigure; width: number }) {
  const { figure: ink } = useTheme();
  const cols = Math.max(...fig.cells.map((c) => c.col)) + 1;
  const rows = Math.max(...fig.cells.map((c) => c.row)) + 1;
  const minC = Math.min(...fig.cells.map((c) => c.col));
  const minR = Math.min(...fig.cells.map((c) => c.row));
  const spanC = cols - minC;
  const spanR = rows - minR;
  const cell = Math.min((width - 4) / spanC, (width * 0.8) / spanR, 64);
  const w = spanC * cell + 4;
  const h = spanR * cell + 4;
  return (
    <Svg width={w} height={h}>
      {Array.from({ length: spanC + 1 }, (_, i) => (
        <Line
          key={`c${i}`}
          x1={2 + i * cell}
          y1={2}
          x2={2 + i * cell}
          y2={h - 2}
          stroke={ink.grid}
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: spanR + 1 }, (_, i) => (
        <Line
          key={`r${i}`}
          x1={2}
          y1={2 + i * cell}
          x2={w - 2}
          y2={2 + i * cell}
          stroke={ink.grid}
          strokeWidth={1}
        />
      ))}
      {fig.cells.map((c, i) => (
        <Rect
          key={i}
          x={2 + (c.col - minC) * cell}
          y={2 + (c.row - minR) * cell}
          width={cell}
          height={cell}
          fill={ink.fill}
          stroke={ink.stroke}
          strokeWidth={1.6}
        />
      ))}
    </Svg>
  );
}

// ─────────────── 3D coordinates ───────────────

function Axes3d({ fig, width, t }: { fig: Axes3dFigure; width: number; t: T }) {
  const { figure: ink } = useTheme();
  // The school drawing: x₁ at 45°, one unit shortened to ½√2 — half a unit across and half
  // a unit down (the diagonal of a half grid square on Karopapier).
  const k = 0.5;
  const reach = fig.size + 0.7;
  const maxH = Math.min(320, width * 0.9);
  const u = Math.min((width - 44) / (reach * (1 + k)), (maxH - 30) / (reach * (1 + k)));
  // x₁ to the front (down-left), x₂ to the right, x₃ up.
  const ox = 22 + reach * k * u;
  const oy = 16 + reach * u;
  const at = (p: { x: number; y: number; z: number }): V2 => [
    ox - p.x * k * u + p.y * u,
    oy + p.x * k * u - p.z * u,
  ];
  const H = oy + reach * k * u + 18;
  const axes = [
    {
      name: t('figure.axis_1'),
      end: at({ x: reach, y: 0, z: 0 }),
      tick: (i: number) => at({ x: i, y: 0, z: 0 }),
    },
    {
      name: t('figure.axis_2'),
      end: at({ x: 0, y: reach, z: 0 }),
      tick: (i: number) => at({ x: 0, y: i, z: 0 }),
    },
    {
      name: t('figure.axis_3'),
      end: at({ x: 0, y: 0, z: reach }),
      tick: (i: number) => at({ x: 0, y: 0, z: i }),
    },
  ];
  const o = at({ x: 0, y: 0, z: 0 });
  const arrowHead = (from: V2, to: V2, size = 7) => {
    const ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const l: V2 = [to[0] - size * Math.cos(ang - 0.4), to[1] - size * Math.sin(ang - 0.4)];
    const r: V2 = [to[0] - size * Math.cos(ang + 0.4), to[1] - size * Math.sin(ang + 0.4)];
    return `M ${l[0]} ${l[1]} L ${to[0]} ${to[1]} L ${r[0]} ${r[1]}`;
  };
  const guide = { stroke: ink.label, strokeWidth: 1.1, strokeDasharray: '4 3' };
  const [first, second] = fig.points;
  return (
    <Svg width={width} height={H}>
      {axes.map((a, i) => (
        <G key={i}>
          <Line
            x1={o[0]}
            y1={o[1]}
            x2={a.end[0]}
            y2={a.end[1]}
            stroke={ink.axis}
            strokeWidth={1.4}
          />
          <Path d={arrowHead(o, a.end)} stroke={ink.axis} strokeWidth={1.4} fill="none" />
          {Array.from({ length: fig.size }, (_, n) => {
            const p = a.tick(n + 1);
            const dir: V2 = i === 2 ? [1, 0] : [0, 1];
            return (
              <G key={n}>
                <Line
                  x1={p[0] - 3 * dir[0]}
                  y1={p[1] - 3 * dir[1]}
                  x2={p[0] + 3 * dir[0]}
                  y2={p[1] + 3 * dir[1]}
                  stroke={ink.axis}
                  strokeWidth={1.2}
                />
                <SvgText
                  fontFamily={FAMILY}
                  x={i === 2 ? p[0] - 7 : i === 0 ? p[0] - 8 : p[0]}
                  y={i === 2 ? p[1] + 4 : i === 0 ? p[1] + 4 : p[1] + 15}
                  fontSize={10.5}
                  fill={ink.label}
                  textAnchor={i === 1 ? 'middle' : 'end'}
                >
                  {n + 1}
                </SvgText>
              </G>
            );
          })}
          <SvgText
            fontFamily={FAMILY}
            x={a.end[0] + (i === 0 ? -6 : i === 1 ? 0 : 8)}
            y={a.end[1] + (i === 0 ? 14 : i === 1 ? -8 : 4)}
            fontSize={13}
            fontWeight="600"
            fill={ink.stroke}
            textAnchor={i === 0 ? 'end' : i === 1 ? 'end' : 'start'}
          >
            {a.name}
          </SvgText>
        </G>
      ))}
      {fig.points.map((p) => {
        const [a, b, c, d] = [
          at({ x: p.at.x, y: 0, z: 0 }),
          at({ x: p.at.x, y: p.at.y, z: 0 }),
          at(p.at),
          o,
        ];
        return (
          <G key={p.name}>
            <Path
              d={`M ${d[0]} ${d[1]} L ${a[0]} ${a[1]} L ${b[0]} ${b[1]} L ${c[0]} ${c[1]}`}
              fill="none"
              {...guide}
            />
          </G>
        );
      })}
      {fig.arrow && first && second
        ? (() => {
            const [a, b] = [at(first.at), at(second.at)];
            return (
              <G>
                <Line
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={ink.point}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
                <Path
                  d={arrowHead(a, b, 10)}
                  stroke={ink.point}
                  strokeWidth={2.4}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </G>
            );
          })()
        : null}
      {fig.points.map((p) => {
        const c = at(p.at);
        return (
          <G key={`p${p.name}`}>
            <Circle
              cx={c[0]}
              cy={c[1]}
              r={4.5}
              fill={ink.point}
              stroke={ink.paper}
              strokeWidth={1.5}
            />
            <SvgText
              fontFamily={FAMILY}
              x={c[0] + 8}
              y={c[1] - 7}
              fontSize={14}
              fontWeight="700"
              fill={ink.point}
            >
              {p.name}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─────────────── the switch and the words ───────────────

export type VisualFigure =
  | ClockFigure
  | MoneyFigure
  | DotFieldFigure
  | BaseTenFigure
  | SolidFigure
  | CubeNetFigure
  | Axes3dFigure;

export function VisualBody({ figure, width, t }: { figure: VisualFigure; width: number; t: T }) {
  switch (figure.type) {
    case 'clock':
      return <ClockPicture fig={figure} width={width} />;
    case 'money':
      return <MoneyPicture fig={figure} width={width} />;
    case 'dot_field':
      return <DotField fig={figure} width={width} />;
    case 'base_ten':
      return <BaseTen fig={figure} width={width} t={t} />;
    case 'solid':
      return <SolidPicture fig={figure} width={width} />;
    case 'cube_net':
      return <CubeNet fig={figure} width={width} />;
    case 'axes3d':
      return <Axes3d fig={figure} width={width} t={t} />;
  }
}

/**
 * What a screen reader hears. It describes the DRAWING — where the hands stand, which pieces lie
 * there, how the counters fill the rows — so reading it off stays the task wherever that is
 * possible in words.
 */
export function describeVisual(figure: VisualFigure, t: T): string {
  switch (figure.type) {
    case 'clock': {
      const h = figure.hour % 12 === 0 ? 12 : figure.hour % 12;
      const next = h === 12 ? 1 : h + 1;
      const mark = figure.minute / 5;
      return t('figure.clock', {
        hour: h,
        next,
        minute: Number.isInteger(mark) ? (mark === 0 ? 12 : mark) : num(mark),
      });
    }
    case 'money':
      return t('figure.money', { list: figure.pieces.map(pieceText).join(', ') });
    case 'dot_field': {
      const rows = Array.from({ length: figure.size / 10 }, (_, r) =>
        Math.max(0, Math.min(10, figure.filled - r * 10)),
      );
      return t(figure.size === 20 ? 'figure.field_20' : 'figure.field_100', {
        rows: rows.filter((n) => n > 0).join(', ') || '0',
      });
    }
    case 'base_ten':
      return figure.look === 'blocks'
        ? t('figure.blocks', { hundreds: figure.hundreds, tens: figure.tens, ones: figure.ones })
        : t('figure.place_chart', {
            list: PLACES.filter((p, i) => i > 0 || figure.thousands > 0)
              .map((p) => `${t(`figure.place_${p}`)} ${figure[p]}`)
              .join(', '),
          });
    case 'solid': {
      const name = t(`figure.solid_${figure.solid}`);
      if (!figure.labeled) return t('figure.solid', { name });
      return t('figure.solid_labeled', {
        name,
        list: figure.dims.map((d) => `${d.name} = ${num(d.value)} ${figure.unit}`).join(', '),
      });
    }
    case 'cube_net': {
      const minR = Math.min(...figure.cells.map((c) => c.row));
      const minC = Math.min(...figure.cells.map((c) => c.col));
      const rows = new Map<number, number[]>();
      for (const c of figure.cells)
        rows.set(c.row - minR, [...(rows.get(c.row - minR) ?? []), c.col - minC + 1]);
      return t('figure.cube_net', {
        list: [...rows.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([r, cols]) =>
            t('figure.net_row', { row: r + 1, cols: cols.sort((a, b) => a - b).join(', ') }),
          )
          .join('; '),
      });
    }
    case 'axes3d':
      return (
        t('figure.axes3d', {
          list: figure.points
            .map((p) =>
              t('figure.space_path', {
                name: p.name,
                x: p.at.x,
                y: p.at.y,
                z: p.at.z,
                a1: t('figure.axis_1'),
                a2: t('figure.axis_2'),
                a3: t('figure.axis_3'),
              }),
            )
            .join('; '),
        }) + (figure.arrow ? `. ${t('figure.arrow')}` : '')
      );
  }
}
