// Circuit diagrams, logic gates and the colour wheel (issue #261). docs/architecture.md §Practice
// ("Figure library").
//
// All three are drawn by the app from data code computed — the model only ever names the parts
// and their values (apps/api/src/modules/practice/library.ts):
//
//   circuit — a battery and parts in series, where one "block" may hold up to three branches
//             side by side (a parallel connection). The layout is code's: blocks stand left to
//             right along the top wire, branches of a block one under the other. Which lamps
//             light, the currents, the voltages and the equivalent resistance are COMPUTED from
//             the net (apps/api/src/modules/practice/circuit.ts) and never drawn.
//   logic   — one or two gates as German schools draw them (DIN EN 60617: a box with &, ≥1, =1,
//             1, and a small circle for a negated output). The truth table is computed.
//   color wheel — Itten's twelve-part wheel. Complement = the field opposite, a mixture = the
//             field between its two colours. Every field carries its name in words.

import { z } from 'zod';

import { PartId } from './common.js';

/** Blocks along the wire, branches of a block, parts of a branch: what 328 pt draw legibly. */
export const CIRCUIT_BLOCKS_MAX = 3;
export const CIRCUIT_BRANCHES_MAX = 3;
export const CIRCUIT_BRANCH_PARTS_MAX = 3;
/** Parts side by side along the top wire, over all blocks (each block as wide as its longest branch). */
export const CIRCUIT_WIDTH_MAX = 4;
export const CIRCUIT_PARTS_MAX = 8;

export const CircuitPartKind = z.enum(['lamp', 'resistor', 'switch']);
export type CircuitPartKind = z.infer<typeof CircuitPartKind>;

export const CircuitPart = z.object({
  /** l1, l2 … for lamps, r1 … for resistors, s1 … for switches — given by code in reading order. */
  id: PartId,
  part: CircuitPartKind,
  /** A lamp's or resistor's resistance in Ω, shown next to it; null when the task needs none. */
  ohm: z.number().positive().finite().nullable(),
  /** A switch that is open (drawn open). Always false for a lamp or resistor. */
  open: z.boolean(),
});
export type CircuitPart = z.infer<typeof CircuitPart>;

export const CircuitBlock = z.object({
  branches: z
    .array(z.array(CircuitPart).min(1).max(CIRCUIT_BRANCH_PARTS_MAX))
    .min(1)
    .max(CIRCUIT_BRANCHES_MAX),
});
export type CircuitBlock = z.infer<typeof CircuitBlock>;

/** A measuring instrument code placed: an ammeter in series with a part, a voltmeter across it. */
export const CircuitMeter = z.object({
  kind: z.enum(['ammeter', 'voltmeter']),
  at: PartId,
});
export type CircuitMeter = z.infer<typeof CircuitMeter>;

export const Circuit = z.object({
  /** The battery's voltage in V, shown on it; null when the task needs none. */
  voltage: z.number().positive().finite().nullable(),
  blocks: z.array(CircuitBlock).min(1).max(CIRCUIT_BLOCKS_MAX),
  meter: CircuitMeter.nullable(),
});
export type Circuit = z.infer<typeof Circuit>;

export function circuitParts(c: Circuit): CircuitPart[] {
  return c.blocks.flatMap((b) => b.branches.flat());
}

/** How many parts stand side by side along the top wire. */
export function circuitWidth(c: Circuit): number {
  return c.blocks.reduce((n, b) => n + Math.max(...b.branches.map((br) => br.length)), 0);
}

// ─────────────── logic gates ───────────────

export const LogicGate = z.enum(['and', 'or', 'xor', 'nand', 'nor', 'not']);
export type LogicGate = z.infer<typeof LogicGate>;
/** The second gate takes the first one's output and one more input; NOT has only one input. */
export const LogicGate2 = z.enum(['and', 'or', 'xor', 'nand', 'nor']);
export type LogicGate2 = z.infer<typeof LogicGate2>;

export const LogicNet = z.object({
  /** On A and B — or on A alone for NOT. */
  gate: LogicGate,
  /** A second gate on the first one's output and the next input (C, or B after a NOT). */
  then: LogicGate2.nullable(),
});
export type LogicNet = z.infer<typeof LogicNet>;

/** The inputs of a net, in the order the truth table lists them. */
export function logicInputs(net: LogicNet): string[] {
  const first = net.gate === 'not' ? ['A'] : ['A', 'B'];
  if (net.then === null) return first;
  return [...first, net.gate === 'not' ? 'B' : 'C'];
}

// ─────────────── Itten's colour wheel ───────────────

/**
 * The twelve fields clockwise from yellow at the top. Primaries at 0, 4, 8; secondaries at
 * 2, 6, 10 (each between the two primaries it is mixed from); tertiaries at the odd places
 * (each between the primary and the secondary it is mixed from).
 */
export const WHEEL_IDS = [
  'y',
  'yo',
  'o',
  'ro',
  'r',
  'rv',
  'v',
  'bv',
  'b',
  'bg',
  'g',
  'yg',
] as const;
export const WheelId = z.enum(WHEEL_IDS);
export type WheelId = z.infer<typeof WheelId>;

export function wheelIndex(id: WheelId): number {
  return WHEEL_IDS.indexOf(id);
}

export function wheelAt(i: number): WheelId {
  return WHEEL_IDS[((i % 12) + 12) % 12]!;
}

/** primary / secondary / tertiary, from the field's place. */
export function wheelOrder(id: WheelId): 1 | 2 | 3 {
  const i = wheelIndex(id);
  return i % 4 === 0 ? 1 : i % 2 === 0 ? 2 : 3;
}

/** The field opposite: six places on. */
export function complementOf(id: WheelId): WheelId {
  return wheelAt(wheelIndex(id) + 6);
}

/**
 * What two colours of the wheel mix to: the field halfway between them, when there is exactly
 * one — two primaries (four places apart) give the secondary between them, a primary and a
 * neighbouring secondary (two apart) the tertiary between them. Anything else (two
 * complements, a colour with itself, far apart) is no mixture this wheel shows: null.
 */
export function mixOf(a: WheelId, b: WheelId): WheelId | null {
  const ia = wheelIndex(a);
  const ib = wheelIndex(b);
  const fwd = (((ib - ia) % 12) + 12) % 12;
  const [from, gap] = fwd <= 6 ? [ia, fwd] : [ib, 12 - fwd];
  const oa = wheelOrder(a);
  const ob = wheelOrder(b);
  if (gap === 4 && oa === 1 && ob === 1) return wheelAt(from + 2);
  if (gap === 2 && ((oa === 1 && ob === 2) || (oa === 2 && ob === 1))) return wheelAt(from + 1);
  return null;
}
