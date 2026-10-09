// Nuclear reactions, judged by counting (issue #263).
//
// A decay or a nuclear reaction is balanced when the mass numbers and the atomic numbers add up
// on both sides — the same kind of certainty `chemistry.ts` has for atoms and charge, one level
// further in. "²³⁸₉₂U → ²³⁴₉₀Th + ⁴₂He" is right, "²³⁸₉₂U → ²³⁴₉₀Th + ³₂He" is not, and no model
// is needed to see either.
//
// What it reads (notation only — nothing is guessed about what a word means):
//   - a mass number in front, as a superscript or with a caret: ²³⁸U, ^238U, ^{238}_{92}U,
//     ²³⁸₉₂U; or after the symbol with a hyphen: U-238;
//   - an atomic number in front as a subscript; without one it comes from the periodic table,
//     which is a table of facts, not a reading of language;
//   - the particles: α (a helium-4 nucleus), β⁻ / β⁺, γ, n, p, e⁻ / e⁺, ν and ν̄.
// An equation counts as nuclear only when one of its terms carries a mass number or is one of
// the Greek particles — that is what tells "²³⁸U → …" from a chemical "H2 + O2 → H2O".
//
// What it deliberately does not do, like `chemistry.ts`: decide whether the reaction is the one
// the task asked for. Other nuclides on the left are another reaction, and that stays `unknown`.

import { plainMath } from '@learnbuddy/shared-math';

/** The elements in order of atomic number: the symbol's index + 1 is its atomic number. */
const ELEMENTS = (
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se ' +
  'Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb ' +
  'Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm ' +
  'Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
).split(' ');

/** Mass and atomic number of a particle written by its own sign. */
const PARTICLES: Readonly<Record<string, { a: number; z: number }>> = {
  α: { a: 4, z: 2 },
  'β-': { a: 0, z: -1 },
  'β+': { a: 0, z: 1 },
  β: { a: 0, z: -1 },
  γ: { a: 0, z: 0 },
  n: { a: 1, z: 0 },
  p: { a: 1, z: 1 },
  'e-': { a: 0, z: -1 },
  'e+': { a: 0, z: 1 },
  ν: { a: 0, z: 0 },
  ν̄: { a: 0, z: 0 },
};

const GREEK = /[αβγν]/;

const ARROW = /(?:<=>|<->|⇌|⟶|→|->)/;

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** Superscript digits → "^238", subscript digits → "_92", ⁺⁻ → +-, and the LaTeX wrapping gone. */
function normalised(raw: string): string {
  let s = plainMath(raw)
    .replace(/\\(?:mathrm|text|mathit)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:alpha)\b/g, 'α')
    .replace(/\\(?:beta)\b/g, 'β')
    .replace(/\\(?:gamma)\b/g, 'γ')
    .replace(/\\bar\s*\{?\s*\\nu\s*\}?|\\overline\s*\{\s*\\nu\s*\}/g, 'ν̄')
    .replace(/\\nu\b/g, 'ν')
    .replace(/\{\}/g, '')
    .replace(/[{}]/g, '');
  let out = '';
  let mode: 'sup' | 'sub' | null = null;
  for (const ch of s) {
    const sup = SUP.indexOf(ch);
    const sub = SUB.indexOf(ch);
    if (sup >= 0) {
      if (mode !== 'sup') out += '^';
      out += String(sup);
      mode = 'sup';
    } else if (sub >= 0) {
      if (mode !== 'sub') out += '_';
      out += String(sub);
      mode = 'sub';
    } else if (ch === '₋') {
      // A subscript minus starts (or continues) an atomic number: ⁰₋₁e is ^0_-1e.
      if (mode !== 'sub') out += '_';
      out += '-';
      mode = 'sub';
    } else if (ch === '⁻' || ch === '⁺') {
      // A superscript sign is a charge: β⁻, e⁺.
      out += ch === '⁻' ? '-' : '+';
      mode = null;
    } else {
      out += ch;
      mode = null;
    }
  }
  s = out;
  return s;
}

type Nuclide = { a: number; z: number; label: string };

/**
 * One term: an optional count, then a nuclide or particle. Null for anything not read
 * completely, and for a nuclide whose written atomic number is not its element's — that is not
 * a nuclide this module can count.
 */
function nuclideOf(raw: string): { count: number; n: Nuclide; marked: boolean } | null {
  let t = raw.replace(/\s+/g, '');
  let count = 1;
  // A count is a number followed by a space in the original or directly by the term's start,
  // but never the mass number itself (that one carries a caret).
  const c = /^(\d+)(?=[\^_A-Za-zαβγν])/.exec(t);
  if (c) {
    count = Number(c[1]);
    t = t.slice(c[0].length);
    if (count === 0) return null;
  }
  // Prefix numbers: ^A, _Z, in either order.
  let a: number | null = null;
  let z: number | null = null;
  for (let i = 0; i < 2; i++) {
    const sup = /^\^(\d+)/.exec(t);
    if (sup) {
      a = Number(sup[1]);
      t = t.slice(sup[0].length);
      continue;
    }
    const sub = /^_(-?\d+)/.exec(t);
    if (sub) {
      z = Number(sub[1]);
      t = t.slice(sub[0].length);
    }
  }
  // Suffix mass number: U-238.
  const suffix = /^([A-Z][a-z]?)-(\d+)$/.exec(t);
  if (suffix) {
    if (a !== null) return null;
    t = suffix[1]!;
    a = Number(suffix[2]);
  }
  const marked = a !== null || GREEK.test(t);
  // ⁰₋₁e and ⁰₁e: the electron and the positron by their written atomic number.
  if (t === 'e' && z !== null) t = z < 0 ? 'e-' : 'e+';
  const particle = PARTICLES[t.replace(/^e\^/, 'e').replace(/^β\^/, 'β')];
  if (particle) {
    // A particle may carry its numbers written out (⁴₂He is α, ⁰₋₁e is β⁻): they must agree.
    if ((a !== null && a !== particle.a) || (z !== null && z !== particle.z)) return null;
    return { count, n: { ...particle, label: t }, marked };
  }
  const element = ELEMENTS.indexOf(t);
  if (element < 0 || a === null) return null;
  const atomic = element + 1;
  if (z !== null && z !== atomic) return null;
  return { count, n: { a, z: atomic, label: t }, marked };
}

/**
 * The terms of one side. "+" separates terms, except the "+" right after a standalone e or β,
 * which is that particle's charge (e⁺, β⁺) — told apart by what stands before it, never guessed.
 */
function termsOf(side: string): string[] | null {
  const terms: string[] = [];
  let current = '';
  for (const ch of side) {
    if (ch === '+' && !/(?:^|[^A-Za-z])[eβ]\^?\s*$/.test(current)) {
      terms.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  terms.push(current.trim());
  return terms.every((p) => p !== '') ? terms : null;
}

type Side = { a: number; z: number; nuclides: string[] };

function sideOf(raw: string): { side: Side; marked: boolean } | null {
  const terms = termsOf(raw);
  if (terms === null) return null;
  let a = 0;
  let z = 0;
  let marked = false;
  const nuclides: string[] = [];
  for (const term of terms) {
    const r = nuclideOf(term);
    if (r === null) return null;
    marked ||= r.marked;
    a += r.count * r.n.a;
    z += r.count * r.n.z;
    // γ and the neutrinos carry neither mass number nor charge: writing them is more complete,
    // leaving them out is not wrong, so they never decide whether two reactions are the same.
    if (r.n.a === 0 && r.n.z === 0) continue;
    for (let i = 0; i < r.count; i++) nuclides.push(`${r.n.a}/${r.n.z}`);
  }
  return { side: { a, z, nuclides: nuclides.sort() }, marked };
}

export type NuclearEquation = { left: Side; right: Side };

/** A nuclear equation, or null when the text is none (or one this module cannot read). */
export function parseNuclear(raw: string): NuclearEquation | null {
  const s = normalised(raw);
  const sides = s.split(ARROW);
  if (sides.length !== 2) return null;
  const left = sideOf(sides[0]!);
  const right = sideOf(sides[1]!);
  if (left === null || right === null) return null;
  // Nothing marks it as nuclear: a chemical equation is `chemistry.ts`'s.
  if (!left.marked && !right.marked) return null;
  return { left: left.side, right: right.side };
}

/** Whether a key is worth reading as a nuclear equation at all. */
export function looksNuclear(s: string): boolean {
  return parseNuclear(s) !== null;
}

export type NuclearImbalance =
  | { kind: 'mass_number'; left: number; right: number }
  | { kind: 'atomic_number'; left: number; right: number };

export function nuclearImbalance(eq: NuclearEquation): NuclearImbalance | null {
  if (eq.left.a !== eq.right.a) return { kind: 'mass_number', left: eq.left.a, right: eq.right.a };
  if (eq.left.z !== eq.right.z)
    return { kind: 'atomic_number', left: eq.left.z, right: eq.right.z };
  return null;
}

export type NuclearVerdict =
  | { verdict: 'correct' }
  | { verdict: 'unbalanced'; imbalance: NuclearImbalance }
  | { verdict: 'unknown' };

/**
 * Her nuclear equation against the key. The order of the terms does not matter. Only when she
 * starts from the key's nuclides is anything decided: then it is right when her products are the
 * key's, and a near miss with the place named when the numbers do not add up. Balanced with other
 * products is another reaction — the tutor's question, not arithmetic.
 */
export function checkNuclear(key: string, text: string): NuclearVerdict {
  const want = parseNuclear(key);
  const got = parseNuclear(text);
  if (want === null || got === null) return { verdict: 'unknown' };
  if (want.left.nuclides.join() !== got.left.nuclides.join()) return { verdict: 'unknown' };
  const imbalance = nuclearImbalance(got);
  if (imbalance) return { verdict: 'unbalanced', imbalance };
  return want.right.nuclides.join() === got.right.nuclides.join()
    ? { verdict: 'correct' }
    : { verdict: 'unknown' };
}
