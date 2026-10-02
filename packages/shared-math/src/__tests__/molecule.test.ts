// Structural formulas from atoms and bonds (issue #253): what code computes and what it refuses.

import { describe, expect, it } from 'vitest';

import {
  checkMolecule,
  layoutMolecule,
  lonePairDirections,
  type Molecule,
  type MolStyle,
} from '../molecule.js';

const A = (id: string, el: string, h = 0, charge = 0) => ({ id, el, h, charge });
const B = (a: string, b: string, order = 1) => ({ a, b, order });

const ethanol: Molecule = {
  atoms: [A('a1', 'C', 3), A('a2', 'C', 2), A('a3', 'O', 1)],
  bonds: [B('a1', 'a2'), B('a2', 'a3')],
};
const aceticAcid: Molecule = {
  atoms: [A('a1', 'C', 3), A('a2', 'C'), A('a3', 'O'), A('a4', 'O', 1)],
  bonds: [B('a1', 'a2'), B('a2', 'a3', 2), B('a2', 'a4')],
};
const propan1ol: Molecule = {
  atoms: [A('a1', 'C', 3), A('a2', 'C', 2), A('a3', 'C', 2), A('a4', 'O', 1)],
  bonds: [B('a1', 'a2'), B('a2', 'a3'), B('a3', 'a4')],
};
const propan2ol: Molecule = {
  atoms: [A('a1', 'C', 3), A('a2', 'C', 1), A('a3', 'C', 3), A('a4', 'O', 1)],
  bonds: [B('a1', 'a2'), B('a2', 'a3'), B('a2', 'a4')],
};
const benzene: Molecule = {
  atoms: [1, 2, 3, 4, 5, 6].map((i) => A(`a${i}`, 'C', 1)),
  bonds: [
    B('a1', 'a2', 2),
    B('a2', 'a3'),
    B('a3', 'a4', 2),
    B('a4', 'a5'),
    B('a5', 'a6', 2),
    B('a6', 'a1'),
  ],
};

function facts(m: Molecule, opts?: Parameters<typeof checkMolecule>[1]) {
  const c = checkMolecule(m, opts);
  if (!c.ok) throw new Error(`rejected: ${c.fault} ${c.atom ?? ''}`);
  return c.facts;
}

describe('what code computes from a molecule', () => {
  it('ethanol: C2H6O, two lone pairs on the O, a hydroxyl group, 46.07 g/mol', () => {
    const f = facts(ethanol);
    expect(f.formula).toBe('C2H6O');
    expect(f.lonePairs.get('a3')).toBe(2);
    expect(f.totalLonePairs).toBe(2);
    expect(f.molarMass).toBeCloseTo(46.07, 2);
    expect(f.groups).toEqual([{ group: 'hydroxyl', atoms: ['a3'] }]);
  });

  it('acetic acid: C2H4O2, four lone pairs, one carboxyl group (not a ketone plus a hydroxyl)', () => {
    const f = facts(aceticAcid);
    expect(f.formula).toBe('C2H4O2');
    expect(f.totalLonePairs).toBe(4);
    expect(f.groups).toEqual([{ group: 'carboxyl', atoms: ['a2', 'a3', 'a4'] }]);
    expect(f.molarMass).toBeCloseTo(60.05, 2);
  });

  it('propan-1-ol and propan-2-ol: the same formula, two different molecules and drawings', () => {
    const one = facts(propan1ol);
    const two = facts(propan2ol);
    expect(one.formula).toBe('C3H8O');
    expect(two.formula).toBe('C3H8O');
    // The OH sits at the end of the chain in one and in its middle in the other.
    const where = (m: Molecule) => {
      const l = layoutMolecule(m, 'skeletal');
      if (!l) throw new Error('no layout');
      const oh = l.atoms.find((a) => a.el === 'O');
      const corners = l.atoms.filter((a) => a.el === 'C');
      return { oh, corners };
    };
    const a = where(propan1ol);
    const b = where(propan2ol);
    expect(a.oh?.text).toMatch(/OH|HO/);
    expect(b.oh?.text).toMatch(/OH|HO/);
    expect(a.oh?.x).not.toBeCloseTo(b.oh?.x ?? 0, 3);
  });

  it('charges: NH4+ has an empty pair count and charge +1; hydroxide keeps three pairs', () => {
    const nh4 = facts({ atoms: [A('a1', 'N', 4, 1)], bonds: [] });
    expect(nh4.charge).toBe(1);
    expect(nh4.totalLonePairs).toBe(0);
    const oh = facts({ atoms: [A('a1', 'O', 1, -1)], bonds: [] });
    expect(oh.totalLonePairs).toBe(3);
    expect(oh.formula).toBe('HO^-');
  });

  it('expanded shells only where chemistry allows them: SO4 2- with two double bonds', () => {
    const sulfate: Molecule = {
      atoms: [A('a1', 'S'), A('a2', 'O'), A('a3', 'O'), A('a4', 'O', 0, -1), A('a5', 'O', 0, -1)],
      bonds: [B('a1', 'a2', 2), B('a1', 'a3', 2), B('a1', 'a4'), B('a1', 'a5')],
    };
    const f = facts(sulfate);
    expect(f.charge).toBe(-2);
    expect(f.formula).toBe('O4S^2-');
    // The same shell on a carbon is no molecule.
    expect(
      checkMolecule({
        atoms: [A('a1', 'C', 0), A('a2', 'O'), A('a3', 'O'), A('a4', 'O')],
        bonds: [B('a1', 'a2', 2), B('a1', 'a3', 2), B('a1', 'a4')],
      }).ok,
    ).toBe(false);
  });

  it('an ion pair stands side by side: Na+ and Cl-', () => {
    const f = facts({ atoms: [A('a1', 'Na', 0, 1), A('a2', 'Cl', 0, -1)], bonds: [] });
    expect(f.charge).toBe(0);
    expect(f.lonePairs.get('a2')).toBe(4);
    expect(
      layoutMolecule({ atoms: [A('a1', 'Na', 0, 1), A('a2', 'Cl', 0, -1)], bonds: [] }, 'lewis'),
    ).not.toBeNull();
  });
});

describe('what code refuses (rejected, never repaired)', () => {
  const cases: [string, Molecule, string][] = [
    [
      'an O with one bond and no charge (odd electron)',
      { atoms: [A('a1', 'C', 3), A('a2', 'O')], bonds: [B('a1', 'a2')] },
      'odd_electrons',
    ],
    [
      'a carbon with five bonds',
      { atoms: [A('a1', 'C', 4), A('a2', 'C', 3)], bonds: [B('a1', 'a2')] },
      'odd_electrons',
    ],
    ['a carbon with a wrong charge', { atoms: [A('a1', 'C', 4, 1)], bonds: [] }, 'odd_electrons'],
    ['a carbocation (sextet)', { atoms: [A('a1', 'C', 3, 1)], bonds: [] }, 'shell'],
    ['NH4 without its charge', { atoms: [A('a1', 'N', 4)], bonds: [] }, 'odd_electrons'],
    [
      'a bond to an atom that does not exist',
      { atoms: [A('a1', 'C', 4)], bonds: [B('a1', 'a9')] },
      'bad_bond',
    ],
    [
      'a bond twice',
      { atoms: [A('a1', 'C', 3), A('a2', 'C', 3)], bonds: [B('a1', 'a2'), B('a2', 'a1')] },
      'duplicate_bond',
    ],
    ['an alias twice', { atoms: [A('a1', 'C', 4), A('a1', 'O', 2)], bonds: [] }, 'duplicate_atom'],
    ['an element the app does not know', { atoms: [A('a1', 'Xe')], bonds: [] }, 'unknown_element'],
    [
      'a sodium with a bond',
      { atoms: [A('a1', 'Na'), A('a2', 'Cl')], bonds: [B('a1', 'a2')] },
      'shell',
    ],
    [
      'four separate particles',
      {
        atoms: [
          A('a1', 'Na', 0, 1),
          A('a2', 'Cl', 0, -1),
          A('a3', 'Na', 0, 1),
          A('a4', 'Cl', 0, -1),
        ],
        bonds: [],
      },
      'too_many_parts',
    ],
  ];
  it.each(cases)('%s', (_name, m, fault) => {
    const c = checkMolecule(m);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.fault).toBe(fault);
  });

  it('fused rings (naphthalene) are refused rather than drawn wrong', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `a${i + 1}`);
    const m: Molecule = {
      atoms: ids.map((id, i) => A(id, 'C', i === 0 || i === 5 ? 0 : 1)),
      bonds: [
        B('a1', 'a2', 2),
        B('a2', 'a3'),
        B('a3', 'a4', 2),
        B('a4', 'a5'),
        B('a5', 'a6', 2),
        B('a6', 'a1'),
        B('a6', 'a7'),
        B('a7', 'a8', 2),
        B('a8', 'a9'),
        B('a9', 'a10', 2),
        B('a10', 'a1'),
      ],
    };
    const c = checkMolecule(m);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.fault).toBe('ring');
  });

  it('a marked group must be ONE functional group of the molecule', () => {
    expect(checkMolecule(aceticAcid, { mark: ['a2', 'a3', 'a4'] }).ok).toBe(true);
    expect(checkMolecule(ethanol, { mark: ['a3'] }).ok).toBe(true);
    // Half a carboxyl group, a carbon of the chain, an atom twice: no group.
    expect(checkMolecule(aceticAcid, { mark: ['a3', 'a4'] }).ok).toBe(false);
    expect(checkMolecule(ethanol, { mark: ['a1'] }).ok).toBe(false);
    expect(checkMolecule(ethanol, { mark: ['a3', 'a3'] }).ok).toBe(false);
  });
});

describe('the functional groups, by the pattern of the bonds', () => {
  const groupsOf = (m: Molecule) =>
    facts(m)
      .groups.map((g) => g.group)
      .sort();
  it.each<[string, Molecule, string[]]>([
    [
      'ethanal (aldehyde)',
      {
        atoms: [A('a1', 'C', 3), A('a2', 'C', 1), A('a3', 'O')],
        bonds: [B('a1', 'a2'), B('a2', 'a3', 2)],
      },
      ['aldehyde'],
    ],
    [
      'propanone (ketone)',
      {
        atoms: [A('a1', 'C', 3), A('a2', 'C'), A('a3', 'O'), A('a4', 'C', 3)],
        bonds: [B('a1', 'a2'), B('a2', 'a3', 2), B('a2', 'a4')],
      },
      ['ketone'],
    ],
    [
      'methyl acetate (ester)',
      {
        atoms: [A('a1', 'C', 3), A('a2', 'C'), A('a3', 'O'), A('a4', 'O'), A('a5', 'C', 3)],
        bonds: [B('a1', 'a2'), B('a2', 'a3', 2), B('a2', 'a4'), B('a4', 'a5')],
      },
      ['ester'],
    ],
    [
      'dimethyl ether',
      {
        atoms: [A('a1', 'C', 3), A('a2', 'O'), A('a3', 'C', 3)],
        bonds: [B('a1', 'a2'), B('a2', 'a3')],
      },
      ['ether'],
    ],
    [
      'methylamine',
      { atoms: [A('a1', 'C', 3), A('a2', 'N', 2)], bonds: [B('a1', 'a2')] },
      ['amine'],
    ],
    [
      'acetamide (amide)',
      {
        atoms: [A('a1', 'C', 3), A('a2', 'C'), A('a3', 'O'), A('a4', 'N', 2)],
        bonds: [B('a1', 'a2'), B('a2', 'a3', 2), B('a2', 'a4')],
      },
      ['amide'],
    ],
    [
      'ethene',
      { atoms: [A('a1', 'C', 2), A('a2', 'C', 2)], bonds: [B('a1', 'a2', 2)] },
      ['alkene'],
    ],
    [
      'ethyne',
      { atoms: [A('a1', 'C', 1), A('a2', 'C', 1)], bonds: [B('a1', 'a2', 3)] },
      ['alkyne'],
    ],
    [
      'chloromethane',
      { atoms: [A('a1', 'C', 3), A('a2', 'Cl')], bonds: [B('a1', 'a2')] },
      ['halogen'],
    ],
  ])('%s', (_name, m, want) => {
    expect(groupsOf(m)).toEqual(want);
  });
});

describe('the layout', () => {
  const minDistance = (m: Molecule, style: MolStyle) => {
    const l = layoutMolecule(m, style);
    if (!l) return null;
    let min = Infinity;
    for (let i = 0; i < l.atoms.length; i++)
      for (let j = i + 1; j < l.atoms.length; j++) {
        const p = l.atoms[i];
        const q = l.atoms[j];
        if (p && q) min = Math.min(min, Math.hypot(p.x - q.x, p.y - q.y));
      }
    return min;
  };
  const isobutane: Molecule = {
    atoms: [A('a1', 'C', 3), A('a2', 'C', 1), A('a3', 'C', 3), A('a4', 'C', 3)],
    bonds: [B('a1', 'a2'), B('a2', 'a3'), B('a2', 'a4')],
  };
  const molecules: [string, Molecule][] = [
    ['ethanol', ethanol],
    ['acetic acid', aceticAcid],
    ['propan-1-ol', propan1ol],
    ['propan-2-ol', propan2ol],
    ['isobutane', isobutane],
    ['benzene', benzene],
    ['water', { atoms: [A('a1', 'O', 2)], bonds: [] }],
  ];
  it.each(molecules)(
    '%s has a drawing in every style with no atoms on top of each other',
    (_n, m) => {
      for (const style of ['lewis', 'structural', 'skeletal'] as const) {
        const d = minDistance(m, style);
        expect(d).not.toBeNull();
        expect(d ?? 0).toBeGreaterThanOrEqual(0.55);
      }
    },
  );

  it('a Lewis formula draws every hydrogen; a skeletal formula draws none on carbon', () => {
    const lewis = layoutMolecule(ethanol, 'lewis');
    const skeletal = layoutMolecule(ethanol, 'skeletal');
    expect(lewis?.atoms.filter((a) => a.el === 'H')).toHaveLength(6);
    expect(skeletal?.atoms.filter((a) => a.el === 'H')).toHaveLength(0);
    expect(skeletal?.atoms.filter((a) => a.el === 'C').every((a) => a.text === null)).toBe(true);
    expect(lewis?.atoms.find((a) => a.el === 'O')?.lonePairs).toHaveLength(2);
    expect(skeletal?.atoms.find((a) => a.el === 'O')?.lonePairs).toHaveLength(0);
  });

  it('a ring is a regular polygon and its double bonds know the ring centre', () => {
    const l = layoutMolecule(benzene, 'skeletal');
    expect(l).not.toBeNull();
    const ring = l?.bonds.filter((b) => b.ring !== null) ?? [];
    expect(ring).toHaveLength(6);
    const c = ring[0]?.ring ?? { x: 0, y: 0 };
    for (const a of l?.atoms ?? []) expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeCloseTo(1, 6);
  });

  it('lone pairs fill the widest gaps between the bonds', () => {
    const deg = (r: number[]) => r.map((x) => Math.round(((x * 180) / Math.PI) % 360));
    // Water drawn straight: the two pairs above and below.
    expect(deg(lonePairDirections([0, Math.PI], 2))).toEqual([90, 270]);
    // A terminal O of a double bond to the right: the pairs spread to the far side.
    expect(deg(lonePairDirections([0], 2))).toEqual([120, 240]);
    // A free ion: four pairs around it.
    expect(lonePairDirections([], 4)).toHaveLength(4);
  });
});
