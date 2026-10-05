// Logic gates as data (issue #261, docs/architecture.md §Practice, Circuits): a Schaltnetz of one
// to three gates on the inputs A, B, C, drawn as German schools draw it (DIN EN 60617: a box
// with &, ≥1, =1 or 1, a small circle for a negated output; the inputs as rails with taps).
//
// The shape is the one school nets have: one gate alone, or gates on the inputs that all feed
// one last gate, whose output is Q — (A ∧ B) ∨ ¬C, ¬(A ∨ B), A ⊕ B ∧ C … The truth table is
// COMPUTED here, and so is the layout, for the server and the app alike. A net that breaks a
// rule is rejected, never repaired (`logicProblem`).
//
// Dependency-free on purpose: the app imports this file by path.

import { TREE_WIDTH, type XY } from './trees.js';

export const LOGIC_OPS = ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor'] as const;
export type LogicOp = (typeof LOGIC_OPS)[number];
export type Signal = 'A' | 'B' | 'C' | 'G1' | 'G2' | '';
export type Gate = { o: LogicOp; a: Signal; b: Signal };
export type LogicNet = {
  type: 'logic';
  g: readonly Gate[];
  ask: 'none' | 'out' | 'ones';
  /** out: the inputs asked about, A first; else []. */
  v: readonly number[];
};

export function isLogic(f: { type: string }): f is LogicNet {
  return f.type === 'logic';
}

export type LogicProblem =
  /** A gate on a gate that is not before it, a gate that does not feed the last one, a NOT with
   * two inputs, a gate with one. */
  | 'structure'
  /** Inputs used out of order: C without B. */
  | 'inputs'
  /** The question's inputs do not match the net's. */
  | 'ask'
  | 'too_wide';

const INPUTS = ['A', 'B', 'C'] as const;
/** The symbol in the box (DIN EN 60617) and whether its output is negated (a small circle). */
export const GATE_SYMBOL: Record<LogicOp, { text: string; negated: boolean }> = {
  and: { text: '&', negated: false },
  or: { text: '≥1', negated: false },
  not: { text: '1', negated: true },
  nand: { text: '&', negated: true },
  nor: { text: '≥1', negated: true },
  xor: { text: '=1', negated: false },
  xnor: { text: '=1', negated: true },
};

const unary = (o: LogicOp) => o === 'not';
const gateIndex = (s: Signal) => (s === 'G1' ? 0 : s === 'G2' ? 1 : -1);
const inputIndex = (s: Signal) => INPUTS.indexOf(s as (typeof INPUTS)[number]);

/** The gate's inputs, in order: one for NOT, two for every other gate. */
export const gateInputs = (g: Gate): Signal[] => (unary(g.o) ? [g.a] : [g.a, g.b]);

/** How many inputs the net uses: A only, A and B, or A to C. */
export function logicInputCount(n: Pick<LogicNet, 'g'>): number {
  const used = new Set(
    n.g
      .flatMap(gateInputs)
      .map(inputIndex)
      .filter((i) => i >= 0),
  );
  return used.size;
}

function structureOk(n: LogicNet): boolean {
  const last = n.g.length - 1;
  const fed = new Set<number>();
  for (const [k, gate] of n.g.entries()) {
    if (unary(gate.o) ? gate.b !== '' || gate.a === '' : gate.a === '' || gate.b === '')
      return false;
    for (const s of gateInputs(gate)) {
      const gi = gateIndex(s);
      // Only the last gate takes gates, and only gates before it; every gate takes each once.
      if (gi >= 0 && (k !== last || gi >= k || fed.has(gi))) return false;
      if (gi >= 0) fed.add(gi);
    }
    if (!unary(gate.o) && gate.a === gate.b) return false;
  }
  return fed.size === last;
}

/** The first rule a net breaks, or null when it holds and fits the narrowest phone. */
export function logicProblem(n: LogicNet): LogicProblem | null {
  if (n.g.length === 0 || !structureOk(n)) return 'structure';
  const count = logicInputCount(n);
  const used = new Set(
    n.g
      .flatMap(gateInputs)
      .map(inputIndex)
      .filter((i) => i >= 0),
  );
  if (count === 0 || [...used].some((i) => i >= count)) return 'inputs';
  const askOk =
    n.ask === 'out'
      ? n.v.length === count && n.v.every((x) => x === 0 || x === 1)
      : n.v.length === 0;
  if (!askOk) return 'ask';
  return logicLayout(n, TREE_WIDTH) === null ? 'too_wide' : null;
}

function apply(o: LogicOp, a: boolean, b: boolean): boolean {
  switch (o) {
    case 'and':
      return a && b;
    case 'or':
      return a || b;
    case 'not':
      return !a;
    case 'nand':
      return !(a && b);
    case 'nor':
      return !(a || b);
    case 'xor':
      return a !== b;
    case 'xnor':
      return a === b;
  }
}

/** Q for the inputs `v` (A first, 0 or 1 each). */
export function logicOutput(n: Pick<LogicNet, 'g'>, v: readonly number[]): 0 | 1 {
  const out: boolean[] = [];
  const read = (s: Signal) => (gateIndex(s) >= 0 ? out[gateIndex(s)] : v[inputIndex(s)] === 1);
  for (const g of n.g) out.push(apply(g.o, read(g.a) === true, read(g.b) === true));
  return out[out.length - 1] ? 1 : 0;
}

/** The truth table's Q column, rows in the usual order: A is the leftmost bit, 0 first. */
export function truthTable(n: Pick<LogicNet, 'g'>): (0 | 1)[] {
  const k = logicInputCount(n);
  return Array.from({ length: 2 ** k }, (_, row) =>
    logicOutput(
      n,
      Array.from({ length: k }, (_, i) => (row >> (k - 1 - i)) & 1),
    ),
  );
}

/** The key the net's question asks for: Q for its inputs, or how many rows give Q = 1. */
export function logicKey(n: LogicNet): number | null {
  if (n.ask === 'out') return logicOutput(n, n.v);
  if (n.ask === 'ones') return truthTable(n).filter((q) => q === 1).length;
  return null;
}

// ─────────────── the phone it has to fit ───────────────

/** A gate's box, and its two inputs this far above and below its middle. */
export const GATE_W = 30;
export const GATE_H = 36;
export const PIN = 9;
/** The negation circle's radius at a gate's output. */
export const BUBBLE = 3.5;
/** Between two input rails, and from the last rail to the first gate. */
const RAIL_GAP = 18;
const TO_GATES = 22;
/** Between the gates of the first column, and between the two columns (room for the wires). */
const ROW_GAP = 14;
const COL_GAP = 34;
/** The output wire, and room for "Q" after it. */
const OUT = 22;
const OUT_LABEL = 14;
/** Room above the rails for their letters. */
export const RAIL_TOP = 16;
const MARGIN = 8;

export type LaidGate = { op: LogicOp; at: XY; name: string; pins: XY[] };
export type LogicLayout = {
  width: number;
  height: number;
  /** Each input's rail: its letter at the top, the line down to its lowest tap. */
  rails: { name: string; x: number; y0: number; y1: number }[];
  gates: LaidGate[];
  wires: { from: XY; to: XY }[];
  /** Taps on a rail. */
  dots: XY[];
  /** The end of the output wire, where "Q" stands. */
  out: XY;
};

/** Where everything stands at `width`; null when it does not fit. */
export function logicLayout(n: LogicNet, width: number): LogicLayout | null {
  const k = logicInputCount(n);
  const lastIndex = n.g.length - 1;
  const last = n.g[lastIndex];
  if (!last || k === 0) return null;
  const firsts = n.g.slice(0, lastIndex);
  const twoColumns = firsts.length > 0;
  const need =
    MARGIN * 2 +
    (k - 1) * RAIL_GAP +
    TO_GATES +
    GATE_W +
    (twoColumns ? COL_GAP + GATE_W : 0) +
    (unary(last.o) || GATE_SYMBOL[last.o].negated ? BUBBLE * 2 : 0) +
    OUT +
    OUT_LABEL;
  if (need > width) return null;
  const x0 = Math.floor((width - need) / 2) + MARGIN;
  const railX = (i: number) => x0 + i * RAIL_GAP;
  const col1 = railX(k - 1) + TO_GATES;
  const col2 = col1 + GATE_W + COL_GAP;
  const top = RAIL_TOP + 4;

  const wires: LogicLayout['wires'] = [];
  const dots: XY[] = [];
  const lowest = INPUTS.slice(0, k).map(() => top);
  const wire = (from: XY, to: XY) => wires.push({ from, to });
  const pinsOf = (g: Gate, x: number, cy: number): XY[] =>
    unary(g.o)
      ? [{ x, y: cy }]
      : [
          { x, y: cy - PIN },
          { x, y: cy + PIN },
        ];
  const outOf = (g: Gate, x: number, cy: number): XY => ({
    x: x + GATE_W + (GATE_SYMBOL[g.o].negated ? BUBBLE * 2 : 0),
    y: cy,
  });
  /** A tap from an input's rail straight to a pin, with a dot on the rail. */
  const tap = (s: Signal, pin: XY) => {
    const i = inputIndex(s);
    if (i < 0) return;
    wire({ x: railX(i), y: pin.y }, pin);
    dots.push({ x: railX(i), y: pin.y });
    lowest[i] = Math.max(lowest[i] ?? top, pin.y);
  };

  const gates: LaidGate[] = [];
  let y = top;
  for (const [i, g] of firsts.entries()) {
    const cy = y + GATE_H / 2;
    const pins = pinsOf(g, col1, cy);
    gates.push({ op: g.o, at: { x: col1, y: cy }, name: `G${i + 1}`, pins });
    gateInputs(g).forEach((s, p) => tap(s, pins[p]!));
    y += GATE_H + ROW_GAP;
  }
  const firstBottom = y - ROW_GAP;

  // The last gate: between its gates' outputs, and with a tap from a rail below the first
  // column, so no tap runs through a gate.
  const lastX = twoColumns ? col2 : col1;
  const fromGates = gateInputs(last).filter((s) => gateIndex(s) >= 0);
  let cy: number;
  if (!twoColumns) cy = top + GATE_H / 2;
  else if (fromGates.length === 2) cy = ((gates[0]?.at.y ?? 0) + (gates[1]?.at.y ?? 0)) / 2;
  else if (unary(last.o)) cy = gates[0]?.at.y ?? top;
  else cy = Math.max((gates[0]?.at.y ?? top) + PIN, firstBottom + PIN + 6);
  // Gates feed the upper pins in their order (G1 above G2), a rail the lower one: no crossing.
  const rank = (s: Signal) => (gateIndex(s) >= 0 ? gateIndex(s) : INPUTS.length);
  const ordered: Signal[] = unary(last.o)
    ? [last.a]
    : [...gateInputs(last)].sort((s, t) => rank(s) - rank(t));
  const lastPins = pinsOf(last, lastX, cy);
  gates.push({ op: last.o, at: { x: lastX, y: cy }, name: `G${lastIndex + 1}`, pins: lastPins });
  ordered.forEach((s, p) => {
    const pin = lastPins[p]!;
    const gi = gateIndex(s);
    if (gi < 0) return tap(s, pin);
    const src = gates[gi];
    if (!src) return;
    const from = outOf(n.g[gi]!, src.at.x, src.at.y);
    const channel = from.x + (COL_GAP - (from.x - col1 - GATE_W)) / 2;
    wire(from, { x: channel, y: from.y });
    wire({ x: channel, y: from.y }, { x: channel, y: pin.y });
    wire({ x: channel, y: pin.y }, pin);
  });
  const end = outOf(last, lastX, cy);
  const out = { x: end.x + OUT, y: cy };
  wire(end, out);

  const rails = INPUTS.slice(0, k).map((name, i) => ({
    name,
    x: railX(i),
    y0: RAIL_TOP,
    y1: (lowest[i] ?? top) + 6,
  }));
  const bottom = Math.max(cy + GATE_H / 2, firstBottom, ...rails.map((r) => r.y1));
  return { width, height: bottom + MARGIN, rails, gates, wires, dots, out };
}
