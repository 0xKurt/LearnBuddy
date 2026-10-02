// Circuits and logic gates, computed (issue #261). docs/architecture.md §Practice ("Figure
// library").
//
// Regel 0: every key of a circuit question — which lamps light, the current an ammeter shows,
// the voltage across a part, the equivalent resistance — is computed HERE from the net the
// figure draws, exactly (rationals, no floating point). A truth table is computed from the
// gates. The model only ever names the parts and their values; a key it might have had in mind
// is never asked for, so there is nothing of its to disagree with.
//
// The net is the one `contracts/circuit.ts` draws: blocks in series along the wire, each block
// one to three branches in parallel, each branch one to three parts in series. Ideal parts: a
// closed switch has no resistance, an open one does not conduct, a wire has none.

import {
  circuitParts,
  circuitWidth,
  CIRCUIT_BLOCKS_MAX,
  CIRCUIT_BRANCHES_MAX,
  CIRCUIT_BRANCH_PARTS_MAX,
  CIRCUIT_PARTS_MAX,
  CIRCUIT_WIDTH_MAX,
  logicInputs,
  type Circuit,
  type CircuitPart,
  type LogicGate,
  type LogicNet,
} from '@learnbuddy/shared-types/contracts';

/** What a circuit question may ask (the model's `ask`). */
export const CIRCUIT_ASKS = [
  'dark_lamp',
  'lit_lamp',
  'lit_count',
  'connection',
  'resistance',
  'current',
  'voltage',
] as const;

// ─────────────── exact numbers ───────────────

/** n/d with d > 0, reduced. */
export type Q = { n: bigint; d: bigint };

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x === 0n ? 1n : x;
}

function q(n: bigint, d: bigint = 1n): Q {
  if (d < 0n) return q(-n, -d);
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

const ZERO = q(0n);
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const inv = (a: Q) => q(a.d, a.n);
const isZero = (a: Q) => a.n === 0n;

/** A value as the model wrote it (12, 2.5, 0.25), exactly — or null when it has more than six decimals. */
export function exact(x: number): Q | null {
  if (!Number.isFinite(x)) return null;
  const text = String(x);
  if (/e/i.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  if (frac.length > 6) return null;
  return q(BigInt(`${whole}${frac}`.replace(/^(-?)0+(?=\d)/, '$1')), 10n ** BigInt(frac.length));
}

/**
 * A result as a decimal she can type, or null when it is none with at most three places
 * (1/3 A is no answer to "what does the ammeter show?" — such a task is not stored).
 */
export function decimalOf(v: Q): string | null {
  let d = v.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos++;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives++;
  }
  if (d !== 1n) return null;
  const places = Math.max(twos, fives);
  if (places > 3) return null;
  const scaled = (v.n * 10n ** BigInt(places)) / v.d;
  const neg = scaled < 0n;
  const digits = (neg ? -scaled : scaled).toString().padStart(places + 1, '0');
  const int = digits.slice(0, digits.length - places);
  const fr = places > 0 ? digits.slice(digits.length - places).replace(/0+$/, '') : '';
  return `${neg ? '-' : ''}${int}${fr ? `.${fr}` : ''}`;
}

// ─────────────── the net ───────────────

/** Why a circuit is not drawn. Each one is a test (`__tests__/circuit.test.ts`). */
export type CircuitProblem =
  /** Over the caps: more blocks, branches, parts or width than a phone draws. */
  | 'circuit_size'
  /** No lamp and no resistor: nothing that uses the current. */
  | 'no_consumer'
  /** A path of closed switches from one pole to the other: a short circuit of the battery. */
  | 'short'
  /** A switch with a resistance, or a lamp/resistor drawn open. */
  | 'circuit_parts';

export function circuitProblem(c: Circuit): CircuitProblem | null {
  if (c.blocks.length > CIRCUIT_BLOCKS_MAX) return 'circuit_size';
  if (c.blocks.some((b) => b.branches.length > CIRCUIT_BRANCHES_MAX)) return 'circuit_size';
  if (c.blocks.some((b) => b.branches.some((br) => br.length > CIRCUIT_BRANCH_PARTS_MAX)))
    return 'circuit_size';
  const parts = circuitParts(c);
  if (parts.length > CIRCUIT_PARTS_MAX || circuitWidth(c) > CIRCUIT_WIDTH_MAX)
    return 'circuit_size';
  if (new Set(parts.map((p) => p.id)).size !== parts.length) return 'circuit_parts';
  for (const p of parts) {
    if (p.part === 'switch' && p.ohm !== null) return 'circuit_parts';
    if (p.part !== 'switch' && p.open) return 'circuit_parts';
  }
  if (!parts.some((p) => p.part !== 'switch')) return 'no_consumer';
  if (flow(c).state === 'short') return 'short';
  return null;
}

/** What a part, a branch or a block is to the current: no resistance, some, or a gap. */
type Kind = 'zero' | 'some' | 'open';

function partKind(p: CircuitPart): Kind {
  if (p.part === 'switch') return p.open ? 'open' : 'zero';
  return 'some';
}

function branchKind(branch: readonly CircuitPart[]): Kind {
  const kinds = branch.map(partKind);
  if (kinds.includes('open')) return 'open';
  return kinds.includes('some') ? 'some' : 'zero';
}

type Flow = {
  state: 'closed' | 'open' | 'short';
  /** The ids of the parts current flows through. */
  carrying: Set<string>;
};

/**
 * Where current flows, without any value: a closed circuit, an open one or a short. In a block
 * with a branch of closed switches only, that branch takes the whole current and the others are
 * bridged — a lamp there stays dark (the "überbrückte Lampe" of the textbooks).
 */
export function flow(c: Circuit): Flow {
  const carrying = new Set<string>();
  let anySome = false;
  for (const block of c.blocks) {
    const kinds = block.branches.map(branchKind);
    const zero = kinds.some((k) => k === 'zero');
    const live = block.branches.filter((_, i) =>
      zero ? kinds[i] === 'zero' : kinds[i] === 'some',
    );
    if (live.length === 0) return { state: 'open', carrying: new Set() };
    if (!zero) anySome = true;
    for (const br of live) for (const p of br) carrying.add(p.id);
  }
  if (!anySome) return { state: 'short', carrying: new Set() };
  return { state: 'closed', carrying };
}

/** The lamps that light, in reading order. */
export function litLamps(c: Circuit): string[] {
  const f = flow(c);
  return circuitParts(c)
    .filter((p) => p.part === 'lamp' && f.state === 'closed' && f.carrying.has(p.id))
    .map((p) => p.id);
}

export type Values = {
  /** Equivalent resistance of the whole net, Ω. */
  resistance: Q;
  /** Current from the battery, A. */
  current: Q;
  /** Current through each part, A. */
  partCurrent: Map<string, Q>;
  /** Voltage across each part, V. */
  partVoltage: Map<string, Q>;
};

/**
 * Every current and voltage, exactly — or null when the net does not determine them: a
 * resistance missing, an open circuit, a value with too many decimals, or two branches of
 * closed switches side by side (how the current splits between two wires is not determined).
 */
export function values(c: Circuit): Values | null {
  const f = flow(c);
  if (f.state !== 'closed' || c.voltage === null) return null;
  const U = exact(c.voltage);
  if (!U) return null;
  const R = new Map<string, Q>();
  for (const p of circuitParts(c)) {
    if (p.part === 'switch') R.set(p.id, ZERO);
    else {
      if (p.ohm === null) return null;
      const r = exact(p.ohm);
      if (!r) return null;
      R.set(p.id, r);
    }
  }
  const branchR = (br: readonly CircuitPart[]) => br.reduce((s, p) => add(s, R.get(p.id)!), ZERO);
  // Each block: its resistance and the branches that carry current.
  const blocks = c.blocks.map((block) => {
    const kinds = block.branches.map(branchKind);
    const zeros = block.branches.filter((_, i) => kinds[i] === 'zero');
    if (zeros.length > 1) return null;
    if (zeros.length === 1) return { r: ZERO, live: zeros };
    const live = block.branches.filter((_, i) => kinds[i] === 'some');
    const conductance = live.reduce((s, br) => add(s, inv(branchR(br))), ZERO);
    return { r: inv(conductance), live };
  });
  if (blocks.some((b) => b === null)) return null;
  const total = blocks.reduce((s, b) => add(s, b!.r), ZERO);
  if (isZero(total)) return null;
  const I = div(U, total);
  const partCurrent = new Map<string, Q>();
  const partVoltage = new Map<string, Q>();
  for (const p of circuitParts(c)) {
    partCurrent.set(p.id, ZERO);
    partVoltage.set(p.id, ZERO);
  }
  c.blocks.forEach((block, bi) => {
    const b = blocks[bi]!;
    const Ub = mul(I, b.r);
    for (const br of block.branches) {
      if (!b.live.includes(br)) {
        // Open or bridged: no current through it, and across an open switch stands the
        // block's voltage (the textbook's "am offenen Schalter liegt die Spannung an").
        for (const p of br) if (p.part === 'switch' && p.open) partVoltage.set(p.id, Ub);
        continue;
      }
      const Ibr = isZero(b.r) ? I : div(Ub, branchR(br));
      for (const p of br) {
        partCurrent.set(p.id, Ibr);
        partVoltage.set(p.id, mul(Ibr, R.get(p.id)!));
      }
    }
  });
  return { resistance: total, current: I, partCurrent, partVoltage };
}

/**
 * How the consumers (lamps and resistors) are connected: all in one line (series), each on its
 * own branch of one block (parallel), or both (mixed). Switches are left out — they decide
 * whether current flows, not how the consumers stand to each other.
 */
export function connectionOf(c: Circuit): 'series' | 'parallel' | 'mixed' {
  const consumers = (br: readonly CircuitPart[]) => br.filter((p) => p.part !== 'switch').length;
  const withConsumers = c.blocks.filter((b) => b.branches.some((br) => consumers(br) > 0));
  const parallelBlocks = withConsumers.filter(
    (b) => b.branches.filter((br) => consumers(br) > 0).length > 1,
  );
  if (parallelBlocks.length === 0) return 'series';
  if (withConsumers.length === 1 && parallelBlocks[0]!.branches.every((br) => consumers(br) <= 1))
    return 'parallel';
  return 'mixed';
}

// ─────────────── logic gates ───────────────

function gate(g: LogicGate, a: boolean, b: boolean): boolean {
  switch (g) {
    case 'and':
      return a && b;
    case 'or':
      return a || b;
    case 'xor':
      return a !== b;
    case 'nand':
      return !(a && b);
    case 'nor':
      return !(a || b);
    case 'not':
      return !a;
  }
}

export type TruthRow = { inputs: boolean[]; x: boolean | null; q: boolean };

/**
 * The whole truth table, rows in counting order (000, 001, … with A as the highest place, as
 * school tables list them). `x` is the first gate's output when there are two gates.
 */
export function truthTable(net: LogicNet): TruthRow[] {
  const n = logicInputs(net).length;
  return Array.from({ length: 2 ** n }, (_, row) => {
    const inputs = Array.from({ length: n }, (_, i) => ((row >> (n - 1 - i)) & 1) === 1);
    const first =
      net.gate === 'not' ? gate('not', inputs[0]!, false) : gate(net.gate, inputs[0]!, inputs[1]!);
    if (net.then === null) return { inputs, x: null, q: first };
    return { inputs, x: first, q: gate(net.then, first, inputs[n - 1]!) };
  });
}
