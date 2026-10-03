// Primary-school figures next to a question (issue #254): an analog clock (or two, for a span),
// euro coins and notes, a Zwanzigerfeld or Hunderterfeld, base-ten blocks. The model only sends
// data (packages/shared-types/src/contracts/figure.ts); the hands are placed by the same
// arithmetic the API reads the key with (`handAngles`, packages/shared-math/src/primary.ts), so
// the clock she reads is the clock the key was computed from.
//
// Library check (Engineering-Regel 1, tools/guards/drawing-registry.json): nothing fits. The one
// maintained clock (react-clock, MIT) renders DOM only; the React Native clocks
// (react-native-analog-clock, react-native-clock-analog) are live wall clocks without a release
// since 2022, and none draws a given time from checked data. For coins, ten-frames and base-ten
// blocks there is no package at all. So it is react-native-svg, which the app already ships.
//
// Money is a schematic on purpose — round coins with their value, paper notes in the tints a
// child knows — never a picture of a real banknote. Colour is never the only signal: every coin
// and note carries its value, the two hands differ in length and width, the second colour of a
// dot field is a second run of dots, and the screen-reader text says what the drawing shows
// (`describePrimary`) without saying what a question asks her to read off it.

import type { PrimaryFigure } from '@learnbuddy/shared-types/contracts';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

// Imported by path, like charts.ts: the mobile bundle takes only this dependency-free module.
import {
  fieldSize,
  handAngles,
  isCoin,
  MONEY_CENTS,
  type ClockFace,
  type MoneyPiece,
} from '../../../../packages/shared-math/src/primary.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, FONT, HaloText, SMALL } from './figureText.js';

type ClockFig = Extract<PrimaryFigure, { type: 'clock' }>;
type MoneyFig = Extract<PrimaryFigure, { type: 'money' }>;
type DotFig = Extract<PrimaryFigure, { type: 'dot_field' }>;
type BaseTenFig = Extract<PrimaryFigure, { type: 'base_ten' }>;
type T = (key: string, values?: Record<string, string | number>) => string;

export function PrimaryBody({ figure, width }: { figure: PrimaryFigure; width: number }) {
  switch (figure.type) {
    case 'clock':
      return <Clocks fig={figure} width={width} />;
    case 'money':
      return <MoneyView fig={figure} width={width} />;
    case 'dot_field':
      return <DotFieldView fig={figure} width={width} />;
    case 'base_ten':
      return <BaseTenView fig={figure} width={width} />;
  }
}

// ─────────────── flow layout (money, blocks) ───────────────

type Box = { w: number; h: number; gap: number };
type Placed = { x: number; y: number };

/**
 * Places boxes left to right and wraps them into rows that fit `width`, each row centred and
 * every box centred vertically in its row. `gap` is the room before a box in its row.
 */
function flow(boxes: Box[], width: number, rowGap: number): { at: Placed[]; height: number } {
  const rows: { items: number[]; w: number; h: number }[] = [];
  boxes.forEach((b, i) => {
    const row = rows[rows.length - 1];
    if (row && row.w + b.gap + b.w <= width) {
      row.items.push(i);
      row.w += b.gap + b.w;
      row.h = Math.max(row.h, b.h);
    } else rows.push({ items: [i], w: b.w, h: b.h });
  });
  const at: Placed[] = [];
  let y = 0;
  for (const row of rows) {
    let x = (width - row.w) / 2;
    row.items.forEach((i, k) => {
      const b = boxes[i] as Box;
      if (k > 0) x += b.gap;
      at[i] = { x, y: y + (row.h - b.h) / 2 };
      x += b.w;
    });
    y += row.h + rowGap;
  }
  return { at, height: Math.max(0, y - rowGap) };
}

// ─────────────── clock ───────────────

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;

function ClockFaceView({
  time,
  cx,
  cy,
  d,
}: {
  time: ClockFace;
  cx: number;
  cy: number;
  d: number;
}) {
  const { figure: ink } = useTheme();
  const r = d / 2 - 2;
  const { hour, minute } = handAngles(time);
  const at = (deg: number, len: number) => ({
    x: cx + len * Math.cos(rad(deg)),
    y: cy + len * Math.sin(rad(deg)),
  });
  const num = Math.max(SMALL, Math.round(d * 0.09));
  // A small face (an answer option, two clocks side by side) keeps 12, 3, 6 and 9: twelve
  // numbers at the smallest readable size would touch each other there.
  const numerals = d < 160 ? [12, 3, 6, 9] : [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const hourTip = at(hour, r * 0.5);
  // The long hand reaches the minute track, past the numbers, so it points at a minute.
  const minuteTip = at(minute, r * 0.9);
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={ink.paper} stroke={ink.stroke} strokeWidth={2.5} />
      {Array.from({ length: 60 }, (_, i) => {
        const five = i % 5 === 0;
        const a = at(i * 6, r - 2);
        const b = at(i * 6, r - (five ? r * 0.12 : r * 0.06));
        return (
          <Line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={five ? ink.stroke : ink.label}
            strokeWidth={five ? 2 : 1}
          />
        );
      })}
      <Line
        x1={cx}
        y1={cy}
        x2={hourTip.x}
        y2={hourTip.y}
        stroke={ink.stroke}
        strokeWidth={Math.max(4, d * 0.04)}
        strokeLinecap="round"
      />
      <Line
        x1={cx}
        y1={cy}
        x2={minuteTip.x}
        y2={minuteTip.y}
        stroke={ink.point}
        strokeWidth={Math.max(2.5, d * 0.022)}
        strokeLinecap="round"
      />
      {/* The numbers over the hands, on a paper halo: a hand never hides the 9 it points at. */}
      {numerals.map((n) => {
        const p = at(n * 30, r * 0.7);
        return (
          <HaloText
            key={n}
            x={p.x}
            y={p.y + num * 0.36}
            size={num}
            color={ink.stroke}
            anchor="middle"
            text={String(n)}
          />
        );
      })}
      <Circle cx={cx} cy={cy} r={Math.max(3.5, d * 0.03)} fill={ink.stroke} />
    </G>
  );
}

function Clocks({ fig, width }: { fig: ClockFig; width: number }) {
  const { figure: ink } = useTheme();
  if (fig.c.length === 1) {
    const d = Math.min(width, 184);
    return (
      <Svg width={d} height={d}>
        <ClockFaceView time={fig.c[0] as ClockFace} cx={d / 2} cy={d / 2} d={d} />
      </Svg>
    );
  }
  // Two clocks for a span: from the left one to the right one, an arrow between them.
  const arrow = 28;
  const d = Math.min((width - arrow) / 2, 150);
  const w = 2 * d + arrow;
  const y = d / 2;
  return (
    <Svg width={w} height={d}>
      <ClockFaceView time={fig.c[0] as ClockFace} cx={d / 2} cy={y} d={d} />
      <Path
        d={`M ${d + 6} ${y} L ${d + arrow - 6} ${y} M ${d + arrow - 12} ${y - 6} L ${d + arrow - 6} ${y} L ${d + arrow - 12} ${y + 6}`}
        stroke={ink.axis}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <ClockFaceView time={fig.c[1] as ClockFace} cx={d + arrow + d / 2} cy={y} d={d} />
    </Svg>
  );
}

// ─────────────── money ───────────────

/** Coin diameters in mm (the real ones), so a 2 € coin is bigger than a 1 € coin, as in a hand. */
const COIN_MM: Partial<Record<MoneyPiece, number>> = {
  '1ct': 16.25,
  '2ct': 18.75,
  '5ct': 21.25,
  '10ct': 19.75,
  '20ct': 22.25,
  '50ct': 24.25,
  '1€': 23.25,
  '2€': 25.75,
};
/** The note tints as an index into the figure's `slices` (grey, red, blue, orange, green, yellow). */
const NOTE_TINT: Partial<Record<MoneyPiece, number>> = {
  '5€': 6,
  '10€': 4,
  '20€': 1,
  '50€': 3,
  '100€': 2,
  '200€': 5,
};
const NOTE = { w: 96, h: 52 };

/** "2 €", "50 ct": what is printed on the piece. */
function pieceLabel(d: MoneyPiece): string {
  const cents = MONEY_CENTS[d];
  return cents < 100 ? `${cents} ct` : `${cents / 100} €`;
}

function Coin({ d, x, y, size }: { d: MoneyPiece; x: number; y: number; size: number }) {
  const { figure: ink } = useTheme();
  const [copper, brass, silver] = ink.coins;
  const cents = MONEY_CENTS[d];
  const outer = cents === 200 ? silver : cents === 100 ? brass : cents < 10 ? copper : brass;
  const inner = cents === 200 ? brass : cents === 100 ? silver : outer;
  const r = size / 2;
  return (
    <G>
      <Circle
        cx={x + r}
        cy={y + r}
        r={r - 1}
        fill={outer}
        stroke={ink.gridStrong}
        strokeWidth={1.5}
      />
      <Circle cx={x + r} cy={y + r} r={r * 0.72} fill={inner} stroke={ink.grid} strokeWidth={1} />
      <SvgText
        x={x + r}
        y={y + r + 4.5}
        fontFamily={FAMILY}
        fontSize={cents < 100 ? SMALL : FONT}
        fontWeight="700"
        fill={ink.stroke}
        textAnchor="middle"
      >
        {pieceLabel(d)}
      </SvgText>
    </G>
  );
}

function Note({ d, x, y }: { d: MoneyPiece; x: number; y: number }) {
  const { figure: ink } = useTheme();
  const tint = ink.slices[NOTE_TINT[d] ?? 0] ?? ink.fill;
  return (
    <G>
      <Rect
        x={x}
        y={y}
        width={NOTE.w}
        height={NOTE.h}
        rx={6}
        fill={tint}
        stroke={ink.gridStrong}
        strokeWidth={1.5}
      />
      <Rect
        x={x + 5}
        y={y + 5}
        width={NOTE.w - 10}
        height={NOTE.h - 10}
        rx={3}
        fill="none"
        stroke={ink.grid}
        strokeWidth={1}
      />
      <SvgText
        x={x + NOTE.w / 2}
        y={y + NOTE.h / 2 + 6}
        fontFamily={FAMILY}
        // token-exempt: the value on a note, as large as the note carries it (96 × 52 px)
        fontSize={18}
        fontWeight="700"
        fill={ink.stroke}
        textAnchor="middle"
      >
        {pieceLabel(d)}
      </SvgText>
    </G>
  );
}

/** A coin's drawn size: 40 px for 1 ct, growing with its real diameter (2 € ≈ 59 px). */
const coinSize = (d: MoneyPiece) => 40 + ((COIN_MM[d] ?? 16.25) - 16.25) * 2;

function MoneyView({ fig, width }: { fig: MoneyFig; width: number }) {
  // Notes first, then coins, each from the largest value down: the way one counts money.
  const pieces = [...fig.p]
    .sort((a, b) => MONEY_CENTS[b.d] - MONEY_CENTS[a.d])
    .flatMap((p) => Array.from({ length: p.n }, () => p.d));
  const boxes = pieces.map((d, i) => {
    const prev = pieces[i - 1];
    const gap = prev === undefined ? 0 : prev === d ? 6 : 12;
    return isCoin(d) ? { w: coinSize(d), h: coinSize(d), gap } : { ...NOTE, gap };
  });
  const { at, height } = flow(boxes, width, 10);
  return (
    <Svg width={width} height={height + 2}>
      {pieces.map((d, i) => {
        const p = at[i] as Placed;
        return isCoin(d) ? (
          <Coin key={i} d={d} x={p.x} y={p.y + 1} size={coinSize(d)} />
        ) : (
          <Note key={i} d={d} x={p.x} y={p.y + 1} />
        );
      })}
    </Svg>
  );
}

// ─────────────── Zwanzigerfeld, Hunderterfeld ───────────────

function DotFieldView({ fig, width }: { fig: DotFig; width: number }) {
  const { figure: ink } = useTheme();
  const rows = fig.field === 'twenty' ? 2 : 10;
  // The gap after five, in both directions: the "Kraft der Fünf" a child sees at a glance.
  const five = 6;
  const cell = Math.min((width - 4 - five) / 10, fig.field === 'twenty' ? 26 : 22);
  const w = 10 * cell + five + 4;
  const h = rows * cell + (rows > 5 ? five : 0) + 4;
  const pos = (i: number) => (i >= 5 ? five : 0) + i * cell + 2;
  const [first = 0, second = 0] = fig.n;
  const colour = (k: number) =>
    k < first ? ink.series[0] : k < first + second ? ink.warm : undefined;
  const size = fieldSize(fig);
  return (
    <Svg width={w} height={h}>
      {Array.from({ length: size }, (_, k) => {
        const row = Math.floor(k / 10);
        const col = k % 10;
        const x = pos(col);
        const y = rows > 5 ? pos(row) : row * cell + 2;
        const fill = colour(k);
        return (
          <G key={k}>
            <Rect
              x={x}
              y={y}
              width={cell}
              height={cell}
              fill={ink.paper}
              stroke={ink.gridStrong}
              strokeWidth={1}
            />
            {fill ? (
              <Circle cx={x + cell / 2} cy={y + cell / 2} r={cell * 0.36} fill={fill} />
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}

// ─────────────── base-ten blocks ───────────────

/** A unit cube's edge in px, largest first (`BaseTenView` takes the biggest that fits). */
const UNITS = [10, 9, 8, 7, 6] as const;

type Kind = 'plate' | 'rod' | 'cube';

function Blocks({ kind, x, y, u }: { kind: Kind; x: number; y: number; u: number }) {
  const { figure: ink } = useTheme();
  const cols = kind === 'plate' ? 10 : 1;
  const rows = kind === 'cube' ? 1 : 10;
  const grid = (key: string, x1: number, y1: number, x2: number, y2: number) => (
    <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink.gridStrong} strokeWidth={0.75} />
  );
  return (
    <G>
      <Rect x={x} y={y} width={cols * u} height={rows * u} fill={ink.fill} />
      {Array.from({ length: cols - 1 }, (_, i) =>
        grid(`c${i}`, x + (i + 1) * u, y, x + (i + 1) * u, y + rows * u),
      )}
      {Array.from({ length: rows - 1 }, (_, i) =>
        grid(`r${i}`, x, y + (i + 1) * u, x + cols * u, y + (i + 1) * u),
      )}
      <Rect
        x={x}
        y={y}
        width={cols * u}
        height={rows * u}
        fill="none"
        stroke={ink.stroke}
        strokeWidth={1.25}
      />
    </G>
  );
}

/**
 * Plates, then rods, then cubes in stacks of five (like the ones on a Stellenwerttafel): three
 * groups with more room between them than inside, so the bundles read as bundles.
 */
function blockLayout(fig: BaseTenFig, u: number, width: number) {
  const kinds: Kind[] = [];
  const boxes: Box[] = [];
  const add = (kind: Kind, n: number, w: number, inner: number) => {
    for (let i = 0; i < n; i++) {
      kinds.push(kind);
      boxes.push({ w, h: 10 * u, gap: boxes.length === 0 ? 0 : i === 0 ? SPACE.lg : inner });
    }
  };
  add('plate', fig.h, 10 * u, SPACE.sm);
  add('rod', fig.t, u, SPACE.xs);
  const stacks = Array.from({ length: Math.ceil(fig.o / 5) }, (_, c) => Math.min(5, fig.o - 5 * c));
  add('cube', stacks.length, u, SPACE.xs);
  return { kinds, stacks, rows: flow(boxes, width, SPACE.md) };
}

function BaseTenView({ fig, width }: { fig: BaseTenFig; width: number }) {
  // The largest cube at which everything stands in one row; else in two; else the smallest.
  const fits = (rowCount: number) =>
    UNITS.find((c) => blockLayout(fig, c, width).rows.height <= rowCount * (10 * c + SPACE.md));
  const u = fits(1) ?? fits(2) ?? UNITS[4];
  const { kinds, stacks, rows } = blockLayout(fig, u, width);
  let stack = 0;
  return (
    <Svg width={width} height={rows.height + 2}>
      {kinds.map((kind, i) => {
        const p = rows.at[i] as Placed;
        if (kind !== 'cube') return <Blocks key={i} kind={kind} x={p.x} y={p.y + 1} u={u} />;
        const n = stacks[stack++] ?? 0;
        return (
          <G key={i}>
            {Array.from({ length: n }, (_, k) => (
              <Blocks key={k} kind="cube" x={p.x} y={p.y + 1 + (9 - k) * u - k} u={u} />
            ))}
          </G>
        );
      })}
    </Svg>
  );
}

// ─────────────── description for screen readers ───────────────

/**
 * What the drawing shows, in words: where the hands stand (not the time they make), which pieces
 * of money lie there (not their sum), how many dots and blocks — the same content a sighted child
 * reads off, so the question can be answered without seeing it, and nothing it asks for.
 */
export function describePrimary(fig: PrimaryFigure, t: T): string {
  switch (fig.type) {
    case 'clock': {
      const faces = fig.c.map((c) => describeClock(c, t));
      if (faces.length === 1) return t('figure.clock', { hands: faces[0] ?? '' });
      return t('figure.clock_span', { from: faces[0] ?? '', to: faces[1] ?? '' });
    }
    case 'money': {
      const list = [...fig.p]
        .sort((a, b) => MONEY_CENTS[b.d] - MONEY_CENTS[a.d])
        .map((p) => {
          const cents = MONEY_CENTS[p.d];
          const value =
            cents < 100 ? t('figure.cent', { n: cents }) : t('figure.euro', { n: cents / 100 });
          return t(isCoin(p.d) ? 'figure.coins' : 'figure.notes', { count: p.n, value });
        });
      return t('figure.money', { list: list.join(', ') });
    }
    case 'dot_field': {
      const [first = 0, second] = fig.n;
      const parts = [t('figure.dots', { count: first })];
      if (second !== undefined) parts.push(t('figure.dots_then', { count: second }));
      return t('figure.dot_field', {
        field: t(fig.field === 'twenty' ? 'figure.field_twenty' : 'figure.field_hundred'),
        list: parts.join(', '),
      });
    }
    case 'base_ten': {
      const parts = [
        fig.h > 0 ? t('figure.plates', { count: fig.h }) : null,
        fig.t > 0 ? t('figure.rods', { count: fig.t }) : null,
        fig.o > 0 ? t('figure.cubes', { count: fig.o }) : null,
      ].filter((p): p is string => p !== null);
      return t('figure.base_ten', { list: parts.join(', ') });
    }
  }
}

/** "der kleine Zeiger zwischen 7 und 8, der große auf der 9". */
function describeClock(time: ClockFace, t: T): string {
  const dial = (n: number) => ((n + 11) % 12) + 1;
  const h = time.h % 12;
  const hour =
    time.m === 0
      ? t('figure.hand_on', { n: dial(h) })
      : t('figure.hand_between', { a: dial(h), b: dial(h + 1) });
  const step = Math.floor(time.m / 5);
  const ticks = time.m % 5;
  const minute =
    ticks === 0
      ? t('figure.hand_on', { n: dial(step) })
      : t('figure.hand_after', { count: ticks, n: dial(step) });
  return t('figure.hands', { hour, minute });
}
