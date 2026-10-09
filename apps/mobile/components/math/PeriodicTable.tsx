// The periodic table (issue #250): the main groups I–VIII (years 7–10) or all 18 groups (upper
// school), the marked elements filled, and the staircase line between the metals and the rest.
// Nothing here decides anything — every element, its place and its facts come from
// packages/shared-math/src/periodic.ts, the same code that checked the figure on the server, so
// the app draws exactly what was checked. The full table's cells are small on a phone; a tap
// opens it full screen to zoom (ZoomableFigure). `describePeriodic` says in words what it shows.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import type { ReactNode } from 'react';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

// Imported by path, like trees.js in TreeFigures: dependency-free, no mathjs in the bundle.
import {
  cellOf,
  element,
  MAIN_GROUP_NAMES,
  mainGroup,
  TABLE_SIZE,
  tableCells,
  type ChemElement,
  type TableVariant,
} from '../../../../packages/shared-math/src/periodic.js';
import type { Translate } from '../../lib/i18n/index.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, formatNumber, SMALL } from './figureText.js';

type PeriodicFig = Extract<Figure, { type: 'periodic_table' }>;

/** Room for the period numbers at the left and the group names on top. */
const SIDE = 14;
const HEAD = 16;
/** A cell never grows past this, so the main-group table stays a table, not a poster. */
const MAX_CELL = 46;

/** The group as the drawn table names it: I–VIII over the main groups, 1–18 over the full one. */
function groupName(e: ChemElement, v: TableVariant): string {
  if (v === 'full') return String(e.group ?? '');
  return MAIN_GROUP_NAMES[(mainGroup(e.group) ?? 1) - 1] ?? '';
}

/** A centred text in the table's font. */
function Txt(p: {
  x: number;
  y: number;
  size: number;
  color: string;
  bold?: boolean;
  text: string;
}) {
  return (
    <SvgText
      fontFamily={FAMILY}
      x={p.x}
      y={p.y}
      fontSize={p.size}
      fontWeight={p.bold ? '700' : '400'}
      fill={p.color}
      textAnchor="middle"
    >
      {p.text}
    </SvgText>
  );
}

/** One cell: the symbol, and the atomic number above it where the cell has room. */
function CellText({ e, x, y, size }: { e: ChemElement; x: number; y: number; size: number }) {
  const { figure: ink } = useTheme();
  const cx = x + size / 2;
  if (size < 28) {
    const fs = Math.round(size * 0.48);
    return <Txt x={cx} y={y + size / 2 + fs * 0.36} size={fs} color={ink.stroke} text={e.sym} />;
  }
  const fs = Math.round(size * 0.42);
  const small = Math.round(size * 0.26);
  return (
    <G>
      <Txt x={cx} y={y + small + 1} size={small} color={ink.label} text={String(e.z)} />
      <Txt x={cx} y={y + size - fs * 0.38} size={fs} color={ink.stroke} bold text={e.sym} />
    </G>
  );
}

const massText = (e: ChemElement) => formatNumber(Math.round(e.mass * 100) / 100);

/**
 * The asked element's cell, magnified, in the table's empty gap — as the key a school table
 * prints: atomic number and mass next to the symbol. The cells are too small for the mass on a
 * phone, and a question about neutrons needs it.
 */
function Detail({ e, x, y, w, h }: { e: ChemElement; x: number; y: number; w: number; h: number }) {
  const { figure: ink } = useTheme();
  const fs = Math.min(20, Math.round(h * 0.6));
  const small = Math.min(SMALL, Math.max(9, Math.round(h * 0.36)));
  const right = x + w * 0.68;
  return (
    <G>
      <Rect
        x={x + 1}
        y={y + 1}
        width={w - 2}
        height={h - 2}
        rx={4}
        fill={ink.fill}
        stroke={ink.point}
        strokeWidth={2}
      />
      <Txt
        x={x + w * 0.3}
        y={y + h / 2 + fs * 0.36}
        size={fs}
        color={ink.stroke}
        bold
        text={e.sym}
      />
      <Txt x={right} y={y + h / 2 - 2} size={small} color={ink.stroke} text={String(e.z)} />
      <Txt x={right} y={y + h / 2 + small} size={small} color={ink.stroke} text={massText(e)} />
    </G>
  );
}

/** Where the magnified cell goes: the empty gap over the middle of the table. */
const DETAIL: Record<TableVariant, { col: number; span: number; w: number; h: number }> = {
  main: { col: 1, span: 6, w: 3, h: 1 },
  full: { col: 2, span: 10, w: 6, h: 2 },
};

export function PeriodicBody({ figure, width }: { figure: PeriodicFig; width: number }) {
  const { figure: ink } = useTheme();
  const { cols, rows } = TABLE_SIZE[figure.v];
  const size = Math.min(MAX_CELL, Math.floor((width - SIDE) / cols));
  const left = Math.max(SIDE, Math.floor((width - cols * size) / 2));
  const marked = new Set(figure.hl);
  const cells = tableCells(figure.v);
  const isMetal = new Map(cells.map((c) => [`${c.col},${c.row}`, c.e.cls === 'metal']));
  const at = (col: number, row: number) => ({ x: left + col * size, y: HEAD + row * size });

  const parts: ReactNode[] = [];
  for (const c of cells) {
    const { x, y } = at(c.col, c.row);
    const on = marked.has(c.e.sym);
    parts.push(
      <Rect
        key={`c${c.e.z}`}
        x={x}
        y={y}
        width={size}
        height={size}
        fill={on ? ink.fill : c.e.cls === 'metal' ? ink.paper : ink.fillSoft}
        stroke={ink.gridStrong}
        strokeWidth={1}
      />,
      <CellText key={`t${c.e.z}`} e={c.e} x={x} y={y} size={size} />,
    );
  }
  // The marked cells' frames on top, so a neighbour's hairline never cuts through one.
  for (const c of cells) {
    if (!marked.has(c.e.sym)) continue;
    const { x, y } = at(c.col, c.row);
    parts.push(
      <Rect
        key={`m${c.e.z}`}
        x={x + 1}
        y={y + 1}
        width={size - 2}
        height={size - 2}
        fill="none"
        stroke={ink.point}
        strokeWidth={2}
      />,
    );
  }
  // The staircase: every edge between a metal and a metalloid or nonmetal next to it.
  cells.forEach((c) => {
    const { x, y } = at(c.col, c.row);
    const right = isMetal.get(`${c.col + 1},${c.row}`);
    const below = isMetal.get(`${c.col},${c.row + 1}`);
    const metal = c.e.cls === 'metal';
    if (right !== undefined && right !== metal) {
      parts.push(
        <Line
          key={`r${c.e.z}`}
          x1={x + size}
          y1={y}
          x2={x + size}
          y2={y + size}
          stroke={ink.stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
        />,
      );
    }
    if (below !== undefined && below !== metal) {
      parts.push(
        <Line
          key={`b${c.e.z}`}
          x1={x}
          y1={y + size}
          x2={x + size}
          y2={y + size}
          stroke={ink.stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
        />,
      );
    }
  });
  // Group names and period numbers: as large as the cells allow, never larger than a figure label.
  const headSize = Math.min(SMALL - 1, Math.max(7, Math.round(size * 0.42)));
  // The element a question is about, magnified in the gap over the middle of the table.
  const asked = element(figure.at);
  if (asked) {
    const d = DETAIL[figure.v];
    const { x, y } = at(d.col + (d.span - d.w) / 2, 0);
    parts.push(
      <Detail key="detail" e={asked} x={x + 2} y={y + 2} w={d.w * size - 4} h={d.h * size - 4} />,
    );
  }
  const label = (key: string, x: number, y: number, text: string) => (
    <SvgText
      key={key}
      fontFamily={FAMILY}
      x={x}
      y={y}
      fontSize={headSize}
      fill={ink.axis}
      textAnchor="middle"
    >
      {text}
    </SvgText>
  );
  for (let col = 0; col < cols; col++) {
    const name = figure.v === 'main' ? (MAIN_GROUP_NAMES[col] ?? '') : String(col + 1);
    parts.push(label(`g${col}`, at(col, 0).x + size / 2, HEAD - 5, name));
  }
  for (let row = 0; row < rows; row++) {
    parts.push(label(`p${row}`, left - SIDE / 2, at(0, row).y + size / 2 + 4, String(row + 1)));
  }
  return (
    <Svg width={width} height={HEAD + rows * size + 2}>
      {parts}
    </Svg>
  );
}

/**
 * The table in words: which table, the staircase, and every marked element with what its cell
 * shows — atomic number, mass, group and period. The class of an element is not said: on the
 * drawing it is the side of the staircase, which is what a question about it practises.
 */
export function describePeriodic(figure: PeriodicFig, t: Translate): string {
  const parts = [t(figure.v === 'main' ? 'figure.periodic_main' : 'figure.periodic_full')];
  parts.push(t('figure.periodic_stair'));
  for (const sym of figure.hl) {
    const e = element(sym);
    if (!e || cellOf(e, figure.v) === null) continue;
    parts.push(
      t('figure.periodic_marked', {
        sym: e.sym,
        z: e.z,
        mass: massText(e),
        group: groupName(e, figure.v),
        period: e.period,
      }),
    );
  }
  return parts.join('. ');
}
