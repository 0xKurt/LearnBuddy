// Where things stand in the library figures (issues #250, #261), and what a tap there means.
// Pure arithmetic, tested in `__tests__/library.test.ts`; the drawing is in
// components/practice/figure/LibraryFigures.tsx.

import {
  ELEMENTS,
  elementId,
  tableGroups,
  tablePeriods,
  type Circuit,
  type CircuitPart,
  type ElementFacts,
  type LogicNet,
  type PeriodicTableKind,
} from '@learnbuddy/shared-types/contracts';

// ─────────────── the periodic table ───────────────

/** The row of group numbers above the table and the column of period numbers left of it. */
export const PT_HEAD = 18;
export const PT_SIDE = 16;
/** A cell is never taller than this (a taller one only stretches) nor shorter than this. */
const CELL_H_MAX = 54;
const CELL_H_MIN = 34;
/** Cells narrower than this are magnified on the first tap (the full table on a phone). */
export const PT_TAP_MIN = 36;

export type PtCell = { e: ElementFacts; id: string; x: number; y: number; w: number; h: number };

export type PtFrame = {
  width: number;
  height: number;
  /** The columns shown, as indexes into the table's groups (all of them, or a magnified window). */
  c0: number;
  c1: number;
  cellW: number;
  cellH: number;
  groups: readonly number[];
  periods: number;
  cells: PtCell[];
};

export function periodicFrame(
  table: PeriodicTableKind,
  width: number,
  maxHeight: number,
  window: { c0: number; c1: number } | null = null,
): PtFrame {
  const groups = tableGroups(table);
  const periods = tablePeriods(table);
  const c0 = window?.c0 ?? 0;
  const c1 = window?.c1 ?? groups.length;
  const cols = c1 - c0;
  const cellW = (width - PT_SIDE) / cols;
  const cellH = Math.max(
    CELL_H_MIN,
    Math.min(CELL_H_MAX, cellW * 1.25, (maxHeight - PT_HEAD) / periods),
  );
  const cells: PtCell[] = [];
  for (const e of ELEMENTS) {
    const col = groups.indexOf(e.group);
    if (col < c0 || col >= c1 || e.period > periods) continue;
    cells.push({
      e,
      id: elementId(e),
      x: PT_SIDE + (col - c0) * cellW,
      y: PT_HEAD + (e.period - 1) * cellH,
      w: cellW,
      h: cellH,
    });
  }
  return {
    width,
    height: PT_HEAD + periods * cellH,
    c0,
    c1,
    cellW,
    cellH,
    groups,
    periods,
    cells,
  };
}

/** Does a tap on this frame need a magnified look first? */
export function periodicNeedsZoom(f: PtFrame): boolean {
  return f.cellW < PT_TAP_MIN;
}

/** The columns to magnify around a tap at x: as many as hold a finger each. */
export function periodicZoom(f: PtFrame, x: number): { c0: number; c1: number } {
  const n = f.groups.length;
  const fit = Math.max(4, Math.floor((f.width - PT_SIDE) / (PT_TAP_MIN + 6)));
  const at = f.c0 + Math.floor((x - PT_SIDE) / f.cellW);
  const c0 = Math.min(n - fit, Math.max(0, at - Math.floor(fit / 2)));
  return { c0, c1: Math.min(n, c0 + fit) };
}

/** The element under a tap, or null on an empty cell or a label. */
export function cellAt(f: PtFrame, x: number, y: number): PtCell | null {
  return f.cells.find((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) ?? null;
}

// ─────────────── the colour wheel ───────────────

/** Which of the twelve fields (0 = yellow at the top, clockwise) a tap is in, or null in the middle. */
export function wheelFieldAt(size: number, x: number, y: number, hole: number): number | null {
  const c = size / 2;
  const r = Math.hypot(x - c, y - c);
  if (r < hole || r > c) return null;
  const angle = Math.atan2(x - c, c - y); // 0 at the top, clockwise
  const turn = (angle / (2 * Math.PI) + 1 + 1 / 24) % 1;
  return Math.floor(turn * 12) % 12;
}

/** A colour's name split into the lines a field holds: "Blau|violett" → ["Blau", "violett"]. */
export function wheelLines(name: string): string[] {
  return name.split('|').map((s) => s.trim());
}

/** The same name as one word for a sentence: "Blau|violett" → "Blauviolett", "azul |violáceo" → "azul violáceo". */
export function wheelWord(name: string): string {
  return name.replace('|', '');
}

// ─────────────── the circuit ───────────────

export type PlacedPart = {
  part: CircuitPart;
  /** The part's centre on its wire. */
  x: number;
  y: number;
};

export type CircuitLayout = {
  width: number;
  height: number;
  /** The top wire (the battery's + side) and the return wire. */
  top: number;
  bottom: number;
  /** The battery stands on the left wire at this x. */
  left: number;
  right: number;
  /** Each block: its left and right edges and its branches' wires. */
  blocks: Array<{ x0: number; x1: number; ys: number[] }>;
  parts: PlacedPart[];
};

/** Room above the top wire for the values and a voltmeter's bracket. */
const C_TOP = 40;
/** From one branch's wire to the next. */
const C_ROW = 66;
const C_LEFT = 58;
const C_RIGHT = 14;
const C_UNIT_MAX = 128;

export function circuitLayout(c: Circuit, width: number): CircuitLayout {
  const widths = c.blocks.map((b) => Math.max(...b.branches.map((br) => br.length)));
  const units = widths.reduce((a, b) => a + b, 0);
  const rows = Math.max(...c.blocks.map((b) => b.branches.length));
  const unit = Math.min(C_UNIT_MAX, (width - C_LEFT - C_RIGHT) / units);
  const used = unit * units;
  const left = C_LEFT - 30;
  const x0 = C_LEFT + (width - C_LEFT - C_RIGHT - used) / 2;
  const top = C_TOP;
  // The return wire runs under the lowest branch; a single row still leaves room for names.
  const bottom = top + Math.max(1, rows - 1) * C_ROW + (rows > 1 ? 30 : C_ROW);
  const blocks: CircuitLayout['blocks'] = [];
  const parts: PlacedPart[] = [];
  let x = x0;
  c.blocks.forEach((b, bi) => {
    const w = widths[bi]! * unit;
    const ys = b.branches.map((_, k) => top + k * C_ROW);
    blocks.push({ x0: x, x1: x + w, ys });
    b.branches.forEach((br, k) => {
      br.forEach((p, i) => {
        parts.push({ part: p, x: x + ((i + 0.5) * w) / br.length, y: ys[k]! });
      });
    });
    x += w;
  });
  return {
    width,
    height: bottom + 16,
    top,
    bottom,
    left,
    right: x,
    blocks,
    parts,
  };
}

/** The lamp a tap means: the nearest lamp, if the tap is within reach of one. */
export function lampAt(l: CircuitLayout, x: number, y: number): string | null {
  let best: string | null = null;
  let dist = 40;
  for (const p of l.parts) {
    if (p.part.part !== 'lamp') continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < dist) {
      dist = d;
      best = p.part.id;
    }
  }
  return best;
}

// ─────────────── logic gates ───────────────

/** What a gate's box says (DIN EN 60617) and whether its output is negated. */
export function gateSymbol(g: LogicNet['gate']): { text: string; negated: boolean } {
  switch (g) {
    case 'and':
      return { text: '&', negated: false };
    case 'nand':
      return { text: '&', negated: true };
    case 'or':
      return { text: '≥1', negated: false };
    case 'nor':
      return { text: '≥1', negated: true };
    case 'xor':
      return { text: '=1', negated: false };
    case 'not':
      return { text: '1', negated: true };
  }
}

export function logicHeight(net: LogicNet): number {
  return net.then === null ? 56 : 68;
}
