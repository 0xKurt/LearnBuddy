// Circuit diagrams as data (issue #261, docs/architecture.md §Practice, Circuits): a battery and
// blocks along the wire, left to right; a block of two or three branches one under the other is a
// parallel connection, a branch holds lamps, resistors and switches in series. An ammeter sits in
// series after a part (or in the main wire), a voltmeter across a part (or across the battery).
//
// The model writes the parts and the question's kind, nothing else; everything the question is
// graded by is COMPUTED here, once, for the server and the app alike:
//   - the network: ideal parts (a closed switch and an ammeter are wire, an open switch and a
//     voltmeter are a gap), reduced block by block in exact fractions — which lamps light, the
//     equivalent resistance, every branch current, the meter's reading;
//   - the layout: the loop with the battery on the bottom wire, the parts on the top wire, the
//     branches of a block stacked between two rails — at the width the app has, and at the
//     narrowest phone (`TREE_WIDTH`) a problem when it does not fit.
// School circuits are series-parallel; a bridge cannot be written in this shape, and needs no
// node analysis. A circuit that breaks a rule is rejected, never repaired (`circuitProblem`).
//
// Dependency-free on purpose: the app imports this file by path, so what the server checked is
// exactly what the app draws.

import { TICK_FONT } from './charts.js';
import { textWidth } from './labelBoxes.js';
import {
  ratioAdd,
  ratioDiv,
  ratioFromDecimal,
  ratioIsZero,
  ratioMul,
  ratioOf,
  type Ratio,
} from './ratio.js';
import { TREE_WIDTH, type XY } from './trees.js';

export type PartKind = 'lamp' | 'resistor' | 'switch';
/** r: Ω on a lamp or resistor (0 = not given) · o: a switch that is open. */
export type CircuitPart = { k: PartKind; r: number; o: boolean };
export type CircuitAsk = 'none' | 'lit' | 'lit_count' | 'kind' | 'r_total' | 'current' | 'voltage';
export type Circuit = {
  type: 'circuit';
  /** The battery's voltage in V; 0 = not given. */
  u: number;
  /** Blocks along the top wire; a block = its branches top down; a branch = its parts. */
  b: readonly (readonly (readonly CircuitPart[])[])[];
  m: 'none' | 'ammeter' | 'voltmeter';
  /** The part the meter belongs to ("R1"); "" = the main wire (ammeter) or the battery (voltmeter). */
  mt: string;
  ask: CircuitAsk;
  /** lit: the lamp asked about ("L2"); else "". */
  at: string;
};

export function isCircuit(f: { type: string }): f is Circuit {
  return f.type === 'circuit';
}

export type CircuitProblem =
  /** Too many parts, a value on a switch, an "open" lamp, a value finer than a thousandth. */
  | 'structure'
  /** A meter on a part that does not exist, or a part named without a meter. */
  | 'meter'
  /** Nothing but wire from one pole of the battery to the other. */
  | 'short'
  /** The question asks what this circuit cannot answer (a lamp that is not there, a mixed
   * circuit asked "series or parallel?", a current without the values it needs). */
  | 'ask'
  /** It does not fit the narrowest phone. */
  | 'too_wide';

/** The most parts a circuit has: what the narrowest phone shows legibly. */
const MAX_PARTS = 8;
const PREFIX: Record<PartKind, string> = { lamp: 'L', resistor: 'R', switch: 'S' };

/** A part with its place and its name as drawn: L1, L2 … R1 … S1 … in reading order. */
export type PlacedPart = CircuitPart & { block: number; branch: number; pos: number; name: string };

/** Every part in reading order: blocks left to right, branches top down, parts left to right. */
export function circuitParts(c: Pick<Circuit, 'b'>): PlacedPart[] {
  const count: Record<PartKind, number> = { lamp: 0, resistor: 0, switch: 0 };
  const out: PlacedPart[] = [];
  c.b.forEach((block, bi) =>
    block.forEach((branch, ri) =>
      branch.forEach((part, pi) => {
        count[part.k] += 1;
        const name = `${PREFIX[part.k]}${count[part.k]}`;
        out.push({ ...part, block: bi, branch: ri, pos: pi, name });
      }),
    ),
  );
  return out;
}

// ─────────────── the network ───────────────

/** A resistance: an exact value, wire (0) or a gap (null, infinitely large). */
type Ohm = Ratio | null;

const ZERO = ratioOf(BigInt(0));
const ONE = ratioOf(BigInt(1));

function series(rs: Ohm[]): Ohm {
  let sum = ZERO;
  for (const r of rs) {
    if (r === null) return null;
    sum = ratioAdd(sum, r);
  }
  return sum;
}

function parallel(rs: Ohm[]): Ohm {
  const closed = rs.filter((r): r is Ratio => r !== null);
  if (closed.length === 0) return null;
  if (closed.some(ratioIsZero)) return ZERO;
  return ratioDiv(
    ONE,
    closed.reduce((s, r) => ratioAdd(s, ratioDiv(ONE, r)), ZERO),
  );
}

/** A consumer without a value counts as 1 Ω: whether a lamp lights does not depend on it. */
function partOhm(p: CircuitPart): Ohm {
  if (p.k === 'switch') return p.o ? null : ZERO;
  return p.r > 0 ? ratioFromDecimal(p.r) : ONE;
}

type Branch = { r: Ohm; i: Ratio | null };
type Block = { r: Ohm; v: Ratio | null; branches: Branch[] };
export type Network = {
  total: Ohm;
  /** The main current; 0 when the loop is open. */
  current: Ratio;
  blocks: Block[];
  /** Every lamp and resistor has its value, and the battery its voltage: the numbers are real. */
  measured: boolean;
};

/**
 * The circuit's currents and voltages, exactly; 'short' when the battery is short-circuited. A
 * branch current is null only where it cannot be known: two wires side by side share it in a
 * way the drawing does not say (no lamp can be in such a branch — a lamp is never wire).
 */
export function solveCircuit(c: Pick<Circuit, 'u' | 'b'>): Network | 'short' {
  const blockOhms = c.b.map((block) => {
    const branchOhms = block.map((branch) => series(branch.map(partOhm)));
    return { r: parallel(branchOhms), branchOhms };
  });
  const total = series(blockOhms.map((b) => b.r));
  if (total !== null && ratioIsZero(total)) return 'short';
  const parts = c.b.flat(2);
  const measured = c.u > 0 && parts.every((p) => p.k === 'switch' || p.r > 0);
  const u = c.u > 0 ? ratioFromDecimal(c.u) : ONE;
  const current = total === null || u === null ? ZERO : ratioDiv(u, total);
  const blocks = blockOhms.map(({ r, branchOhms }): Block => {
    const v = total === null || r === null ? null : ratioMul(current, r);
    const wires = branchOhms.filter((x) => x !== null && ratioIsZero(x)).length;
    const branches = branchOhms.map((br): Branch => {
      if (ratioIsZero(current) || br === null) return { r: br, i: ZERO };
      if (r !== null && ratioIsZero(r)) {
        if (!ratioIsZero(br)) return { r: br, i: ZERO };
        return { r: br, i: wires === 1 ? current : null };
      }
      return { r: br, i: r === null ? ZERO : ratioDiv(ratioMul(current, r), br) };
    });
    return { r, v, branches };
  });
  return { total, current, blocks, measured };
}

/** Whether each lamp lights, in reading order of the lamps (L1, L2 …). */
export function litLamps(c: Pick<Circuit, 'u' | 'b'>): boolean[] | null {
  const net = solveCircuit(c);
  if (net === 'short') return null;
  return circuitParts(c)
    .filter((p) => p.k === 'lamp')
    .map((p) => {
      const i = net.blocks[p.block]?.branches[p.branch]?.i;
      return i !== null && i !== undefined && !ratioIsZero(i);
    });
}

/**
 * Series or parallel — only where the circuit is plainly one of them: every consumer in a row
 * along the wire, or every consumer alone in its own branch of the one parallel block. A mixed
 * circuit has no such answer.
 */
export function circuitKind(c: Pick<Circuit, 'b'>): 'series' | 'parallel' | null {
  const consumers = (branch: readonly CircuitPart[]) => branch.filter((p) => p.k !== 'switch');
  const all = c.b.flat(2).filter((p) => p.k !== 'switch').length;
  if (all < 2) return null;
  if (c.b.every((block) => block.length === 1)) return 'series';
  const split = c.b.filter((block) => block.length > 1);
  const [one] = split;
  if (split.length !== 1 || !one) return null;
  const alone = one.every((branch) => consumers(branch).length === 1);
  return alone && one.length === all ? 'parallel' : null;
}

export type CircuitKey =
  | { kind: 'lit'; lit: boolean }
  | { kind: 'count'; n: number }
  | { kind: 'kind'; parallel: boolean }
  | { kind: 'measure'; value: Ratio; unit: 'Ω' | 'A' | 'V' };

function meterReading(c: Circuit, net: Network, parts: PlacedPart[]): CircuitKey | null {
  if (!net.measured) return null;
  const part = parts.find((p) => p.name === c.mt);
  const branch = part ? net.blocks[part.block]?.branches[part.branch] : undefined;
  if (c.ask === 'current') {
    if (c.m !== 'ammeter') return null;
    const i = part ? branch?.i : net.current;
    return i === null || i === undefined ? null : { kind: 'measure', value: i, unit: 'A' };
  }
  if (c.m !== 'voltmeter' || net.total === null) return null;
  if (!part) return { kind: 'measure', value: ratioFromDecimal(c.u) ?? ZERO, unit: 'V' };
  const r = partOhm(part);
  // An open switch carries no current, so the rest of its branch drops nothing: it sees the
  // whole voltage of its block. Any other part drops its current times its resistance.
  const v =
    r === null
      ? (net.blocks[part.block]?.v ?? null)
      : ratioIsZero(r)
        ? ZERO
        : branch?.i
          ? ratioMul(branch.i, r)
          : null;
  return v === null ? null : { kind: 'measure', value: v, unit: 'V' };
}

/** What the question's key is, computed from the circuit; null when it asks nothing computable. */
export function circuitKey(c: Circuit): CircuitKey | null {
  const net = solveCircuit(c);
  if (net === 'short') return null;
  const parts = circuitParts(c);
  switch (c.ask) {
    case 'none':
      return null;
    case 'lit': {
      const lit = litLamps(c);
      const k = parts.filter((p) => p.k === 'lamp').findIndex((p) => p.name === c.at);
      return lit && k >= 0 ? { kind: 'lit', lit: lit[k] === true } : null;
    }
    case 'lit_count': {
      const lit = litLamps(c);
      return lit && lit.length > 0 ? { kind: 'count', n: lit.filter(Boolean).length } : null;
    }
    case 'kind': {
      const kind = circuitKind(c);
      return kind === null ? null : { kind: 'kind', parallel: kind === 'parallel' };
    }
    case 'r_total':
      return net.total !== null && parts.every((p) => p.k === 'switch' || p.r > 0)
        ? { kind: 'measure', value: net.total, unit: 'Ω' }
        : null;
    case 'current':
    case 'voltage':
      return meterReading(c, net, parts);
  }
}

// ─────────────── the phone it has to fit ───────────────

/**
 * One part's cell along a wire, and a branch's row: its name above, its value below, and 8 px
 * clear before the next branch's names (a row of 44 let R2's value touch R3's name).
 */
export const CELL = 46;
export const ROW = 52;
/** Where a row's wire runs, below the row's top: its name stands above, its value below. */
export const AXIS = 22;
/** A part's symbol, centred in its cell. */
export const SYMBOL = 24;
/** The loop a voltmeter hangs in, below the part it measures (and below its value). */
export const METER_DROP = 38;
/** A parallel block's stubs between its rails and its parts. */
const RAIL = 10;
/** Between the side wires and the first and last block. */
const GAP = 6;
/** The side wires, from the drawing's edge. */
const MARGIN = 10;
/** The bottom wire, below the lowest row (room for the battery's voltage above it). */
const BATTERY_ROOM = 36;
/** Half the height of the battery's long plate, and the room under it. */
export const PLATE = 11;
const BELOW = 8;
/** The tallest circuit the narrowest phone shows next to its question. */
const MAX_HEIGHT = 300;

export type DrawnPart = {
  kind: PartKind | 'ammeter' | 'voltmeter';
  /** The symbol's centre. */
  at: XY;
  open: boolean;
  name: string;
  /** The value written under it, in its unit (Ω); 0 for none. */
  ohm: number;
};
export type Wire = { from: XY; to: XY };
export type CircuitLayout = {
  width: number;
  height: number;
  wires: Wire[];
  /** Where wires branch: a dot, as in the schoolbook. */
  dots: XY[];
  parts: DrawnPart[];
  battery: XY;
};

type Item = { kind: DrawnPart['kind']; part: PlacedPart | null };

/** The items of one branch along its wire: its parts, and an ammeter right after its part. */
function rowItems(c: Circuit, parts: PlacedPart[], block: number, branch: number): Item[] {
  const items: Item[] = [];
  for (const p of parts.filter((x) => x.block === block && x.branch === branch)) {
    items.push({ kind: p.k, part: p });
    if (c.m === 'ammeter' && c.mt === p.name) items.push({ kind: 'ammeter', part: null });
  }
  return items;
}

const meterUnder = (c: Circuit, items: Item[]) =>
  c.m === 'voltmeter' && items.some((it) => it.part?.name === c.mt);

/**
 * Where everything stands at `width`: the loop, the parts, the junction dots, the battery.
 * Null when it does not fit — wider than `width`, taller than the phone allows, or a value
 * wider than its cell.
 */
export function circuitLayout(c: Circuit, width: number): CircuitLayout | null {
  const parts = circuitParts(c);
  const rows = c.b.map((block, bi) => block.map((_, ri) => rowItems(c, parts, bi, ri)));
  const mainMeter = c.m === 'ammeter' && c.mt === '';
  const blockW = rows.map((block) => {
    const cells = Math.max(...block.map((items) => items.length)) * CELL;
    return block.length > 1 ? cells + 2 * RAIL : cells;
  });
  const content = blockW.reduce((s, w) => s + w, 0) + (mainMeter ? CELL : 0) + 2 * GAP;
  const need = content + 2 * MARGIN;
  if (need > width) return null;
  const left = Math.floor((width - need) / 2) + MARGIN;
  const right = left + content;
  // Two pixels over the first row's names, so no glyph touches the edge.
  const top = 2;
  const axis = top + AXIS;

  const wires: Wire[] = [];
  const dots: XY[] = [];
  const drawn: DrawnPart[] = [];
  const wire = (x1: number, y1: number, x2: number, y2: number) =>
    wires.push({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });

  /** Lays one branch's items between x0 and x1 on the wire at y, centred, wire to wire. */
  const lay = (items: Item[], x0: number, x1: number, y: number): void => {
    const start = (x0 + x1 - items.length * CELL) / 2;
    let x = x0;
    items.forEach((it, k) => {
      const cx = start + k * CELL + CELL / 2;
      wire(x, y, cx - SYMBOL / 2, y);
      x = cx + SYMBOL / 2;
      const p = it.part;
      drawn.push({
        kind: it.kind,
        at: { x: cx, y },
        open: p?.k === 'switch' && p.o,
        name: p ? p.name : '',
        ohm: p && p.k !== 'switch' ? p.r : 0,
      });
      if (p && c.m === 'voltmeter' && c.mt === p.name) {
        // At the cell's edges, so the part's value stands clear between the two wires.
        const a = cx - CELL / 2 + 2;
        const b = cx + CELL / 2 - 2;
        const low = y + METER_DROP;
        dots.push({ x: a, y }, { x: b, y });
        wire(a, y, a, low);
        wire(b, y, b, low);
        wire(a, low, cx - SYMBOL / 2, low);
        wire(cx + SYMBOL / 2, low, b, low);
        drawn.push({ kind: 'voltmeter', at: { x: cx, y: low }, open: false, name: '', ohm: 0 });
      }
    });
    wire(x, y, x1, y);
  };

  let x = left + GAP;
  wire(left, axis, x, axis);
  let bottom = top + ROW;
  rows.forEach((block, bi) => {
    const w = blockW[bi] ?? 0;
    if (block.length === 1) {
      lay(block[0] ?? [], x, x + w, axis);
      bottom = Math.max(bottom, top + ROW + (meterUnder(c, block[0] ?? []) ? METER_DROP : 0));
    } else {
      let y = top;
      const ys: number[] = [];
      for (const items of block) {
        ys.push(y + AXIS);
        lay(items, x + RAIL, x + w - RAIL, y + AXIS);
        wire(x, y + AXIS, x + RAIL, y + AXIS);
        wire(x + w - RAIL, y + AXIS, x + w, y + AXIS);
        y += ROW + (meterUnder(c, items) ? METER_DROP : 0);
      }
      const last = ys[ys.length - 1] ?? axis;
      wire(x, axis, x, last);
      wire(x + w, axis, x + w, last);
      // A dot where the wire splits: at the top, and at every branch but the last.
      for (const y0 of ys.slice(0, -1)) dots.push({ x, y: y0 }, { x: x + w, y: y0 });
      bottom = Math.max(bottom, y);
    }
    x += w;
  });
  if (mainMeter) {
    lay([{ kind: 'ammeter', part: null }], x, x + CELL, axis);
    x += CELL;
  }
  wire(x, axis, right, axis);

  // The loop closes over the bottom wire, the battery in its middle (long plate = plus, left).
  const low = bottom + BATTERY_ROOM;
  const mid = (left + right) / 2;
  wire(left, axis, left, low);
  wire(right, axis, right, low);
  wire(left, low, mid - 3, low);
  wire(mid + 3, low, right, low);
  let height = low + PLATE + BELOW;
  if (c.m === 'voltmeter' && c.mt === '') {
    const drop = low + METER_DROP;
    const a = mid - CELL / 2;
    const b = mid + CELL / 2;
    dots.push({ x: a, y: low }, { x: b, y: low });
    wire(a, low, a, drop);
    wire(b, low, b, drop);
    wire(a, drop, mid - SYMBOL / 2, drop);
    wire(mid + SYMBOL / 2, drop, b, drop);
    drawn.push({ kind: 'voltmeter', at: { x: mid, y: drop }, open: false, name: '', ohm: 0 });
    height = drop + SYMBOL / 2 + BELOW;
  }
  if (height > MAX_HEIGHT) return null;
  // A value must stand within its cell: "4700 Ω" does (its bound, `textWidth`, is an upper one —
  // drawn it is about 36 px), a fifth digit would run into the next part's value.
  const widest = Math.max(0, ...drawn.map((d) => textWidth(ohmLabel(d.ohm), TICK_FONT)));
  if (widest > CELL + 2) return null;
  return { width, height, wires, dots, parts: drawn, battery: { x: mid, y: low } };
}

/** A part's value as written under it ("100 Ω"); "" for none. The app writes the decimal mark. */
function ohmLabel(ohm: number): string {
  return ohm > 0 ? `${ohm} Ω` : '';
}

function structureOk(c: Circuit, parts: PlacedPart[]): boolean {
  if (parts.length === 0 || parts.length > MAX_PARTS) return false;
  if (c.u > 0 && ratioFromDecimal(c.u) === null) return false;
  return parts.every((p) =>
    p.k === 'switch' ? p.r === 0 : !p.o && (p.r === 0 || ratioFromDecimal(p.r) !== null),
  );
}

/** The first rule a circuit breaks, or null when it holds and fits the narrowest phone. */
export function circuitProblem(c: Circuit): CircuitProblem | null {
  const parts = circuitParts(c);
  if (!structureOk(c, parts)) return 'structure';
  const named = c.mt === '' || parts.some((p) => p.name === c.mt);
  if (c.m === 'none' ? c.mt !== '' : !named) return 'meter';
  if (solveCircuit(c) === 'short') return 'short';
  if ((c.ask === 'lit') !== (c.at !== '')) return 'ask';
  if (c.ask !== 'none' && circuitKey(c) === null) return 'ask';
  return circuitLayout(c, TREE_WIDTH) === null ? 'too_wide' : null;
}
