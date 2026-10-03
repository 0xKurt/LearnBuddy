// Pedigrees (Stammbaumanalyse, issue #256; docs/architecture.md §Practice, Trees).
//
// The model writes the persons (sex, affected or not, father and mother); code decides
// everything else:
//   - the generations, from the parents (partners stand in the same generation);
//   - which modes of inheritance — autosomal or X-linked, dominant or recessive — can explain the
//     pedigree at all: a mode is compatible when SOME assignment of genotypes fits every person's
//     phenotype and Mendel's rules (complete penetrance, no new mutation — the school model).
//     That is a search over genotypes, not a list of rules of thumb, so it also finds what a
//     rule of thumb misses;
//   - which genotype a person must have under that mode, when only one fits.
// A pedigree drawn for a mode it does not fit, or one more than one mode explains while the
// question asks which, is rejected — the question would have no single right answer.
//
// Dependency-free on purpose: the app imports this file by path, so what the server checked is
// exactly what the app draws.

import type { TreeProblem } from './trees.js';

export type Person = { s: 'm' | 'f'; a: boolean; fa: number; mo: number };
export type Mode = 'ad' | 'ar' | 'xd' | 'xr';
export type Pedigree = {
  type: 'pedigree';
  p: readonly Person[];
  md: Mode;
  ask: 'none' | 'mode' | 'gt';
  at: number;
};

/** The four modes, in the order the options of "Welcher Erbgang?" are written. */
export const MODES: readonly Mode[] = ['ad', 'ar', 'xd', 'xr'];

/** Most persons the narrowest phone shows side by side in one generation, and generations. */
export const PEDIGREE_ROW = 8;
export const PEDIGREE_GENERATIONS = 4;
/** Steps the genotype search may take before the figure counts as undecidable. */
const SEARCH_BUDGET = 200_000;

/**
 * Each person's generation (0 = the oldest shown). A child stands one below its parents; a
 * partner with no parents shown stands next to the other parent. Null when the parents of one
 * child stand in different generations or a person's parents do not come before them.
 */
export function generations(p: readonly Person[]): number[] | null {
  const gen: (number | null)[] = p.map(() => null);
  for (const [i, x] of p.entries()) {
    const hasFather = x.fa >= 0;
    if (hasFather !== x.mo >= 0) return null;
    if (!hasFather) continue;
    if (x.fa >= i || x.mo >= i || x.fa === x.mo) return null;
    if (p[x.fa]?.s !== 'm' || p[x.mo]?.s !== 'f') return null;
  }
  // Partners share a generation, a child stands one below its parents, a parent one above its
  // child. Spread until nothing moves; whatever is still open (a family with no link to the
  // rest) starts at 0 and spreads again.
  const set = (i: number, g: number) => {
    if (gen[i] !== null) return false;
    gen[i] = g;
    return true;
  };
  for (;;) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [i, x] of p.entries()) {
        if (x.fa < 0) continue;
        const parent = gen[x.fa] ?? gen[x.mo] ?? null;
        const child = gen[i] ?? null;
        if (parent !== null) {
          moved = set(x.fa, parent) || moved;
          moved = set(x.mo, parent) || moved;
          moved = set(i, parent + 1) || moved;
        } else if (child !== null) {
          moved = set(x.fa, child - 1) || moved;
          moved = set(x.mo, child - 1) || moved;
        }
      }
    }
    const open = gen.indexOf(null);
    if (open < 0) break;
    gen[open] = 0;
  }
  const lowest = Math.min(...gen.map((g) => g ?? 0));
  const out = gen.map((g) => (g ?? 0) - lowest);
  for (const x of p) {
    if (x.fa >= 0 && out[x.fa] !== out[x.mo]) return null;
  }
  for (const [i, x] of p.entries()) {
    if (x.fa >= 0 && out[i] !== (out[x.fa] ?? 0) + 1) return null;
  }
  return out;
}

// ─────────────── genotypes ───────────────

const isX = (m: Mode) => m === 'xd' || m === 'xr';
const isDominant = (m: Mode) => m === 'ad' || m === 'xd';

/** The genotypes a person can carry, as the number of disease alleles. */
function alleleCounts(m: Mode, person: Person): number[] {
  return isX(m) && person.s === 'm' ? [0, 1] : [0, 1, 2];
}

/** Whether `k` disease alleles show (complete penetrance). */
function shows(m: Mode, person: Person, k: number): boolean {
  if (isDominant(m)) return k >= 1;
  return isX(m) && person.s === 'm' ? k === 1 : k === 2;
}

/** The disease alleles a parent with `k` of them can pass on (0 or 1 per gamete). */
function gametes(k: number): number[] {
  return k === 0 ? [0] : k === 1 ? [0, 1] : [1];
}

/** Whether a child with `k` disease alleles can come from parents with `kf` and `km`. */
function inherits(m: Mode, child: Person, k: number, kf: number, km: number): boolean {
  if (isX(m)) {
    // A son gets his X from his mother only; a daughter gets her father's one X and one of her
    // mother's two.
    if (child.s === 'm') return gametes(km).includes(k);
    return gametes(km).some((b) => kf + b === k);
  }
  return gametes(kf).some((a) => gametes(km).some((b) => a + b === k));
}

/**
 * Whether some assignment of genotypes explains the pedigree under mode `m` — with person
 * `fixed.i` held at `fixed.k` alleles, if given. Null when the search ran out of steps.
 */
function explains(p: readonly Person[], m: Mode, fixed?: { i: number; k: number }): boolean | null {
  const k: number[] = [];
  let steps = 0;
  const go = (i: number): boolean | null => {
    if (i === p.length) return true;
    const x = p[i] as Person;
    for (const c of alleleCounts(m, x)) {
      if (++steps > SEARCH_BUDGET) return null;
      if (fixed && fixed.i === i && fixed.k !== c) continue;
      if (shows(m, x, c) !== x.a) continue;
      if (x.fa >= 0 && !inherits(m, x, c, k[x.fa] ?? 0, k[x.mo] ?? 0)) continue;
      k[i] = c;
      const r = go(i + 1);
      if (r !== false) return r;
    }
    return false;
  };
  return go(0);
}

/** The modes that explain the pedigree; null when the search could not decide one of them. */
export function compatibleModes(p: readonly Person[]): Mode[] | null {
  const out: Mode[] = [];
  for (const m of MODES) {
    const r = explains(p, m);
    if (r === null) return null;
    if (r) out.push(m);
  }
  return out;
}

/** The allele counts person `i` can have under mode `m`; null when undecidable. */
export function possibleGenotypes(p: readonly Person[], m: Mode, i: number): number[] | null {
  const person = p[i];
  if (!person) return [];
  const out: number[] = [];
  for (const k of alleleCounts(m, person)) {
    const r = explains(p, m, { i, k });
    if (r === null) return null;
    if (r) out.push(k);
  }
  return out;
}

/**
 * The genotype options of "Welchen Genotyp hat Person …?" for this person under this mode, in
 * the order code writes them, and the allele count each stands for. `A` is always the dominant
 * allele: the disease allele for a dominant mode, the healthy one for a recessive mode.
 */
export function genotypeOptions(m: Mode, person: Person): { text: string; k: number }[] {
  const d = isDominant(m);
  if (isX(m) && person.s === 'm') {
    return [
      { text: '$X^{A}Y$', k: d ? 1 : 0 },
      { text: '$X^{a}Y$', k: d ? 0 : 1 },
    ];
  }
  const forms = isX(m)
    ? ['$X^{A}X^{A}$', '$X^{A}X^{a}$', '$X^{a}X^{a}$']
    : ['$AA$', '$Aa$', '$aa$'];
  return forms.map((text, idx) => ({ text, k: d ? 2 - idx : idx }));
}

/** The first rule a pedigree breaks, or null (`treeProblem` for the other tree figures). */
export function pedigreeProblem(f: Pedigree): TreeProblem | null {
  const gen = generations(f.p);
  if (!gen) return 'structure';
  // Each person has at most one partner: the drawing joins partners with one line.
  const partner = new Map<number, number>();
  for (const x of f.p) {
    if (x.fa < 0) continue;
    for (const [a, b] of [
      [x.fa, x.mo],
      [x.mo, x.fa],
    ] as const) {
      if ((partner.get(a) ?? b) !== b) return 'structure';
      partner.set(a, b);
    }
  }
  const rows = new Map<number, number>();
  gen.forEach((g) => rows.set(g, (rows.get(g) ?? 0) + 1));
  if (rows.size > PEDIGREE_GENERATIONS || Math.max(...rows.values()) > PEDIGREE_ROW) {
    return 'too_wide';
  }
  const modes = compatibleModes(f.p);
  if (modes === null) return 'undecided';
  if (!modes.includes(f.md)) return 'incompatible';
  if (f.ask === 'none') return f.at === 0 ? null : 'ask';
  // "Welcher Erbgang?" and "Welcher Genotyp?" both need the ONE mode the pedigree allows: a
  // genotype under a mode the drawing does not settle would depend on a premise code cannot see.
  if (modes.length !== 1) return 'ambiguous';
  if (f.ask === 'mode') return f.at === 0 ? null : 'ask';
  if (f.at >= f.p.length) return 'ask';
  const options = possibleGenotypes(f.p, f.md, f.at);
  if (options === null) return 'undecided';
  return options.length === 1 ? null : 'ambiguous';
}

// ─────────────── layout ───────────────

export type PedigreeLayout = {
  /** Each person's centre, in the units of `width`. */
  at: { x: number; y: number }[];
  gen: number[];
  /** Partners (father, mother) with the children they have. */
  couples: { fa: number; mo: number; kids: number[] }[];
  height: number;
};

/** Vertical distance between two generations, and the size of a person's symbol. */
export const PEDIGREE_LEVEL = 64;
export const PEDIGREE_SYMBOL = 22;

/**
 * Where each person stands: one row per generation, a partner next to the other, children in
 * the order they are listed, under their parents as far as the row allows.
 */
export function pedigreeLayout(f: Pedigree, width: number, left: number): PedigreeLayout | null {
  const gen = generations(f.p);
  if (!gen) return null;
  const couples: PedigreeLayout['couples'] = [];
  f.p.forEach((x, i) => {
    if (x.fa < 0) return;
    const c = couples.find((k) => k.fa === x.fa && k.mo === x.mo);
    if (c) c.kids.push(i);
    else couples.push({ fa: x.fa, mo: x.mo, kids: [i] });
  });
  const partnerOf = (i: number) => {
    const c = couples.find((k) => k.fa === i || k.mo === i);
    return c ? (c.fa === i ? c.mo : c.fa) : -1;
  };
  const rows = Math.max(...gen) + 1;
  const usable = width - left;
  const at = f.p.map(() => ({ x: 0, y: 0 }));
  const hasParents = (i: number) => (f.p[i]?.fa ?? -1) >= 0;
  // Row by row: a partner with no parents shown is pulled next to the other (man left), and the
  // families of a row stand in the order of their parents above, else as listed.
  for (let g = 0; g < rows; g++) {
    const units: number[][] = [];
    const placed = new Set<number>();
    for (const [i] of f.p.entries()) {
      if (gen[i] !== g || placed.has(i)) continue;
      const mate = partnerOf(i);
      const pulled = mate >= 0 && !placed.has(mate) && !hasParents(mate);
      const unit = !pulled
        ? [i]
        : hasParents(i)
          ? [i, mate]
          : f.p[i]?.s === 'm'
            ? [i, mate]
            : [mate, i];
      unit.forEach((k) => placed.add(k));
      units.push(unit);
    }
    const key = (unit: number[], idx: number) => {
      const child = unit.find(hasParents);
      if (child === undefined) return 1e6 + idx;
      const x = f.p[child] as Person;
      return ((at[x.fa]?.x ?? 0) + (at[x.mo]?.x ?? 0)) / 2 + idx * 1e-3;
    };
    const row = units
      .map((u, idx) => ({ u, k: key(u, idx) }))
      .sort((a, b) => a.k - b.k)
      .flatMap((e) => e.u);
    const step = usable / Math.max(row.length, 1);
    row.forEach((i, k) => {
      at[i] = { x: left + step * (k + 0.5), y: PEDIGREE_SYMBOL + g * PEDIGREE_LEVEL };
    });
  }
  return { at, gen, couples, height: PEDIGREE_SYMBOL * 2 + (rows - 1) * PEDIGREE_LEVEL + 14 };
}
