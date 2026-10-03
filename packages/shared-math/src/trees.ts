// Trees and automata as data (issue #256, docs/architecture.md §Practice, Trees).
//
// The model writes a tree as nodes with a parent index, an automaton as states and transitions;
// everything a drawing or a key depends on is COMPUTED here, once, for the server and the app
// alike:
//   - a probability tree's branches: every one a probability, the branches of each node adding up
//     to exactly 1 (in fractions, not floats: 1/3 + 2/3 is 1, 0.33 + 0.67 is 1, 0.3 + 0.6 is not);
//     the one "?" branch is what is left of its siblings; path and total probabilities;
//   - the word an automaton accepts (a DEA or a NEA, by following every state it can be in);
//   - a layout that fits the narrowest phone (`TREE_WIDTH`), or a problem that says it does not.
// A figure that breaks a rule is rejected, never repaired (`treeProblem`; pedigrees in
// `pedigree.ts`).
//
// Dependency-free on purpose: the app imports this file by path (like `molecule.ts`), so what
// the server checked is exactly what the app draws.

import { pedigreeProblem, type Pedigree } from './pedigree.js';

export type TreeNode = { p: number; l: string; e: string };
export type ProbTree = {
  type: 'tree';
  pr: boolean;
  n: readonly TreeNode[];
  ask: 'none' | 'path' | 'sum' | 'edge';
  at: readonly number[];
};
export type Transition = { a: number; b: number; c: string };
export type Automaton = {
  type: 'automaton';
  s: readonly { l: string; f: boolean }[];
  t: readonly Transition[];
  w: string;
};
export type TreeFigureData = ProbTree | Pedigree | Automaton;

export const TREE_TYPE_NAMES: readonly TreeFigureData['type'][] = ['tree', 'pedigree', 'automaton'];

export function isTreeFigure(f: { type: string }): f is TreeFigureData {
  return (TREE_TYPE_NAMES as readonly string[]).includes(f.type);
}

export type TreeProblem =
  /** A parent that does not exist or comes later, two roots, a cycle, a duplicate pair. */
  | 'structure'
  /** More than the narrowest phone can show: too many leaves, levels or characters. */
  | 'too_wide'
  /** A branch of a probability tree that is no probability. */
  | 'probability'
  /** The branches of one node do not add up to exactly 1. */
  | 'branch_sum'
  /** Not exactly the "?" the asked key needs (two unknowns leave the key open). */
  | 'unknowns'
  /** What the figure says its key is cannot be computed from it. */
  | 'ask'
  /** No mode of inheritance explains the pedigree, or not the one it is drawn for. */
  | 'incompatible'
  /** More than one mode explains it, or the asked genotype is not determined. */
  | 'ambiguous'
  /** The search for genotypes ran out of steps: the figure cannot be decided. */
  | 'undecided'
  /** An automaton's symbol is not one character, or the word uses another symbol. */
  | 'alphabet';

// ─────────────── the phone it has to fit ───────────────

/** The drawing's width on a 360 px phone (the same budget as `CHART_WIDTH`). */
export const TREE_WIDTH = 266;
/** An upper bound for one character of a label at the figures' font size (13 px, `figureText`). */
export const TREE_CHAR = 7.6;

/** Limits of a probability tree (drawn left to right) and a plain tree (drawn top down). */
const LIMITS = {
  pr: { leaves: 9, depth: 3, node: 8, edge: 5 },
  plain: { leaves: 8, depth: 4, node: 3, edge: 2 },
} as const;

// ─────────────── exact fractions ───────────────

export type Ratio = { n: bigint; d: bigint };

const ZERO = BigInt(0);
const ONE = BigInt(1);
const gcd = (a: bigint, b: bigint): bigint => (b === ZERO ? (a < ZERO ? -a : a) : gcd(b, a % b));

function ratio(n: bigint, d: bigint): Ratio {
  const g = gcd(n, d) || ONE;
  return { n: n / g, d: d / g };
}

const add = (x: Ratio, y: Ratio) => ratio(x.n * y.d + y.n * x.d, x.d * y.d);
const mul = (x: Ratio, y: Ratio) => ratio(x.n * y.n, x.d * y.d);
const isOne = (x: Ratio) => x.n === x.d;

/** A branch's probability as written: "1/3", "0.4", "0,25", "1". Null when it is none. */
export function parseProbability(text: string): Ratio | null {
  const s = text.replace(/\s+/g, '');
  const frac = /^(\d{1,4})\/(\d{1,4})$/.exec(s);
  let r: Ratio;
  if (frac) {
    const d = BigInt(frac[2] ?? '0');
    if (d === ZERO) return null;
    r = ratio(BigInt(frac[1] ?? '0'), d);
  } else {
    const dec = /^(\d)(?:[.,](\d{1,4}))?$/.exec(s);
    if (!dec) return null;
    const places = dec[2] ?? '';
    const d = BigInt(10 ** places.length);
    r = ratio(BigInt(dec[1] ?? '0') * d + BigInt(places || '0'), d);
  }
  return r.n <= r.d ? r : null;
}

export const ratioValue = (r: Ratio) => Number(r.n) / Number(r.d);

// ─────────────── trees ───────────────

const isAsked = (e: string) => e.trim() === '?';

function children(t: ProbTree): number[][] {
  const out: number[][] = t.n.map(() => []);
  t.n.forEach((node, i) => {
    if (node.p >= 0) out[node.p]?.push(i);
  });
  return out;
}

function depths(t: ProbTree): number[] {
  const d: number[] = [];
  t.n.forEach((node, i) => {
    d[i] = node.p < 0 ? 0 : (d[node.p] ?? 0) + 1;
  });
  return d;
}

/**
 * Every branch's probability, the one "?" filled in from its siblings (1 − the others). Null when
 * a branch is no probability, a node's branches do not add up to 1, or two "?" are open.
 */
export function branchProbabilities(
  t: ProbTree,
): { p: (Ratio | null)[]; problem: null } | { problem: TreeProblem } {
  const p: (Ratio | null)[] = t.n.map((node) => (node.p < 0 ? null : parseProbability(node.e)));
  const unknown = t.n.filter((node, i) => i > 0 && isAsked(node.e)).length;
  if (unknown > 1) return { problem: 'unknowns' };
  for (const [i, node] of t.n.entries()) {
    if (i > 0 && p[i] === null && !isAsked(node.e)) return { problem: 'probability' };
  }
  for (const kids of children(t)) {
    if (kids.length === 0) continue;
    const open = kids.filter((k) => p[k] === null);
    const known = kids
      .filter((k) => p[k] !== null)
      .reduce((s, k) => add(s, p[k] as Ratio), ratio(ZERO, ONE));
    if (open.length === 0) {
      if (!isOne(known)) return { problem: 'branch_sum' };
      continue;
    }
    // The "?" is what its siblings leave: it must be a probability, and not zero (a branch
    // drawn with probability 0 is no outcome).
    if (known.n >= known.d) return { problem: 'branch_sum' };
    p[open[0] as number] = ratio(known.d - known.n, known.d);
  }
  return { p, problem: null };
}

/** The probability of the path from the root to node `i` (product of its branches). */
function pathProbability(t: ProbTree, p: (Ratio | null)[], i: number): Ratio {
  let r = ratio(ONE, ONE);
  for (let k = i; k > 0; k = t.n[k]?.p ?? 0) r = mul(r, p[k] ?? ratio(ZERO, ONE));
  return r;
}

/**
 * The key a probability tree declares it computes (`ask`), as an exact fraction; null when it
 * declares none or the tree does not hold.
 */
export function treeKey(t: ProbTree): Ratio | null {
  if (t.ask === 'none' || treeProblem(t) !== null) return null;
  const b = branchProbabilities(t);
  if (b.problem !== null) return null;
  if (t.ask === 'edge') {
    const i = t.n.findIndex((node, k) => k > 0 && isAsked(node.e));
    return i > 0 ? (b.p[i] ?? null) : null;
  }
  return t.at.reduce((s, i) => add(s, pathProbability(t, b.p, i)), ratio(ZERO, ONE));
}

function treeShapeProblem(t: ProbTree): TreeProblem | null {
  if (t.n[0]?.p !== -1) return 'structure';
  for (const [i, node] of t.n.entries()) {
    if (i > 0 && (node.p < 0 || node.p >= i)) return 'structure';
  }
  const kids = children(t);
  const leaves = kids.filter((k) => k.length === 0).length;
  const limit = t.pr ? LIMITS.pr : LIMITS.plain;
  if (leaves > limit.leaves || Math.max(...depths(t)) > limit.depth) return 'too_wide';
  if (t.n.some((node) => node.l.length > limit.node || node.e.length > limit.edge)) {
    return 'too_wide';
  }
  return null;
}

function probTreeProblem(t: ProbTree): TreeProblem | null {
  const shape = treeShapeProblem(t);
  if (shape !== null) return shape;
  if (!t.pr) return t.ask === 'none' && t.at.length === 0 ? null : 'ask';
  const b = branchProbabilities(t);
  if (b.problem !== null) return b.problem;
  const unknown = t.n.some((node, i) => i > 0 && isAsked(node.e));
  switch (t.ask) {
    case 'none':
      return t.at.length === 0 && !unknown ? null : 'ask';
    case 'edge':
      if (t.at.length !== 0) return 'ask';
      return unknown ? null : 'unknowns';
    case 'path':
      if (t.at.length !== 1 || (t.at[0] ?? 0) <= 0 || (t.at[0] ?? 0) >= t.n.length) return 'ask';
      return null;
    case 'sum': {
      // Disjoint outcomes only: whole paths to different leaves.
      const kids = children(t);
      const leaf = (i: number) => i > 0 && i < t.n.length && kids[i]?.length === 0;
      if (t.at.length < 2 || !t.at.every(leaf) || new Set(t.at).size !== t.at.length) {
        return 'ask';
      }
      return null;
    }
  }
}

// ─────────────── automata ───────────────

/** The symbols of one transition ("0,1" → ["0", "1"]); null when one is not one character. */
export function transitionSymbols(c: string): string[] | null {
  const parts = c.split(',').map((x) => x.trim());
  return parts.every((x) => [...x].length === 1) ? parts : null;
}

function automatonProblem(m: Automaton): TreeProblem | null {
  const n = m.s.length;
  const pairs = new Set<string>();
  const alphabet = new Set<string>();
  for (const tr of m.t) {
    if (tr.a >= n || tr.b >= n) return 'structure';
    const key = `${tr.a}>${tr.b}`;
    if (pairs.has(key)) return 'structure';
    pairs.add(key);
    const symbols = transitionSymbols(tr.c);
    if (!symbols || new Set(symbols).size !== symbols.length) return 'alphabet';
    symbols.forEach((x) => alphabet.add(x));
  }
  if (new Set(m.s.map((s) => s.l)).size !== n) return 'structure';
  if (m.s.every((s) => !s.f)) return 'structure';
  if ([...m.w].some((ch) => !alphabet.has(ch))) return 'alphabet';
  return null;
}

/**
 * Whether the automaton accepts `word`: every state it can be in after each symbol (a NEA is
 * followed along all its ways at once), accepted when one of them is final. Null when the
 * automaton does not hold.
 */
export function accepts(m: Automaton, word: string): boolean | null {
  if (automatonProblem(m) !== null) return null;
  let now = new Set([0]);
  for (const ch of word) {
    const next = new Set<number>();
    for (const tr of m.t) {
      if (now.has(tr.a) && (transitionSymbols(tr.c) ?? []).includes(ch)) next.add(tr.b);
    }
    now = next;
  }
  return [...now].some((s) => m.s[s]?.f === true);
}

// ─────────────── one entry for every tree figure ───────────────

/** The first rule a tree figure breaks, or null when it holds. */
export function treeProblem(f: TreeFigureData): TreeProblem | null {
  switch (f.type) {
    case 'tree':
      return probTreeProblem(f);
    case 'pedigree':
      return pedigreeProblem(f);
    case 'automaton':
      return automatonProblem(f);
  }
}

// ─────────────── layout ───────────────

export type XY = { x: number; y: number };

/** Vertical room per leaf of a probability tree, and per level of a plain tree. */
export const TREE_ROW = 26;
export const TREE_LEVEL = 50;

/**
 * Where each node of a tree stands: leaves one slot apart in the order they are listed, every
 * other node centred over its first and last child. A probability tree grows to the right (as in
 * the schoolbook, the leaves stacked), a plain tree downwards. Units are pixels at `width`.
 */
export function treeLayout(
  t: ProbTree,
  width: number,
): { at: XY[]; width: number; height: number } {
  const kids = children(t);
  const depth = depths(t);
  const slot: number[] = [];
  let next = 0;
  // Leaves take slots in the order they are listed; a parent sits between its outer children.
  const walk = (i: number): number => {
    const k = kids[i] ?? [];
    if (k.length === 0) {
      slot[i] = next++;
      return slot[i] as number;
    }
    const pos = k.map(walk);
    slot[i] = ((pos[0] as number) + (pos[pos.length - 1] as number)) / 2;
    return slot[i] as number;
  };
  walk(0);
  const leaves = Math.max(1, next);
  const levels = Math.max(1, ...depth);
  if (t.pr) {
    // Root at the left edge; the rest share the width, the leaf labels inside the last column.
    const label = LIMITS.pr.node * TREE_CHAR;
    const col = (width - 8 - label) / levels;
    const at = t.n.map((_, i) => ({
      x: 4 + (depth[i] ?? 0) * col,
      y: TREE_ROW / 2 + (slot[i] ?? 0) * TREE_ROW,
    }));
    return { at, width, height: leaves * TREE_ROW };
  }
  const gap = Math.min(TREE_ROW * 2, width / leaves);
  const used = gap * leaves;
  const at = t.n.map((_, i) => ({
    x: (width - used) / 2 + gap / 2 + (slot[i] ?? 0) * gap,
    y: 16 + (depth[i] ?? 0) * TREE_LEVEL,
  }));
  return { at, width, height: 32 + levels * TREE_LEVEL };
}

/**
 * Where an automaton's states stand: on an ellipse, the start state at the left and the others
 * clockwise — the textbook drawing for a handful of states, every pair of states visible.
 */
export function automatonLayout(
  m: Automaton,
  width: number,
  radius: number,
): { at: XY[]; height: number } {
  const n = m.s.length;
  // Room above and below the states for a loop (about 34 px beyond the circle) and its label.
  const height = n <= 2 ? radius * 2 + 84 : 200;
  const cx = width / 2;
  const cy = height / 2;
  // The start arrow needs room left of the first state.
  const rx = width / 2 - radius - 26;
  const ry = height / 2 - radius - 36;
  if (n === 1) return { at: [{ x: cx, y: cy + 12 }], height };
  if (n === 2) {
    return {
      at: [
        { x: cx - rx, y: cy + 12 },
        { x: cx + rx, y: cy + 12 },
      ],
      height,
    };
  }
  const at = m.s.map((_, k) => {
    const angle = Math.PI + (2 * Math.PI * k) / n;
    return { x: cx + rx * Math.cos(angle), y: cy - ry * Math.sin(angle) };
  });
  return { at, height };
}
