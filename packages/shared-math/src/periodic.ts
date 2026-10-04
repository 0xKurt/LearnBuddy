// The periodic table (issue #250): the element facts, where each element stands, and the key of
// every question a periodic-table figure can ask. docs/architecture.md §Practice, Periodic table.
//
// The facts are DATA, never a model's word: symbol, atomic mass, electronegativity and class come
// from `elements.data.ts`, which `scripts/elements.mjs` generates from the MIT package
// `periodic-table-data` (PubChem's table). Group and period are not stored at all — they follow
// from the atomic number by the shell rule below. The server checks a figure with these functions
// (`apps/api/src/modules/practice/periodicCheck.ts`) and the app draws it with the same ones
// (`apps/mobile/components/math/PeriodicTable.tsx`), so what is drawn is what was checked.
//
// What a table shows, as German school tables do:
//   main — the main groups I–VIII (IUPAC 1, 2, 13–18), periods 1–6: years 7–10.
//   full — groups 1–18, periods 1–7: the upper school. The lanthanoids and actinoids (Ce–Lu,
//          Th–Lr) are left out — a phone has no room for the two loose rows, and La and Ac stand
//          in group 3, as on the tables schools hand out. The app's zoom carries the small cells.
//
// Dependency-free on purpose: the app imports this file by path (no mathjs in its bundle).

import { CLASSES, MASSES, NEGATIVITY, SYMBOLS } from './elements.data.js';

export type ElementClass = 'metal' | 'metalloid' | 'nonmetal';

export type ChemElement = {
  /** Atomic number. */
  z: number;
  sym: string;
  /** Atomic mass in u (for an element without a stable isotope: its longest-lived one). */
  mass: number;
  /** Pauling electronegativity; null where the data has none (most noble gases). */
  en: number | null;
  cls: ElementClass;
  period: number;
  /** IUPAC group 1–18; null for the lanthanoids and actinoids after La and Ac. */
  group: number | null;
};

const CLASS_OF: Record<string, ElementClass> = { m: 'metal', s: 'metalloid', n: 'nonmetal' };

/** The last atomic number of each period. */
const PERIOD_ENDS = [2, 10, 18, 36, 54, 86, 118] as const;

/** Period and IUPAC group from the atomic number: the filling order of the shells. */
export function position(z: number): { period: number; group: number | null } {
  const period = PERIOD_ENDS.findIndex((end) => z <= end) + 1;
  const start = period === 1 ? 1 : (PERIOD_ENDS[period - 2] ?? 0) + 1;
  const i = z - start;
  if (period === 1) return { period, group: z === 1 ? 1 : 18 };
  if (period <= 3) return { period, group: i < 2 ? i + 1 : i + 11 };
  if (period <= 5) return { period, group: i + 1 };
  // Periods 6 and 7: s block, then La/Ac in group 3, then 14 f-block elements, then groups 4–18.
  if (i < 3) return { period, group: i + 1 };
  if (i < 17) return { period, group: null };
  return { period, group: i - 13 };
}

const [MASS, EN, CLS] = [MASSES, NEGATIVITY, CLASSES].map((list) => list.split(' '));

export const ELEMENTS: readonly ChemElement[] = SYMBOLS.split(' ').map((sym, i) => {
  const en = EN?.[i];
  return {
    z: i + 1,
    sym,
    mass: Number(MASS?.[i]),
    en: en === undefined || en === '-' ? null : Number(en),
    cls: CLASS_OF[CLS?.[i] ?? ''] ?? 'metal',
    ...position(i + 1),
  };
});

const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.sym, e]));

/** The element with this symbol, exactly as printed ("Na", never "NA"). */
export function element(sym: string): ChemElement | undefined {
  return BY_SYMBOL.get(sym);
}

export type TableVariant = 'main' | 'full';

/** A main group as German schools number it: 1, 2, 13–18 → I–VIII (1–8); null otherwise. */
export function mainGroup(group: number | null): number | null {
  if (group === 1 || group === 2) return group;
  if (group !== null && group >= 13) return group - 10;
  return null;
}

/** The main groups' names as a German school table prints them over the columns. */
export const MAIN_GROUP_NAMES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;

/** Where an element stands in a table (column and row from 0), or null when it is not in it. */
export function cellOf(e: ChemElement, v: TableVariant): { col: number; row: number } | null {
  if (e.group === null) return null;
  if (v === 'full') return { col: e.group - 1, row: e.period - 1 };
  const g = mainGroup(e.group);
  return g === null || e.period > 6 ? null : { col: g - 1, row: e.period - 1 };
}

export const TABLE_SIZE: Record<TableVariant, { cols: number; rows: number }> = {
  main: { cols: 8, rows: 6 },
  full: { cols: 18, rows: 7 },
};

/** Every cell of a table with its element. */
export function tableCells(v: TableVariant): { e: ChemElement; col: number; row: number }[] {
  return ELEMENTS.flatMap((e) => {
    const at = cellOf(e, v);
    return at ? [{ e, ...at }] : [];
  });
}

/**
 * Valence electrons (Außenelektronen) of a main-group element: the group's last digit, He 2.
 * Null for a transition metal: school chemistry does not ask it there.
 */
export function valenceElectrons(e: ChemElement): number | null {
  if (e.z === 2) return 2;
  return mainGroup(e.group);
}

/**
 * Whether "neutrons from the rounded mass" means anything: only an element with a stable isotope
 * has a mass a school table rounds to its common isotope. Tc, Pm and everything from Po on have
 * none (Bi counts as stable, as schoolbooks treat it).
 */
export function hasStableIsotope(e: ChemElement): boolean {
  return e.z <= 83 && e.z !== 43 && e.z !== 61;
}

// ─── the figure and its keys ───

export type PeriodicAsk =
  | 'none'
  | 'protons'
  | 'electrons'
  | 'neutrons'
  | 'valence'
  | 'group'
  | 'period'
  | 'shells'
  | 'class'
  | 'en_max'
  | 'radius_max';

/** A periodic-table figure as the contract has it (packages/shared-types/…/periodic.ts). */
export type PeriodicTableData = {
  type: 'periodic_table';
  v: TableVariant;
  hl: string[];
  ask: PeriodicAsk;
  at: string;
};

export function isPeriodicTable(f: { type: string }): f is PeriodicTableData {
  return f.type === 'periodic_table';
}

/** The asks answered by a number, the rest by one of the options code writes. */
const NUMBER_ASKS: readonly PeriodicAsk[] = [
  'protons',
  'electrons',
  'neutrons',
  'valence',
  'group',
  'period',
  'shells',
];
/** The asks whose options are the marked elements. */
const COMPARE_ASKS: readonly PeriodicAsk[] = ['en_max', 'radius_max'];

export const ELEMENT_CLASSES: readonly ElementClass[] = ['metal', 'metalloid', 'nonmetal'];

export type PeriodicKey =
  | { kind: 'number'; value: number }
  /** `class`: the index into ELEMENT_CLASSES. `en_max`/`radius_max`: into the marked elements. */
  | { kind: 'choice'; index: number };

/** The index of the single largest value, or null when there is none or a tie. */
function argmaxUnique(values: (number | null)[]): number | null {
  if (values.some((v) => v === null)) return null;
  const nums = values as number[];
  const max = Math.max(...nums);
  const at = nums.indexOf(max);
  return nums.lastIndexOf(max) === at ? at : null;
}

/**
 * Which of the marked elements has the largest atom, from the position alone: down a group the
 * atom grows, along a period it shrinks. Only for elements in ONE group or ONE period of the
 * main groups 1–17 — across both, or with a noble gas (whose radius is another kind of radius),
 * the position does not decide it, and the question is not asked.
 */
function largestAtom(els: ChemElement[]): number | null {
  const groups = new Set(els.map((e) => e.group));
  const periods = new Set(els.map((e) => e.period));
  if (groups.size === 1 && periods.size === els.length) {
    return argmaxUnique(els.map((e) => e.period));
  }
  const mainNotNoble = els.every((e) => mainGroup(e.group) !== null && e.group !== 18);
  if (periods.size === 1 && groups.size === els.length && mainNotNoble) {
    return argmaxUnique(els.map((e) => -(e.group ?? 0)));
  }
  return null;
}

/** The computed key of a figure's question, or null when it has none it could compute. */
export function periodicKey(f: PeriodicTableData): PeriodicKey | null {
  if (f.ask === 'none') return null;
  if (COMPARE_ASKS.includes(f.ask)) {
    const els = f.hl.map(element);
    if (els.some((e) => e === undefined)) return null;
    const known = els as ChemElement[];
    const index = f.ask === 'en_max' ? argmaxUnique(known.map((e) => e.en)) : largestAtom(known);
    return index === null ? null : { kind: 'choice', index };
  }
  const e = element(f.at);
  if (!e) return null;
  // From polonium on, sources disagree (PubChem: Po a metalloid, At a halogen; schoolbooks often
  // the other way round) or nothing is known: the class of those is not asked.
  if (f.ask === 'class') {
    return e.z > 83 ? null : { kind: 'choice', index: ELEMENT_CLASSES.indexOf(e.cls) };
  }
  const number = (value: number | null): PeriodicKey | null =>
    value === null ? null : { kind: 'number', value };
  switch (f.ask) {
    case 'protons':
    case 'electrons':
      return number(e.z);
    case 'neutrons':
      return number(hasStableIsotope(e) ? Math.round(e.mass) - e.z : null);
    case 'valence':
      return number(valenceElectrons(e));
    // The group as the drawn table numbers it: I–VIII in the main-group table, 1–18 in the full.
    case 'group':
      return number(f.v === 'main' ? mainGroup(e.group) : e.group);
    case 'period':
    case 'shells':
      return number(e.period);
    default:
      return null;
  }
}

/** Whether the key is a number (a numeric question) or an option code writes. */
export function periodicAnswerKind(ask: PeriodicAsk): 'number' | 'choice' | null {
  if (ask === 'none') return null;
  return NUMBER_ASKS.includes(ask) ? 'number' : 'choice';
}

/**
 * Why a figure may not be shown, or null when it holds: an unknown symbol, an element the drawn
 * table does not have, a mark twice, or a question whose key cannot be computed from the table.
 */
export function periodicProblem(f: PeriodicTableData): string | null {
  const inTable = (sym: string) => {
    const e = element(sym);
    return e !== undefined && cellOf(e, f.v) !== null;
  };
  if (f.hl.some((s) => !inTable(s))) return 'unknown_or_missing_element';
  if (new Set(f.hl).size !== f.hl.length) return 'marked_twice';
  if (f.at !== '' && !inTable(f.at)) return 'unknown_or_missing_element';
  if (f.ask === 'none') return f.at === '' ? null : 'element_without_question';
  if (COMPARE_ASKS.includes(f.ask)) {
    if (f.at !== '' || f.hl.length < 2 || f.hl.length > 4) return 'compare_needs_2_to_4_marks';
  } else if (f.at === '' || !f.hl.includes(f.at)) {
    // The element a question is about is the one marked in the table.
    return 'asked_element_not_marked';
  }
  return periodicKey(f) === null ? 'no_key' : null;
}
