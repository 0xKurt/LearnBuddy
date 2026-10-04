// The periodic table (issue #250): the element data, where each element stands, and the keys code
// computes — and the figures it refuses (Regel 0: rejected, never repaired).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  cellOf,
  element,
  ELEMENTS,
  periodicKey,
  periodicProblem,
  tableCells,
  valenceElectrons,
  type PeriodicTableData,
} from '../periodic.js';

const fig = (over: Partial<PeriodicTableData>): PeriodicTableData => ({
  type: 'periodic_table',
  v: 'main',
  hl: [],
  ask: 'none',
  at: '',
  ...over,
});

describe('element data', () => {
  it('is what the package holds (the generated file is up to date)', () => {
    const script = fileURLToPath(new URL('../../scripts/elements.mjs', import.meta.url));
    expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('has all 118 elements, in order, each symbol once', () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(ELEMENTS.map((e) => e.z)).toEqual(Array.from({ length: 118 }, (_, i) => i + 1));
    expect(new Set(ELEMENTS.map((e) => e.sym)).size).toBe(118);
    expect(ELEMENTS.every((e) => e.mass > e.z)).toBe(true);
  });

  it('finds an element only by its printed symbol', () => {
    expect(element('Na')?.z).toBe(11);
    expect(element('NA')).toBeUndefined();
    expect(element('Xx')).toBeUndefined();
  });

  it('knows metals, metalloids and nonmetals', () => {
    expect(element('Na')?.cls).toBe('metal');
    expect(element('Fe')?.cls).toBe('metal');
    expect(element('Si')?.cls).toBe('metalloid');
    expect(element('B')?.cls).toBe('metalloid');
    expect(element('Cl')?.cls).toBe('nonmetal');
    expect(element('Ne')?.cls).toBe('nonmetal');
  });

  it('has fluorine as the most electronegative element', () => {
    const withEn = ELEMENTS.filter((e) => e.en !== null);
    const top = withEn.reduce((a, b) => ((b.en ?? 0) > (a.en ?? 0) ? b : a));
    expect(top.sym).toBe('F');
  });
});

// The main-group elements up to calcium, every fact a question can ask about them — written out
// here from the schoolbook, not from the code under test (issue #250, Abnahme).
const UP_TO_CA = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca'.split(' ');
const GROUP = [1, 18, 1, 2, 13, 14, 15, 16, 17, 18, 1, 2, 13, 14, 15, 16, 17, 18, 1, 2];
const PERIOD = [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4];
const VALENCE = [1, 2, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2];
const NEUTRONS = [0, 2, 4, 5, 6, 6, 7, 8, 10, 10, 12, 12, 14, 14, 16, 16, 18, 22, 20, 20];

describe('the main-group elements up to Ca', () => {
  UP_TO_CA.forEach((sym, i) => {
    it(`${sym}: protons, electrons, neutrons, valence, group, period`, () => {
      const e = element(sym)!;
      expect(e.z).toBe(i + 1);
      expect(e.group).toBe(GROUP[i]);
      expect(e.period).toBe(PERIOD[i]);
      expect(valenceElectrons(e)).toBe(VALENCE[i]);
      const key = (ask: PeriodicTableData['ask'], v: 'main' | 'full' = 'main') =>
        periodicKey(fig({ v, hl: [sym], at: sym, ask }));
      expect(key('protons')).toEqual({ kind: 'number', value: i + 1 });
      expect(key('electrons')).toEqual({ kind: 'number', value: i + 1 });
      expect(key('neutrons')).toEqual({ kind: 'number', value: NEUTRONS[i] });
      expect(key('valence')).toEqual({ kind: 'number', value: VALENCE[i] });
      expect(key('period')).toEqual({ kind: 'number', value: PERIOD[i] });
      expect(key('shells')).toEqual({ kind: 'number', value: PERIOD[i] });
      // The main-group table numbers I–VIII, the full one 1–18.
      expect(key('group', 'full')).toEqual({ kind: 'number', value: GROUP[i] });
      const main = GROUP[i]! > 2 ? GROUP[i]! - 10 : GROUP[i];
      expect(key('group', 'main')).toEqual({ kind: 'number', value: main });
    });
  });
});

describe('where an element stands', () => {
  it('puts La and Ac in group 3 and leaves the f block out', () => {
    expect(element('La')).toMatchObject({ group: 3, period: 6 });
    expect(element('Ac')).toMatchObject({ group: 3, period: 7 });
    expect(element('Ce')?.group).toBeNull();
    expect(element('Lu')?.group).toBeNull();
    expect(element('Lr')?.group).toBeNull();
    expect(element('Hf')).toMatchObject({ group: 4, period: 6 });
    expect(element('Rf')).toMatchObject({ group: 4, period: 7 });
    expect(element('Fe')).toMatchObject({ group: 8, period: 4 });
    expect(element('Zn')).toMatchObject({ group: 12, period: 4 });
    expect(element('Rn')).toMatchObject({ group: 18, period: 6 });
    expect(element('Og')).toMatchObject({ group: 18, period: 7 });
  });

  it('draws 42 cells in the main-group table and 90 in the full one, never two in one place', () => {
    for (const [v, count] of [
      ['main', 42],
      ['full', 90],
    ] as const) {
      const cells = tableCells(v);
      expect(cells).toHaveLength(count);
      expect(new Set(cells.map((c) => `${c.col},${c.row}`)).size).toBe(count);
    }
    expect(cellOf(element('Fe')!, 'main')).toBeNull();
    expect(cellOf(element('Fr')!, 'main')).toBeNull();
    expect(cellOf(element('S')!, 'main')).toEqual({ col: 5, row: 2 });
    expect(cellOf(element('S')!, 'full')).toEqual({ col: 15, row: 2 });
  });
});

describe('keys', () => {
  it('computes the class as an option index (metal, metalloid, nonmetal)', () => {
    const cls = (sym: string) => periodicKey(fig({ hl: [sym], at: sym, ask: 'class' }));
    expect(cls('Mg')).toEqual({ kind: 'choice', index: 0 });
    expect(cls('Si')).toEqual({ kind: 'choice', index: 1 });
    expect(cls('S')).toEqual({ kind: 'choice', index: 2 });
  });

  it('compares electronegativity by the data', () => {
    expect(periodicKey(fig({ hl: ['Na', 'Cl', 'Mg'], ask: 'en_max' }))).toEqual({
      kind: 'choice',
      index: 1,
    });
  });

  it('reads the larger atom off the position, down a group or along a period', () => {
    expect(periodicKey(fig({ hl: ['Li', 'K', 'Na'], ask: 'radius_max' }))).toEqual({
      kind: 'choice',
      index: 1,
    });
    expect(periodicKey(fig({ hl: ['Cl', 'Na', 'Mg'], ask: 'radius_max' }))).toEqual({
      kind: 'choice',
      index: 1,
    });
  });
});

describe('figures code refuses', () => {
  const problem = (over: Partial<PeriodicTableData>) => periodicProblem(fig(over));

  it('accepts a table that only marks', () => {
    expect(problem({ hl: ['Na', 'Cl'] })).toBeNull();
    expect(problem({ v: 'full', hl: ['Fe'], ask: 'protons', at: 'Fe' })).toBeNull();
  });

  it('refuses an element that is not in the drawn table, or does not exist', () => {
    expect(problem({ hl: ['Fe'] })).not.toBeNull(); // no transition metals in the main groups
    expect(problem({ hl: ['Xx'] })).not.toBeNull();
    expect(problem({ hl: ['NA'] })).not.toBeNull();
    expect(problem({ v: 'full', hl: ['Ce'] })).not.toBeNull(); // the f block is not drawn
  });

  it('refuses a mark twice and a question about an unmarked element', () => {
    expect(problem({ hl: ['Na', 'Na'] })).not.toBeNull();
    expect(problem({ hl: ['Na'], at: 'Cl', ask: 'protons' })).not.toBeNull();
    expect(problem({ hl: ['Na'], at: 'Na', ask: 'none' })).not.toBeNull();
  });

  it('refuses a question whose key the table cannot give', () => {
    // Valence electrons of a transition metal: not a school question.
    expect(problem({ v: 'full', hl: ['Fe'], at: 'Fe', ask: 'valence' })).toBe('no_key');
    // Technetium has no stable isotope: its mass names no neutron count.
    expect(problem({ v: 'full', hl: ['Tc'], at: 'Tc', ask: 'neutrons' })).toBe('no_key');
    // Polonium's and astatine's class depends on the source.
    expect(problem({ hl: ['Po'], at: 'Po', ask: 'class' })).toBe('no_key');
    expect(problem({ hl: ['At'], at: 'At', ask: 'class' })).toBe('no_key');
    // Across a group AND a period the position does not decide the larger atom.
    expect(problem({ hl: ['Li', 'Mg'], ask: 'radius_max' })).toBe('no_key');
    // A noble gas's radius is another kind of radius.
    expect(problem({ hl: ['Na', 'Ar'], ask: 'radius_max' })).toBe('no_key');
    // Neon has no electronegativity in the data.
    expect(problem({ hl: ['Ne', 'F'], ask: 'en_max' })).toBe('no_key');
  });

  it('wants 2–4 marked elements to compare, and no single element', () => {
    expect(problem({ hl: ['Na'], ask: 'en_max' })).not.toBeNull();
    expect(problem({ hl: ['Li', 'Na', 'K', 'Rb', 'Cs'], ask: 'radius_max' })).not.toBeNull();
    expect(problem({ hl: ['Na', 'Cl'], at: 'Na', ask: 'en_max' })).not.toBeNull();
  });
});
