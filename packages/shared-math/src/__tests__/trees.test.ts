// Trees, pedigrees and automata (issue #256): what code computes and what it refuses.

import { describe, expect, it } from 'vitest';

import {
  compatibleModes,
  generations,
  genotypeOptions,
  pedigreeLayout,
  possibleGenotypes,
  type Pedigree,
  type Person,
} from '../pedigree.js';
import {
  accepts,
  automatonLayout,
  parseProbability,
  ratioValue,
  TREE_WIDTH,
  treeKey,
  treeLayout,
  treeProblem,
  type Automaton,
  type ProbTree,
} from '../trees.js';

const n = (p: number, l: string, e: string) => ({ p, l, e });

/** An urn with 3 red and 2 blue balls, two draws without putting back. */
function urn(over: Partial<ProbTree> = {}): ProbTree {
  return {
    type: 'tree',
    pr: true,
    n: [
      n(-1, '', ''),
      n(0, 'R', '3/5'),
      n(0, 'B', '2/5'),
      n(1, 'R', '2/4'),
      n(1, 'B', '2/4'),
      n(2, 'R', '3/4'),
      n(2, 'B', '1/4'),
    ],
    ask: 'none',
    at: [],
    ...over,
  };
}

const frac = (r: { n: bigint; d: bigint } | null) => (r ? `${r.n}/${r.d}` : null);

describe('probability trees', () => {
  it('reads a branch as a fraction or a decimal, exactly', () => {
    expect(frac(parseProbability('3/5'))).toBe('3/5');
    expect(frac(parseProbability('0,4'))).toBe('2/5');
    expect(frac(parseProbability('0.25'))).toBe('1/4');
    expect(frac(parseProbability('1'))).toBe('1/1');
    expect(parseProbability('4/3')).toBeNull();
    expect(parseProbability('1/0')).toBeNull();
    expect(parseProbability('rot')).toBeNull();
    expect(parseProbability('40 %')).toBeNull();
  });

  it('holds when every node’s branches add up to 1', () => {
    expect(treeProblem(urn())).toBeNull();
    // 0.3 + 0.7 is 1 in fractions, whatever a float says about it.
    const t = urn();
    const decimals = {
      ...t,
      n: [n(-1, '', ''), n(0, 'A', '0.3'), n(0, 'B', '0.7')],
    };
    expect(treeProblem(decimals)).toBeNull();
  });

  it('rejects branches that do not add up to 1 (never repaired)', () => {
    const t = urn();
    const broken = { ...t, n: t.n.map((x, i) => (i === 4 ? { ...x, e: '1/4' } : x)) };
    expect(treeProblem(broken)).toBe('branch_sum');
    const decimals = { ...t, n: [n(-1, '', ''), n(0, 'A', '0.3'), n(0, 'B', '0.6')] };
    expect(treeProblem(decimals)).toBe('branch_sum');
  });

  it('rejects a branch that is no probability', () => {
    const t = urn();
    expect(treeProblem({ ...t, n: t.n.map((x, i) => (i === 1 ? { ...x, e: 'rot' } : x)) })).toBe(
      'probability',
    );
  });

  it('computes the path and the sum of paths', () => {
    expect(frac(treeKey(urn({ ask: 'path', at: [3] })))).toBe('3/10');
    // P(one red, one blue) = 3/5·2/4 + 2/5·3/4 = 3/5
    expect(frac(treeKey(urn({ ask: 'sum', at: [4, 5] })))).toBe('3/5');
    expect(ratioValue(treeKey(urn({ ask: 'path', at: [6] }))!)).toBeCloseTo(0.1);
  });

  it('fills the one "?" from its siblings and computes it as the key', () => {
    const t = urn();
    const asked = {
      ...t,
      n: t.n.map((x, i) => (i === 6 ? { ...x, e: '?' } : x)),
      ask: 'edge' as const,
    };
    expect(treeProblem(asked)).toBeNull();
    expect(frac(treeKey(asked))).toBe('1/4');
    // A path through the "?" uses the computed value.
    expect(frac(treeKey({ ...asked, ask: 'path', at: [6] }))).toBe('1/10');
  });

  it('rejects two "?", a "?" nobody asks for, and an "edge" question without one', () => {
    const t = urn();
    const two = { ...t, n: t.n.map((x, i) => (i === 5 || i === 6 ? { ...x, e: '?' } : x)) };
    expect(treeProblem({ ...two, ask: 'edge' })).toBe('unknowns');
    const one = { ...t, n: t.n.map((x, i) => (i === 6 ? { ...x, e: '?' } : x)) };
    expect(treeProblem({ ...one, ask: 'none' })).toBe('ask');
    expect(treeProblem(urn({ ask: 'edge' }))).toBe('unknowns');
  });

  it('rejects a sum over paths that are not disjoint leaves', () => {
    expect(treeProblem(urn({ ask: 'sum', at: [1, 3] }))).toBe('ask');
    expect(treeProblem(urn({ ask: 'sum', at: [3, 3] }))).toBe('ask');
    expect(treeProblem(urn({ ask: 'path', at: [] }))).toBe('ask');
  });

  it('rejects a broken structure and a tree too wide for a phone', () => {
    const t = urn();
    expect(treeProblem({ ...t, n: [n(-1, '', ''), n(2, 'A', '1/2'), n(0, 'B', '1/2')] })).toBe(
      'structure',
    );
    expect(treeProblem({ ...t, n: [n(0, '', ''), n(0, 'A', '1')] })).toBe('structure');
    const wide = {
      ...t,
      n: [n(-1, '', ''), ...Array.from({ length: 10 }, () => n(0, 'x', '1/10'))],
    };
    expect(treeProblem(wide)).toBe('too_wide');
  });

  it('a plain tree asks nothing code could check', () => {
    const plain: ProbTree = {
      type: 'tree',
      pr: false,
      n: [n(-1, '8', ''), n(0, '3', ''), n(0, '10', ''), n(1, '1', ''), n(1, '6', '')],
      ask: 'none',
      at: [],
    };
    expect(treeProblem(plain)).toBeNull();
    expect(treeProblem({ ...plain, ask: 'path', at: [3] })).toBe('ask');
  });

  it('lays the leaves out in order with every parent between its outer children', () => {
    const { at, height } = treeLayout(urn(), TREE_WIDTH);
    expect(at[3]!.y).toBeLessThan(at[4]!.y);
    expect(at[4]!.y).toBeLessThan(at[5]!.y);
    expect(at[1]!.y).toBeCloseTo((at[3]!.y + at[4]!.y) / 2);
    expect(at[0]!.x).toBeLessThan(at[1]!.x);
    expect(Math.max(...at.map((p) => p.x))).toBeLessThan(TREE_WIDTH);
    expect(height).toBeGreaterThan(0);
  });
});

// ─────────────── pedigrees ───────────────

const P = (s: 'm' | 'f', a: boolean, fa = -1, mo = -1): Person => ({ s, a, fa, mo });

/** Two healthy parents with an affected daughter: only autosomal recessive explains it. */
const recessive: Person[] = [P('m', false), P('f', false), P('f', true, 0, 1), P('m', false, 0, 1)];

/** Affected father, affected son, healthy mother and daughter: AD, AR and XR all fit. */
const open: Person[] = [P('m', true), P('f', false), P('m', true, 0, 1), P('f', false, 0, 1)];

/**
 * Autosomal dominant only: two affected parents with a healthy daughter (not recessive, not
 * X-dominant — the father's X would make her affected) and a healthy son of an affected
 * mother (not X-recessive).
 */
const dominant: Person[] = [
  P('m', true),
  P('f', true),
  P('f', false, 0, 1),
  P('m', false, 0, 1),
  P('m', true, 0, 1),
];

const ped = (p: Person[], over: Partial<Pedigree> = {}): Pedigree => ({
  type: 'pedigree',
  p,
  md: 'ar',
  ask: 'none',
  at: 0,
  ...over,
});

describe('pedigrees', () => {
  it('finds the generations, a partner from outside next to the other', () => {
    // Grandparents 0+1, their son 2 marries 3 (no parents shown), their daughter 4.
    const family = [
      P('m', false),
      P('f', false),
      P('m', false, 0, 1),
      P('f', false),
      P('f', true, 2, 3),
    ];
    expect(generations(family)).toEqual([0, 0, 1, 1, 2]);
    // A founder couple whose child marries into a later generation starts lower.
    const late = [
      P('m', false),
      P('f', false),
      P('m', false, 0, 1),
      P('m', false),
      P('f', false),
      P('f', false, 3, 4),
      P('m', false, 2, 5),
    ];
    expect(generations(late)).toEqual([0, 0, 1, 0, 0, 1, 2]);
  });

  it('rejects parents listed after the child, a mother who is a man, and one parent only', () => {
    expect(generations([P('m', false, 1, 2), P('m', false), P('f', false)])).toBeNull();
    expect(generations([P('m', false), P('m', false), P('f', false, 0, 1)])).toBeNull();
    expect(generations([P('m', false), P('f', false), P('f', false, 0, -1)])).toBeNull();
  });

  it('finds which modes of inheritance explain a pedigree', () => {
    expect(compatibleModes(recessive)).toEqual(['ar']);
    expect(compatibleModes(open)).toEqual(['ad', 'ar', 'xr']);
    expect(compatibleModes(dominant)).toEqual(['ad']);
  });

  it('holds a "which mode" question only when one mode is left', () => {
    expect(treeProblem(ped(recessive, { ask: 'mode' }))).toBeNull();
    expect(treeProblem(ped(dominant, { md: 'ad', ask: 'mode' }))).toBeNull();
    expect(treeProblem(ped(open, { md: 'ad', ask: 'mode' }))).toBe('ambiguous');
    // Drawn for a mode it does not fit.
    expect(treeProblem(ped(recessive, { md: 'ad' }))).toBe('incompatible');
    expect(treeProblem(ped(open, { md: 'xd' }))).toBe('incompatible');
  });

  it('computes a genotype when only one fits, and refuses one that is open', () => {
    // Both parents of an affected child under AR are carriers.
    expect(possibleGenotypes(recessive, 'ar', 0)).toEqual([1]);
    expect(treeProblem(ped(recessive, { ask: 'gt', at: 0 }))).toBeNull();
    // The healthy brother is AA or Aa: no single key.
    expect(possibleGenotypes(recessive, 'ar', 3)).toEqual([0, 1]);
    expect(treeProblem(ped(recessive, { ask: 'gt', at: 3 }))).toBe('ambiguous');
    // Under AD a healthy child of two affected parents makes both of them Aa.
    expect(possibleGenotypes(dominant, 'ad', 1)).toEqual([1]);
  });

  it('writes the genotype options with A for the dominant allele', () => {
    expect(genotypeOptions('ar', P('f', true))).toEqual([
      { text: '$AA$', k: 0 },
      { text: '$Aa$', k: 1 },
      { text: '$aa$', k: 2 },
    ]);
    expect(genotypeOptions('ad', P('m', true)).map((o) => o.k)).toEqual([2, 1, 0]);
    expect(genotypeOptions('xr', P('m', true))).toEqual([
      { text: '$X^{A}Y$', k: 0 },
      { text: '$X^{a}Y$', k: 1 },
    ]);
  });

  it('rejects a person with two partners and a generation too wide for a phone', () => {
    const twoWives = [
      P('m', false),
      P('f', false),
      P('f', false),
      P('m', true, 0, 1),
      P('m', false, 0, 2),
    ];
    expect(treeProblem(ped(twoWives))).toBe('structure');
    const crowd = [
      P('m', false),
      P('f', false),
      ...Array.from({ length: 9 }, () => P('m', false, 0, 1)),
    ];
    expect(treeProblem(ped(crowd))).toBe('too_wide');
  });

  it('lays out partners next to each other and children below them', () => {
    const family = [
      P('m', false),
      P('f', false),
      P('m', false, 0, 1),
      P('f', false),
      P('f', true, 2, 3),
    ];
    const l = pedigreeLayout(ped(family), 266, 20)!;
    expect(l.couples).toEqual([
      { fa: 0, mo: 1, kids: [2] },
      { fa: 2, mo: 3, kids: [4] },
    ]);
    expect(l.at[2]!.y).toBeGreaterThan(l.at[0]!.y);
    expect(l.at[2]!.y).toBe(l.at[3]!.y);
    expect(l.at[3]!.x).toBeGreaterThan(l.at[2]!.x);
  });
});

// ─────────────── automata ───────────────

/** Accepts the words over {0, 1} with an even number of 1s. */
const even: Automaton = {
  type: 'automaton',
  s: [
    { l: 'q0', f: true },
    { l: 'q1', f: false },
  ],
  t: [
    { a: 0, b: 0, c: '0' },
    { a: 0, b: 1, c: '1' },
    { a: 1, b: 1, c: '0' },
    { a: 1, b: 0, c: '1' },
  ],
  w: '1010',
};

describe('automata', () => {
  it('computes whether a word is accepted', () => {
    expect(accepts(even, '1010')).toBe(true);
    expect(accepts(even, '100')).toBe(false);
    expect(accepts(even, '')).toBe(true);
    expect(treeProblem(even)).toBeNull();
  });

  it('follows every way of a NEA at once', () => {
    // Words ending in "01": q0 -0,1-> q0, q0 -0-> q1, q1 -1-> q2 (final).
    const nea: Automaton = {
      type: 'automaton',
      s: [
        { l: 'q0', f: false },
        { l: 'q1', f: false },
        { l: 'q2', f: true },
      ],
      t: [
        { a: 0, b: 0, c: '0,1' },
        { a: 0, b: 1, c: '0' },
        { a: 1, b: 2, c: '1' },
      ],
      w: '1101',
    };
    expect(accepts(nea, '1101')).toBe(true);
    expect(accepts(nea, '110')).toBe(false);
  });

  it('rejects a word with another symbol, a long symbol, a missing state, no final state', () => {
    expect(treeProblem({ ...even, w: '102' })).toBe('alphabet');
    expect(treeProblem({ ...even, t: [{ a: 0, b: 1, c: 'ab' }], w: '' })).toBe('alphabet');
    expect(treeProblem({ ...even, t: [{ a: 0, b: 4, c: '1' }], w: '' })).toBe('structure');
    expect(treeProblem({ ...even, s: even.s.map((s) => ({ ...s, f: false })) })).toBe('structure');
    expect(accepts({ ...even, w: '2' }, '2')).toBeNull();
  });

  it('places the start state at the left', () => {
    const { at } = automatonLayout(even, 266, 16);
    expect(at[0]!.x).toBeLessThan(at[1]!.x);
  });
});
