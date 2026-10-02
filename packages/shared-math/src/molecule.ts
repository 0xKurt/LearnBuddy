// Structural formulas as data (issue #253, docs/architecture.md §Practice, figures).
//
// The model writes a molecule as atoms and bonds (aliases a1, a2 …, hydrogens counted per atom);
// everything a drawing or a key depends on is COMPUTED here, once, for the server and the app
// alike:
//   - the lone pairs of every atom, from its valence electrons, its bonds and its charge;
//   - whether every atom's shell holds (octet, duet, the expanded shells of P, S and the
//     heavier halogens, the empty shell of a metal ion) — a molecule that does not is rejected,
//     never repaired: a wrong charge is not "fixed" by inventing a lone pair;
//   - the molecular formula, the charge and the molar mass;
//   - the functional groups, by the pattern of the bonds (no names, no word lists);
//   - a 2D layout: a straight school drawing for Lewis and Valenzstrich formulas, a zigzag for
//     skeletal formulas, regular polygons for rings.
//
// Dependency-free on purpose: the app imports this file by path (like `expression.ts`), so
// what the server checked is exactly what the app draws.

export type MolAtom = { id: string; el: string; h: number; charge: number };
export type MolBond = { a: string; b: string; order: number };
export type Molecule = { atoms: readonly MolAtom[]; bonds: readonly MolBond[] };
export type MolStyle = 'lewis' | 'structural' | 'skeletal';

type ElementFacts = {
  /** Valence electrons of the neutral atom. */
  valence: number;
  /** Electrons the shell may hold around it (bonds count twice, lone pairs twice). */
  shells: readonly number[];
  /** Standard atomic weight, g/mol (IUPAC, rounded as in a school table). */
  mass: number;
};

const ELEMENTS: Record<string, ElementFacts> = {
  H: { valence: 1, shells: [2, 0], mass: 1.008 },
  B: { valence: 3, shells: [6, 8], mass: 10.81 },
  C: { valence: 4, shells: [8], mass: 12.011 },
  N: { valence: 5, shells: [8], mass: 14.007 },
  O: { valence: 6, shells: [8], mass: 15.999 },
  F: { valence: 7, shells: [8], mass: 18.998 },
  Si: { valence: 4, shells: [8], mass: 28.085 },
  P: { valence: 5, shells: [8, 10, 12], mass: 30.974 },
  S: { valence: 6, shells: [8, 10, 12], mass: 32.06 },
  Cl: { valence: 7, shells: [8, 10, 12, 14], mass: 35.45 },
  Br: { valence: 7, shells: [8, 10, 12, 14], mass: 79.904 },
  I: { valence: 7, shells: [8, 10, 12, 14], mass: 126.904 },
  // Metal ions: in a school formula they stand next to the molecule with an empty shell.
  Li: { valence: 1, shells: [0], mass: 6.94 },
  Na: { valence: 1, shells: [0], mass: 22.99 },
  K: { valence: 1, shells: [0], mass: 39.098 },
  Mg: { valence: 2, shells: [0], mass: 24.305 },
  Ca: { valence: 2, shells: [0], mass: 40.078 },
};

export type FunctionalGroup =
  | 'hydroxyl'
  | 'ether'
  | 'aldehyde'
  | 'ketone'
  | 'carboxyl'
  | 'ester'
  | 'amine'
  | 'amide'
  | 'alkene'
  | 'alkyne'
  | 'halogen';

export type MoleculeFacts = {
  /** Lone pairs per atom alias. */
  lonePairs: Map<string, number>;
  totalLonePairs: number;
  /** Atoms per element, hydrogens included. */
  counts: Map<string, number>;
  charge: number;
  /** g/mol, rounded to two decimals. */
  molarMass: number;
  /** Hill order: C, H, then the rest alphabetically ("C2H6O", "NH4+"). */
  formula: string;
  groups: { group: FunctionalGroup; atoms: string[] }[];
};

export type MoleculeFault =
  | 'unknown_element'
  | 'duplicate_atom'
  | 'bad_bond'
  | 'duplicate_bond'
  | 'odd_electrons'
  | 'shell'
  | 'too_many_parts'
  | 'ring'
  | 'mark'
  | 'layout';

export type MoleculeCheck =
  | { ok: true; facts: MoleculeFacts }
  | { ok: false; fault: MoleculeFault; atom?: string };

/** The most separate particles one figure may show (Na⁺ and Cl⁻, or an ion pair and water). */
const MAX_PARTS = 3;

type Neighbour = { id: string; order: number };

function neighbours(m: Molecule): Map<string, Neighbour[]> {
  const out = new Map<string, Neighbour[]>(m.atoms.map((a) => [a.id, []]));
  for (const b of m.bonds) {
    out.get(b.a)?.push({ id: b.b, order: b.order });
    out.get(b.b)?.push({ id: b.a, order: b.order });
  }
  return out;
}

/**
 * Checks a molecule as the model wrote it and computes what can be computed from it.
 * `style` decides only whether the layout check runs for that drawing.
 */
export function checkMolecule(
  m: Molecule,
  opts: { style?: MolStyle; mark?: readonly string[] } = {},
): MoleculeCheck {
  const ids = new Set<string>();
  for (const a of m.atoms) {
    if (!(a.el in ELEMENTS)) return { ok: false, fault: 'unknown_element', atom: a.id };
    if (ids.has(a.id)) return { ok: false, fault: 'duplicate_atom', atom: a.id };
    ids.add(a.id);
  }
  const pairs = new Set<string>();
  for (const b of m.bonds) {
    if (!ids.has(b.a) || !ids.has(b.b) || b.a === b.b) return { ok: false, fault: 'bad_bond' };
    if (!Number.isInteger(b.order) || b.order < 1 || b.order > 3)
      return { ok: false, fault: 'bad_bond' };
    const key = b.a < b.b ? `${b.a}|${b.b}` : `${b.b}|${b.a}`;
    if (pairs.has(key)) return { ok: false, fault: 'duplicate_bond' };
    pairs.add(key);
  }
  const nb = neighbours(m);
  const lonePairs = new Map<string, number>();
  const counts = new Map<string, number>();
  let charge = 0;
  let mass = 0;
  for (const a of m.atoms) {
    const facts = ELEMENTS[a.el];
    if (!facts) return { ok: false, fault: 'unknown_element', atom: a.id };
    const bonded = a.h + (nb.get(a.id) ?? []).reduce((s, n) => s + n.order, 0);
    const free = facts.valence - a.charge - bonded;
    if (free < 0 || free % 2 !== 0) return { ok: false, fault: 'odd_electrons', atom: a.id };
    const shell = 2 * bonded + free;
    if (!facts.shells.includes(shell)) return { ok: false, fault: 'shell', atom: a.id };
    // An empty shell is only an ion's (H⁺, Na⁺, Mg²⁺) — never an atom with bonds.
    if (shell === 0 && bonded > 0) return { ok: false, fault: 'shell', atom: a.id };
    lonePairs.set(a.id, free / 2);
    counts.set(a.el, (counts.get(a.el) ?? 0) + 1);
    if (a.h > 0) counts.set('H', (counts.get('H') ?? 0) + a.h);
    charge += a.charge;
    mass += facts.mass + a.h * (ELEMENTS.H?.mass ?? 0);
  }
  if (componentsOf(m, nb) > MAX_PARTS) return { ok: false, fault: 'too_many_parts' };
  if (
    ringsOf(
      m.atoms.map((a) => a.id),
      nb,
    ) === null
  )
    return { ok: false, fault: 'ring' };
  const groups = functionalGroups(m, nb);
  if (opts.mark && opts.mark.length > 0) {
    const want = [...new Set(opts.mark)].sort().join(',');
    if (want !== [...opts.mark].sort().join(',')) return { ok: false, fault: 'mark' };
    if (!groups.some((g) => [...g.atoms].sort().join(',') === want))
      return { ok: false, fault: 'mark' };
  }
  if (opts.style && layoutMolecule(m, opts.style) === null) return { ok: false, fault: 'layout' };
  return {
    ok: true,
    facts: {
      lonePairs,
      totalLonePairs: [...lonePairs.values()].reduce((s, n) => s + n, 0),
      counts,
      charge,
      molarMass: Math.round(mass * 100) / 100,
      formula: hillFormula(counts, charge),
      groups,
    },
  };
}

function componentsOf(m: Molecule, nb: Map<string, Neighbour[]>): number {
  const seen = new Set<string>();
  let parts = 0;
  for (const a of m.atoms) {
    if (seen.has(a.id)) continue;
    parts++;
    const stack = [a.id];
    seen.add(a.id);
    while (stack.length > 0) {
      const id = stack.pop() as string;
      for (const n of nb.get(id) ?? []) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          stack.push(n.id);
        }
      }
    }
  }
  return parts;
}

/**
 * The rings, each as its atoms in ring order — or null when the rings cannot be drawn as
 * separate polygons: rings that share an atom (fused, spiro, bridged) or a ring of more than
 * eight atoms. School formulas (benzene, cyclohexane, glucose, phenol, aspirin) have separate
 * rings; a naphthalene is refused rather than drawn wrong.
 */
function ringsOf(ids: readonly string[], nb: Map<string, Neighbour[]>): string[][] | null {
  const parent = new Map<string, string | null>();
  const depth = new Map<string, number>();
  const rings: string[][] = [];
  for (const root of ids) {
    if (parent.has(root)) continue;
    parent.set(root, null);
    depth.set(root, 0);
    const stack: string[] = [root];
    const order: string[] = [];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      order.push(id);
      for (const n of nb.get(id) ?? []) {
        if (parent.has(n.id)) continue;
        parent.set(n.id, id);
        depth.set(n.id, (depth.get(id) ?? 0) + 1);
        stack.push(n.id);
      }
    }
    // Every bond that is not a tree bond closes exactly one fundamental ring.
    const done = new Set<string>();
    for (const id of order) {
      for (const n of nb.get(id) ?? []) {
        if (parent.get(id) === n.id || parent.get(n.id) === id) continue;
        const key = id < n.id ? `${id}|${n.id}` : `${n.id}|${id}`;
        if (done.has(key)) continue;
        done.add(key);
        let x = id;
        let y = n.id;
        const left: string[] = [x];
        const right: string[] = [y];
        while (x !== y) {
          if ((depth.get(x) ?? 0) >= (depth.get(y) ?? 0)) {
            x = parent.get(x) ?? x;
            left.push(x);
          } else {
            y = parent.get(y) ?? y;
            right.push(y);
          }
          if (left.length + right.length > 20) return null;
        }
        right.pop(); // the meeting atom is already the last of `left`
        rings.push([...left, ...right.reverse()]);
      }
    }
  }
  const used = new Set<string>();
  for (const r of rings) {
    if (r.length < 3 || r.length > 8) return null;
    for (const id of r) {
      if (used.has(id)) return null;
      used.add(id);
    }
  }
  return rings;
}

const SUBSCRIPT_FREE = (n: number) => (n === 1 ? '' : String(n));

/** "C2H6O", "NH4+", "SO4 2-" in the plain notation `practice/chemistry.ts` also reads. */
function hillFormula(counts: Map<string, number>, charge: number): string {
  const els = [...counts.keys()];
  const order = counts.has('C')
    ? ['C', ...(counts.has('H') ? ['H'] : []), ...els.filter((e) => e !== 'C' && e !== 'H').sort()]
    : els.sort();
  const body = order.map((e) => `${e}${SUBSCRIPT_FREE(counts.get(e) ?? 0)}`).join('');
  if (charge === 0) return body;
  const size = Math.abs(charge) === 1 ? '' : String(Math.abs(charge));
  return `${body}^${size}${charge > 0 ? '+' : '-'}`;
}

/**
 * The functional groups, each with the atoms that make it: its heteroatoms plus the carbon of a
 * C=O, and both carbons of a C=C or C≡C. That is also exactly what a figure's `mark` must hold.
 */
function functionalGroups(
  m: Molecule,
  nb: Map<string, Neighbour[]>,
): { group: FunctionalGroup; atoms: string[] }[] {
  const atom = new Map(m.atoms.map((a) => [a.id, a]));
  const el = (id: string) => atom.get(id)?.el ?? '';
  const hydrogens = (id: string) =>
    (atom.get(id)?.h ?? 0) + (nb.get(id) ?? []).filter((n) => el(n.id) === 'H').length;
  const out: { group: FunctionalGroup; atoms: string[] }[] = [];
  const taken = new Set<string>();
  // C=O first: it decides what the O and N next to it are.
  for (const a of m.atoms) {
    if (a.el !== 'C') continue;
    const ns = nb.get(a.id) ?? [];
    const oxo = ns.find((n) => n.order === 2 && el(n.id) === 'O');
    if (!oxo) continue;
    const rest = ns.filter((n) => n !== oxo);
    const singleO = rest.find((n) => n.order === 1 && el(n.id) === 'O');
    const singleN = rest.find((n) => n.order === 1 && el(n.id) === 'N');
    const carbons = rest.filter((n) => el(n.id) === 'C').length;
    let group: FunctionalGroup | null = null;
    let atoms = [a.id, oxo.id];
    if (singleO) {
      const oAtom = atom.get(singleO.id);
      const onward = (nb.get(singleO.id) ?? []).filter((n) => n.id !== a.id);
      if (hydrogens(singleO.id) >= 1 || (oAtom?.charge ?? 0) < 0) group = 'carboxyl';
      else if (onward.some((n) => el(n.id) === 'C')) group = 'ester';
      atoms = [a.id, oxo.id, singleO.id];
    } else if (singleN) {
      group = 'amide';
      atoms = [a.id, oxo.id, singleN.id];
    } else if (hydrogens(a.id) >= 1) group = 'aldehyde';
    else if (carbons === 2) group = 'ketone';
    if (!group) continue;
    out.push({ group, atoms });
    for (const id of atoms) taken.add(id);
  }
  for (const a of m.atoms) {
    if (taken.has(a.id)) continue;
    const ns = nb.get(a.id) ?? [];
    const heavy = ns.filter((n) => el(n.id) !== 'H');
    if (a.el === 'O' && ns.every((n) => n.order === 1)) {
      const c = heavy.filter((n) => el(n.id) === 'C').length;
      if (c >= 1 && hydrogens(a.id) >= 1) out.push({ group: 'hydroxyl', atoms: [a.id] });
      else if (c === 2) out.push({ group: 'ether', atoms: [a.id] });
    } else if (
      a.el === 'N' &&
      ns.every((n) => n.order === 1) &&
      heavy.some((n) => el(n.id) === 'C')
    )
      out.push({ group: 'amine', atoms: [a.id] });
    else if (['F', 'Cl', 'Br', 'I'].includes(a.el) && heavy.some((n) => el(n.id) === 'C'))
      out.push({ group: 'halogen', atoms: [a.id] });
  }
  for (const b of m.bonds) {
    if (el(b.a) !== 'C' || el(b.b) !== 'C' || b.order < 2) continue;
    out.push({ group: b.order === 2 ? 'alkene' : 'alkyne', atoms: [b.a, b.b] });
  }
  return out;
}

// ─────────────── layout ───────────────

export type LaidAtom = {
  /** The model's alias, or `<alias>h<n>` for a hydrogen drawn out of a count. */
  key: string;
  el: string;
  x: number;
  y: number;
  /** What is written at the atom; null for a skeletal carbon (a corner of the line). */
  text: string | null;
  charge: number;
  /** Directions (radians, y up) of the lone pairs drawn at this atom. */
  lonePairs: number[];
  /** The alias of the atom this one belongs to (a drawn hydrogen belongs to its partner). */
  of: string;
};

export type LaidBond = {
  from: string;
  to: string;
  order: number;
  /** The centre of the ring this bond lies in: a skeletal double bond is drawn inside it. */
  ring: { x: number; y: number } | null;
};

export type MoleculeLayout = {
  atoms: LaidAtom[];
  bonds: LaidBond[];
  /** Bounding box in bond lengths (a bond is 1 long), lone pairs and labels not included. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type DrawnAtom = { key: string; el: string; h: number; charge: number; of: string };

const DEG = Math.PI / 180;

/**
 * Lays a molecule out in bond lengths, y up. Lewis and Valenzstrich formulas draw every
 * hydrogen and run straight (90°), the way a school board does; a skeletal formula leaves out
 * carbon and its hydrogens and zigzags (120°). Returns null when no layout without overlaps
 * was found — the figure is then refused, never drawn with atoms on top of each other.
 */
export function layoutMolecule(m: Molecule, style: MolStyle): MoleculeLayout | null {
  const drawn: DrawnAtom[] = [];
  const edges: MolBond[] = [];
  const hydrogensOut = style !== 'skeletal';
  for (const a of m.atoms) {
    drawn.push({ key: a.id, el: a.el, h: hydrogensOut ? 0 : a.h, charge: a.charge, of: a.id });
    if (hydrogensOut) {
      for (let i = 1; i <= a.h; i++) {
        const key = `${a.id}h${i}`;
        drawn.push({ key, el: 'H', h: 0, charge: 0, of: a.id });
        edges.push({ a: a.id, b: key, order: 1 });
      }
    }
  }
  edges.push(...m.bonds);
  const nb = neighbours({ atoms: drawn.map((d) => ({ ...d, id: d.key })), bonds: edges });
  const rings = ringsOf(
    drawn.map((d) => d.key),
    nb,
  );
  if (rings === null) return null;
  // A branched chain drawn straight needs a longer side bond, as on a school board: the
  // hydrogens of a methyl group hanging off the chain would otherwise sit on its neighbours'.
  const tries: [mode: 'grid' | 'zigzag', stretch: number][] =
    style === 'skeletal'
      ? [['zigzag', 1]]
      : [
          ['grid', 1],
          ['grid', 2],
          ['zigzag', 1],
        ];
  for (const [mode, stretch] of tries) {
    const pos = place(drawn, nb, rings, mode, stretch);
    if (pos && !crowded(pos, edges)) return finish(drawn, edges, nb, rings, pos, style);
  }
  return null;
}

type Pos = Map<string, { x: number; y: number }>;

function place(
  drawn: DrawnAtom[],
  nb: Map<string, Neighbour[]>,
  rings: string[][],
  mode: 'grid' | 'zigzag',
  stretch: number,
): Pos | null {
  const pos: Pos = new Map();
  const ringOf = new Map<string, string[]>();
  for (const r of rings) for (const id of r) ringOf.set(id, r);
  const isH = (id: string) => drawn.find((d) => d.key === id)?.el === 'H';
  // How far the molecule reaches from `id` away from `from` — the longest branch continues
  // the chain straight on, the others go to the side.
  const reach = (id: string, from: string | null): number => {
    let best = 0;
    const seen = new Set<string>([id]);
    if (from) seen.add(from);
    let layer = [id];
    while (layer.length > 0) {
      const next: string[] = [];
      for (const x of layer)
        for (const n of nb.get(x) ?? [])
          if (!seen.has(n.id)) {
            seen.add(n.id);
            next.push(n.id);
          }
      if (next.length > 0) best++;
      layer = next;
    }
    return best;
  };
  let offsetX = 0;
  for (const start of drawn) {
    if (pos.has(start.key)) continue;
    // The end of the longest path of this part: the chain then runs from left to right.
    const root = farthest(farthest(start.key, nb, isH), nb, isH);
    const queue: {
      id: string;
      x: number;
      y: number;
      dir: number;
      sign: number;
      from: string | null;
    }[] = [];
    const put = (
      id: string,
      x: number,
      y: number,
      dir: number,
      sign: number,
      from: string | null,
    ) => {
      const ring = ringOf.get(id);
      if (ring && !pos.has(id)) {
        // The whole ring at once, as a regular polygon entered at `id` along `dir`.
        const n = ring.length;
        const radius = 1 / (2 * Math.sin(Math.PI / n));
        const cx = x + radius * Math.cos(dir);
        const cy = y + radius * Math.sin(dir);
        const at = ring.indexOf(id);
        for (let k = 0; k < n; k++) {
          const rid = ring[(at + k) % n] as string;
          const ang = dir + Math.PI + (2 * Math.PI * k) / n;
          pos.set(rid, { x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) });
        }
        for (const rid of ring) {
          const p = pos.get(rid);
          if (!p) continue;
          queue.push({
            id: rid,
            x: p.x,
            y: p.y,
            dir: Math.atan2(p.y - cy, p.x - cx),
            sign,
            from: '*ring',
          });
        }
        return;
      }
      if (pos.has(id)) return;
      pos.set(id, { x, y });
      queue.push({ id, x, y, dir, sign, from });
    };
    // A ring at the start is entered from below, so it stands upright with a flat top.
    put(root, offsetX, 0, ringOf.has(root) ? Math.PI / 2 : 0, -1, null);
    while (queue.length > 0) {
      const cur = queue.shift();
      if (!cur) break;
      const ring = ringOf.get(cur.id);
      const children = (nb.get(cur.id) ?? [])
        .map((n) => n.id)
        .filter((id) => !pos.has(id) && id !== cur.from);
      if (children.length === 0) continue;
      // Heavy atoms before hydrogens, the farthest-reaching first: it carries on the chain.
      children.sort(
        (p, q) => Number(isH(p)) - Number(isH(q)) || reach(q, cur.id) - reach(p, cur.id),
      );
      const dirs = ring
        ? ringDirections(cur.dir, children.length, mode)
        : chainDirections(cur.dir, children.length, mode, cur.sign, cur.from === null);
      if (dirs === null) return null;
      children.forEach((id, i) => {
        const d = dirs[i] as number;
        const side = mode === 'grid' && !ring && cur.from !== null && i > 0 && !isH(id);
        const len = side ? stretch : 1;
        put(id, cur.x + len * Math.cos(d), cur.y + len * Math.sin(d), d, -cur.sign, cur.id);
      });
    }
    let maxX = -Infinity;
    for (const p of pos.values()) maxX = Math.max(maxX, p.x);
    offsetX = maxX + 1.6;
  }
  return pos;
}

/** The atom farthest from `from` (fewest bonds), preferring an end that is not a hydrogen. */
function farthest(
  from: string,
  nb: Map<string, Neighbour[]>,
  isH: (id: string) => boolean,
): string {
  const dist = new Map<string, number>([[from, 0]]);
  let layer = [from];
  while (layer.length > 0) {
    const next: string[] = [];
    for (const x of layer)
      for (const n of nb.get(x) ?? [])
        if (!dist.has(n.id)) {
          dist.set(n.id, (dist.get(x) ?? 0) + 1);
          next.push(n.id);
        }
    layer = next;
  }
  let best = from;
  let bestScore = -1;
  for (const [id, d] of dist) {
    // A hydrogen end counts a little less: H–C–C–H stays, but a chain prefers a real end.
    const score = d - (isH(id) ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function chainDirections(
  dir: number,
  count: number,
  mode: 'grid' | 'zigzag',
  sign: number,
  root: boolean,
): number[] | null {
  if (root) {
    // The first atom: its neighbours spread evenly from the chain direction.
    if (count === 1) return [mode === 'zigzag' ? 30 * DEG : 0];
    if (mode === 'grid') return [0, 90 * DEG, -90 * DEG, 180 * DEG].slice(0, count);
    return Array.from(
      { length: count },
      (_, i) => (i * 2 * Math.PI) / count + (count === 2 ? 30 * DEG : 0),
    );
  }
  if (mode === 'grid') {
    if (count > 3) return null;
    return [dir, dir + 90 * DEG, dir - 90 * DEG].slice(0, count);
  }
  if (count === 1) return [dir - sign * 60 * DEG];
  if (count === 2) return [dir - sign * 60 * DEG, dir + sign * 60 * DEG];
  if (count === 3) return [dir, dir + 90 * DEG, dir - 90 * DEG];
  return null;
}

function ringDirections(out: number, count: number, mode: 'grid' | 'zigzag'): number[] | null {
  if (count === 1) return [out];
  const spread = mode === 'grid' ? 40 * DEG : 35 * DEG;
  if (count === 2) return [out + spread, out - spread];
  return null;
}

/** Atoms closer than half a bond, or two bonds that cross: the layout is no drawing. */
function crowded(pos: Pos, edges: MolBond[]): boolean {
  const pts = [...pos.entries()];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const [, p] = pts[i] as [string, { x: number; y: number }];
      const [, q] = pts[j] as [string, { x: number; y: number }];
      if (Math.hypot(p.x - q.x, p.y - q.y) < 0.55) return true;
    }
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i] as MolBond;
      const f = edges[j] as MolBond;
      if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
      const [p1, p2, q1, q2] = [pos.get(e.a), pos.get(e.b), pos.get(f.a), pos.get(f.b)];
      if (!p1 || !p2 || !q1 || !q2) return true;
      if (segmentsCross(p1, p2, q1, q2)) return true;
    }
  return false;
}

type XY = { x: number; y: number };

function segmentsCross(a: XY, b: XY, c: XY, d: XY): boolean {
  const cross = (o: XY, p: XY, q: XY) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number) => (n <= 1 ? '' : [...String(n)].map((c) => SUB[Number(c)]).join(''));

function finish(
  drawn: DrawnAtom[],
  edges: MolBond[],
  nb: Map<string, Neighbour[]>,
  rings: string[][],
  pos: Pos,
  style: MolStyle,
): MoleculeLayout {
  const centre = new Map<string, XY>();
  for (const r of rings) {
    const pts = r.map((id) => pos.get(id) ?? { x: 0, y: 0 });
    const c = {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
    for (const id of r) centre.set(id, c);
  }
  const atoms: LaidAtom[] = drawn.map((d) => {
    const p = pos.get(d.key) ?? { x: 0, y: 0 };
    const bondDirs = (nb.get(d.key) ?? []).map((n) => {
      const q = pos.get(n.id) ?? p;
      return Math.atan2(q.y - p.y, q.x - p.x);
    });
    const facts = ELEMENTS[d.el];
    const bonded = d.h + (nb.get(d.key) ?? []).reduce((s, n) => s + n.order, 0);
    const pairs = facts ? Math.max(0, (facts.valence - d.charge - bonded) / 2) : 0;
    const skeletalCorner =
      style === 'skeletal' && d.el === 'C' && d.charge === 0 && bondDirs.length > 0;
    let text: string | null = d.el;
    if (skeletalCorner) text = null;
    else if (d.h > 0 && bondDirs.length === 0) {
      // A lone particle is written as a school writes it: H₂O, H₂S, HCl — but NH₃, CH₄.
      text = ['O', 'S', 'F', 'Cl', 'Br', 'I'].includes(d.el)
        ? `H${sub(d.h)}${d.el}`
        : `${d.el}H${sub(d.h)}`;
    } else if (d.h > 0) {
      // In a skeletal formula the hydrogens are written at the atom, on the side away from
      // its bond: "OH" when the bond comes from the left, "HO" when it comes from the right.
      const fromRight = bondDirs.length === 1 && Math.cos(bondDirs[0] as number) > 0.3;
      text = fromRight ? `H${sub(d.h)}${d.el}` : `${d.el}H${sub(d.h)}`;
    }
    return {
      key: d.key,
      el: d.el,
      x: p.x,
      y: p.y,
      text,
      charge: d.charge,
      lonePairs: style === 'skeletal' ? [] : lonePairDirections(bondDirs, pairs),
      of: d.of,
    };
  });
  const bonds: LaidBond[] = edges.map((e) => {
    const c = centre.get(e.a);
    const sameRing = c !== undefined && centre.get(e.b) === c;
    return { from: e.a, to: e.b, order: e.order, ring: sameRing ? c : null };
  });
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  return {
    atoms,
    bonds,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Lone pairs go into the widest gaps between the bonds, spread evenly inside each gap. */
export function lonePairDirections(bondDirs: number[], pairs: number): number[] {
  if (pairs <= 0) return [];
  if (bondDirs.length === 0) return [90, 270, 180, 0].slice(0, pairs).map((d) => d * DEG);
  const sorted = bondDirs
    .map((d) => ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))
    .sort((a, b) => a - b);
  const gaps = sorted.map((d, i) => {
    const next =
      i + 1 < sorted.length ? (sorted[i + 1] as number) : (sorted[0] as number) + 2 * Math.PI;
    return { start: d, size: next - d, n: 0 };
  });
  for (let k = 0; k < pairs; k++) {
    let best = gaps[0] as (typeof gaps)[number];
    for (const g of gaps) if (g.size / (g.n + 1) > best.size / (best.n + 1) + 1e-9) best = g;
    best.n++;
  }
  const out: number[] = [];
  for (const g of gaps) for (let i = 1; i <= g.n; i++) out.push(g.start + (g.size * i) / (g.n + 1));
  return out;
}
