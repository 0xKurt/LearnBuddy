// The periodic table as data (issue #250). docs/architecture.md §Practice ("Figure library").
//
// The facts live HERE, in code, never in a model's answer: symbol, atomic number, group,
// period, standard atomic weight, Pauling electronegativity and whether the element is a metal.
// Every key of a periodic-table question is COMPUTED from this table (apps/api/src/modules/
// practice/periodic.ts) — protons from the atomic number, valence electrons from the group,
// neutrons from the rounded mass — so a model never states a fact a learner is measured on.
//
// What is drawn: the s, p and d blocks. The lanthanoids and actinoids (Ce–Lu, Th–Lr) are not
// in the table: a school table prints them as two loose rows under it, a phone has no room for
// those, and no question of years 7–13 asks for one of them. La and Ac stand in group 3, as in
// the tables German schools hand out.
//
// Two tables, chosen by code from the task:
//   main — the main groups I–VIII (IUPAC 1, 2, 13–18), periods 1–6: what years 7–10 work with.
//          Eight columns side by side on a 360 pt phone (`PERIODIC_MAIN_GROUPS`).
//   full — all 18 groups, periods 1–7: the upper school's table, magnified on the first tap.

import { z } from 'zod';

/** IUPAC group 1–18. */
export type Group = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18;

/**
 * metal / metalloid / nonmetal as school tables colour them. `unclear` where sources disagree
 * (Po, At) or nothing is known (the superheavy elements): no question asks about those.
 */
export type ElementClass = 'metal' | 'metalloid' | 'nonmetal' | 'unclear';

export type ElementFacts = {
  z: number;
  /** As printed: "Na". The element's id in a task is its lower-case form ("na"). */
  sym: string;
  group: Group;
  period: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Standard atomic weight in u; for elements without a stable isotope the mass number of the longest-lived one. */
  mass: number;
  /** Pauling electronegativity; null where a school table leaves the cell empty (noble gases, superheavy). */
  en: number | null;
  cls: ElementClass;
  /** Has at least one stable isotope: only then does "neutrons from the rounded mass" mean anything. */
  stable: boolean;
};

type Row = [number, string, Group, ElementFacts['period'], number, number | null, ElementClass];

// z, symbol, group, period, mass, EN, class
const ROWS: readonly Row[] = [
  [1, 'H', 1, 1, 1.008, 2.2, 'nonmetal'],
  [2, 'He', 18, 1, 4.0026, null, 'nonmetal'],
  [3, 'Li', 1, 2, 6.94, 0.98, 'metal'],
  [4, 'Be', 2, 2, 9.0122, 1.57, 'metal'],
  [5, 'B', 13, 2, 10.81, 2.04, 'metalloid'],
  [6, 'C', 14, 2, 12.011, 2.55, 'nonmetal'],
  [7, 'N', 15, 2, 14.007, 3.04, 'nonmetal'],
  [8, 'O', 16, 2, 15.999, 3.44, 'nonmetal'],
  [9, 'F', 17, 2, 18.998, 3.98, 'nonmetal'],
  [10, 'Ne', 18, 2, 20.18, null, 'nonmetal'],
  [11, 'Na', 1, 3, 22.99, 0.93, 'metal'],
  [12, 'Mg', 2, 3, 24.305, 1.31, 'metal'],
  [13, 'Al', 13, 3, 26.982, 1.61, 'metal'],
  [14, 'Si', 14, 3, 28.085, 1.9, 'metalloid'],
  [15, 'P', 15, 3, 30.974, 2.19, 'nonmetal'],
  [16, 'S', 16, 3, 32.06, 2.58, 'nonmetal'],
  [17, 'Cl', 17, 3, 35.45, 3.16, 'nonmetal'],
  [18, 'Ar', 18, 3, 39.948, null, 'nonmetal'],
  [19, 'K', 1, 4, 39.098, 0.82, 'metal'],
  [20, 'Ca', 2, 4, 40.078, 1.0, 'metal'],
  [21, 'Sc', 3, 4, 44.956, 1.36, 'metal'],
  [22, 'Ti', 4, 4, 47.867, 1.54, 'metal'],
  [23, 'V', 5, 4, 50.942, 1.63, 'metal'],
  [24, 'Cr', 6, 4, 51.996, 1.66, 'metal'],
  [25, 'Mn', 7, 4, 54.938, 1.55, 'metal'],
  [26, 'Fe', 8, 4, 55.845, 1.83, 'metal'],
  [27, 'Co', 9, 4, 58.933, 1.88, 'metal'],
  [28, 'Ni', 10, 4, 58.693, 1.91, 'metal'],
  [29, 'Cu', 11, 4, 63.546, 1.9, 'metal'],
  [30, 'Zn', 12, 4, 65.38, 1.65, 'metal'],
  [31, 'Ga', 13, 4, 69.723, 1.81, 'metal'],
  [32, 'Ge', 14, 4, 72.63, 2.01, 'metalloid'],
  [33, 'As', 15, 4, 74.922, 2.18, 'metalloid'],
  [34, 'Se', 16, 4, 78.971, 2.55, 'nonmetal'],
  [35, 'Br', 17, 4, 79.904, 2.96, 'nonmetal'],
  [36, 'Kr', 18, 4, 83.798, null, 'nonmetal'],
  [37, 'Rb', 1, 5, 85.468, 0.82, 'metal'],
  [38, 'Sr', 2, 5, 87.62, 0.95, 'metal'],
  [39, 'Y', 3, 5, 88.906, 1.22, 'metal'],
  [40, 'Zr', 4, 5, 91.224, 1.33, 'metal'],
  [41, 'Nb', 5, 5, 92.906, 1.6, 'metal'],
  [42, 'Mo', 6, 5, 95.95, 2.16, 'metal'],
  [43, 'Tc', 7, 5, 98, 1.9, 'metal'],
  [44, 'Ru', 8, 5, 101.07, 2.2, 'metal'],
  [45, 'Rh', 9, 5, 102.91, 2.28, 'metal'],
  [46, 'Pd', 10, 5, 106.42, 2.2, 'metal'],
  [47, 'Ag', 11, 5, 107.87, 1.93, 'metal'],
  [48, 'Cd', 12, 5, 112.41, 1.69, 'metal'],
  [49, 'In', 13, 5, 114.82, 1.78, 'metal'],
  [50, 'Sn', 14, 5, 118.71, 1.96, 'metal'],
  [51, 'Sb', 15, 5, 121.76, 2.05, 'metalloid'],
  [52, 'Te', 16, 5, 127.6, 2.1, 'metalloid'],
  [53, 'I', 17, 5, 126.9, 2.66, 'nonmetal'],
  [54, 'Xe', 18, 5, 131.29, null, 'nonmetal'],
  [55, 'Cs', 1, 6, 132.91, 0.79, 'metal'],
  [56, 'Ba', 2, 6, 137.33, 0.89, 'metal'],
  [57, 'La', 3, 6, 138.91, 1.1, 'metal'],
  [72, 'Hf', 4, 6, 178.49, 1.3, 'metal'],
  [73, 'Ta', 5, 6, 180.95, 1.5, 'metal'],
  [74, 'W', 6, 6, 183.84, 2.36, 'metal'],
  [75, 'Re', 7, 6, 186.21, 1.9, 'metal'],
  [76, 'Os', 8, 6, 190.23, 2.2, 'metal'],
  [77, 'Ir', 9, 6, 192.22, 2.2, 'metal'],
  [78, 'Pt', 10, 6, 195.08, 2.28, 'metal'],
  [79, 'Au', 11, 6, 196.97, 2.54, 'metal'],
  [80, 'Hg', 12, 6, 200.59, 2.0, 'metal'],
  [81, 'Tl', 13, 6, 204.38, 1.62, 'metal'],
  [82, 'Pb', 14, 6, 207.2, 2.33, 'metal'],
  [83, 'Bi', 15, 6, 208.98, 2.02, 'metal'],
  [84, 'Po', 16, 6, 209, 2.0, 'unclear'],
  [85, 'At', 17, 6, 210, 2.2, 'unclear'],
  [86, 'Rn', 18, 6, 222, null, 'nonmetal'],
  [87, 'Fr', 1, 7, 223, 0.7, 'metal'],
  [88, 'Ra', 2, 7, 226, 0.9, 'metal'],
  [89, 'Ac', 3, 7, 227, 1.1, 'metal'],
  [104, 'Rf', 4, 7, 267, null, 'unclear'],
  [105, 'Db', 5, 7, 268, null, 'unclear'],
  [106, 'Sg', 6, 7, 269, null, 'unclear'],
  [107, 'Bh', 7, 7, 270, null, 'unclear'],
  [108, 'Hs', 8, 7, 277, null, 'unclear'],
  [109, 'Mt', 9, 7, 278, null, 'unclear'],
  [110, 'Ds', 10, 7, 281, null, 'unclear'],
  [111, 'Rg', 11, 7, 282, null, 'unclear'],
  [112, 'Cn', 12, 7, 285, null, 'unclear'],
  [113, 'Nh', 13, 7, 286, null, 'unclear'],
  [114, 'Fl', 14, 7, 289, null, 'unclear'],
  [115, 'Mc', 15, 7, 290, null, 'unclear'],
  [116, 'Lv', 16, 7, 293, null, 'unclear'],
  [117, 'Ts', 17, 7, 294, null, 'unclear'],
  [118, 'Og', 18, 7, 294, null, 'unclear'],
];

/** Tc (43) and everything from Po (84) on has no stable isotope. */
function hasStableIsotope(z: number): boolean {
  return z <= 83 && z !== 43;
}

export const ELEMENTS: readonly ElementFacts[] = ROWS.map(
  ([z, sym, group, period, mass, en, cls]) => ({
    z,
    sym,
    group,
    period,
    mass,
    en,
    cls,
    stable: hasStableIsotope(z),
  }),
);

const BY_ID = new Map(ELEMENTS.map((e) => [e.sym.toLowerCase(), e]));

/** An element's id in a task: its symbol in lower case ("na"). */
export function elementId(e: ElementFacts): string {
  return e.sym.toLowerCase();
}

/** The element for an id or a symbol as written ("Na", "na", " NA "), or null. */
export function elementOf(symbol: string): ElementFacts | null {
  return BY_ID.get(symbol.trim().toLowerCase()) ?? null;
}

/** The main groups I–VIII as IUPAC groups, in the order a school table prints them. */
export const PERIODIC_MAIN_GROUPS: readonly Group[] = [1, 2, 13, 14, 15, 16, 17, 18];
/** The main-group table stops at period 6: period 7 of the p block is synthetic. */
export const PERIODIC_MAIN_PERIODS = 6;
export const PERIODIC_FULL_PERIODS = 7;

export const PeriodicTableKind = z.enum(['main', 'full']);
export type PeriodicTableKind = z.infer<typeof PeriodicTableKind>;

/** Is this element drawn in this table? */
export function inTable(table: PeriodicTableKind, e: ElementFacts): boolean {
  if (table === 'full') return true;
  return PERIODIC_MAIN_GROUPS.includes(e.group) && e.period <= PERIODIC_MAIN_PERIODS;
}

/** The columns of a table, left to right (IUPAC groups). */
export function tableGroups(table: PeriodicTableKind): readonly Group[] {
  return table === 'main'
    ? PERIODIC_MAIN_GROUPS
    : (Array.from({ length: 18 }, (_, i) => i + 1) as Group[]);
}

export function tablePeriods(table: PeriodicTableKind): number {
  return table === 'main' ? PERIODIC_MAIN_PERIODS : PERIODIC_FULL_PERIODS;
}

/** The elements of a table, in the order of their atomic numbers. */
export function tableElements(table: PeriodicTableKind): ElementFacts[] {
  return ELEMENTS.filter((e) => inTable(table, e));
}

/** A main group as German schools number it (I–VIII), or null for groups 3–12. */
export function mainGroupNumber(group: Group): number | null {
  if (group === 1 || group === 2) return group;
  if (group >= 13) return group - 10;
  return null;
}

/**
 * Valence electrons of a main-group element: its main-group number, and 2 for helium (it stands
 * over the noble gases with a full first shell). Null for groups 3–12, whose count depends on
 * the textbook's model — no question asks for one there.
 */
export function valenceElectrons(e: ElementFacts): number | null {
  if (e.sym === 'He') return 2;
  return mainGroupNumber(e.group);
}

/** "I" … "VIII" for a main group. */
export function roman(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n] ?? String(n);
}
