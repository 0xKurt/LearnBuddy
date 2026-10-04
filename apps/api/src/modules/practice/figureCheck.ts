// A figure that states numbers must agree with them (issues #253 and #257).
// docs/architecture.md §Practice, figures.
//
// Regel 0: what the model generates is checked by code, and what does not hold is REJECTED,
// never repaired. A drawing is not decoration once it carries a measure: "50°" at an arc that
// is 70° wide, or a triangle labelled 3–4–5 that is not right-angled, teaches the wrong thing
// with the full authority of a picture — and a key read off such a drawing would be wrong. So:
//
//   geometry (to scale)
//     - every angle with a size is that wide in the drawing (±2°), and a polygon whose every
//       angle is given adds up to (n − 2)·180° exactly;
//     - every side with a length has the same scale as the others (±3 %) — that is what makes
//       Pythagoras and the intercept theorem hold in the drawing;
//     - every force with a size has the same scale as the other forces, and a resultant IS the
//       vector sum of the forces it sums (by components, from the coordinates);
//     - a number written in a label is the stated value;
//     - the one "?" in the figure is what the key answers: the key must be the measure the
//       drawing has there.
//   molecule
//     - every atom's shell holds and the charges add up (`shared-math/src/molecule.ts`);
//     - a marked group is a functional group of this molecule;
//     - a key the figure declares it computes (`ask`) is the computed one: formula, lone
//       pairs, molar mass.
//   clock, money, dot field, base-ten blocks (issue #254)
//     - the figure keeps its own rules (`primaryProblem`, shared-math `primary.ts`);
//     - a key it declares (`ask`) is the computed one: the time the hands show ("7:45", and
//       19:45 for the same hands unless the task asks for 24 hours), the span between two
//       clocks in min or h, the amount of the coins in € or ct (whole cents — an amount that
//       cannot be laid with euro pieces is no key), the number of dots or blocks.
//
// The older parts of a geometry figure (segments, polygons and circles naming a point that
// does not exist) keep their pre-#257 handling in `items.ts`: dropped, the question stays.

import type { ModelFigure } from '@learnbuddy/shared-types/contracts';
import {
  canonicalizeUnit,
  checkMolecule,
  isPrimary,
  parseCanonicalKey,
  primaryKey,
  primaryProblem,
  sameTime,
  unitFactor,
  type Primary,
} from '@learnbuddy/shared-math';

import { parseFormula } from './chemistry.js';

type Geometry = Extract<ModelFigure, { type: 'geometry' }>;
type Molecule = Extract<ModelFigure, { type: 'molecule' }>;
type XY = { x: number; y: number };

/** How far a drawn angle may be from its stated size (issue #257: "±2° breit"). */
export const ANGLE_TOLERANCE_DEG = 2;
/** How far one stated length (or force) may stray from the figure's common scale. */
export const SCALE_TOLERANCE = 0.03;
/** A stated molar mass against the computed one: school tables round (C 12, H 1, O 16). */
const MOLAR_MASS_TOLERANCE = 0.005;

/** The number a key or a label starts with ("50", "50°", "5 cm", "$30$ N"), or null. */
export function leadingNumber(text: string): number | null {
  const m = /^\s*\$?\s*(-?\d+(?:[.,]\d+)?)/.exec(text);
  if (!m?.[1]) return null;
  return parseCanonicalKey(m[1]).value;
}

/** The size of angle ABC in degrees (0–180), from the coordinates. */
export function angleAt(a: XY, b: XY, c: XY): number | null {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  if (lu < 1e-9 || lv < 1e-9) return null;
  const cos = Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * The scale of a set of stated values over drawn lengths: their common ratio, or null when
 * one strays from it by more than the tolerance. Empty → NaN (nothing stated, nothing to check).
 */
export function commonScale(pairs: { value: number; drawn: number }[]): number | null {
  if (pairs.length === 0) return Number.NaN;
  const ratios = pairs.map((p) => p.value / p.drawn).sort((a, b) => a - b);
  const mid = ratios[Math.floor(ratios.length / 2)] as number;
  return ratios.every((r) => Math.abs(r - mid) <= SCALE_TOLERANCE * mid) ? mid : null;
}

/**
 * A label's own number agrees with the stated value, and a label that states a number has one.
 * "5 cm", "50°", "F = 30 N" state a number; "α", "a", "?" and an algebraic "2x" (a number with a
 * letter glued to it) do not.
 */
function labelAgrees(label: string | null, value: number | null): boolean {
  if (label === null) return true;
  const measure = label.replace(/^[^\d$-]*=\s*/, '');
  if (/^\s*-?\d+(?:[.,]\d+)?\p{L}(?!\p{L})/u.test(measure)) return true;
  const n = leadingNumber(measure);
  if (n === null) return true;
  return value !== null && Math.abs(n - value) <= 1e-9 * Math.max(1, Math.abs(value));
}

const isAsked = (label: string | null) => label !== null && label.trim() === '?';

/** What the one "?" of a geometry figure measures in the drawing, or null when it can't say. */
type Asked = { measure: number | null; tolerance: number } | null;

/**
 * Checks a to-scale geometry figure. Returns false when the figure contradicts its own numbers;
 * otherwise what its "?" measures (`asked`) for the key check, and how many "?" it has.
 */
function checkGeometry(f: Geometry): { ok: false } | { ok: true; asked: Asked; unknowns: number } {
  const at = new Map<string, XY>();
  for (const p of f.points) {
    if (at.has(p.name)) return { ok: false };
    at.set(p.name, p);
  }
  const pt = (n: string) => at.get(n);
  const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
  let asked: Asked = null;
  let unknowns = 0;

  // ── angles ──
  const sized = new Map<string, number>();
  for (const a of f.angles) {
    const [p, q, r] = a.at.map(pt);
    if (!p || !q || !r || new Set(a.at).size !== 3) return { ok: false };
    const drawn = angleAt(p, q, r);
    if (drawn === null || drawn < 1) return { ok: false };
    if (a.deg !== null) {
      const want = a.deg > 180 ? 360 - a.deg : a.deg;
      if (Math.abs(want - drawn) > ANGLE_TOLERANCE_DEG) return { ok: false };
      // Keyed by vertex and the two arms, in either order: ABC and CBA are one angle.
      const arms = [a.at[0], a.at[2]].sort().join('');
      sized.set(`${a.at[1]}:${arms}`, a.deg);
    }
    if (!labelAgrees(a.label, a.deg)) return { ok: false };
    if (isAsked(a.label)) {
      unknowns++;
      asked = {
        measure: a.deg !== null && a.deg > 180 ? 360 - drawn : drawn,
        tolerance: ANGLE_TOLERANCE_DEG,
      };
    }
  }
  // The angle sum, from the stated values themselves: every angle within ±2° is not enough —
  // 61° + 61° + 61° would pass that and still teach a triangle of 183°.
  for (const poly of f.polygons) {
    const n = poly.length;
    const values = poly.map((v, i) => {
      const arms = [poly[(i + n - 1) % n], poly[(i + 1) % n]].sort().join('');
      return sized.get(`${v}:${arms}`);
    });
    if (values.every((v) => v !== undefined)) {
      const sum = values.reduce<number>((s, v) => s + (v ?? 0), 0);
      if (Math.abs(sum - (n - 2) * 180) > 1e-6) return { ok: false };
    }
  }

  // ── lengths ──
  const lengthPairs: { value: number; drawn: number }[] = [];
  let askedLength: number | null = null;
  for (const l of f.lengths) {
    const p = pt(l.from);
    const q = pt(l.to);
    if (!p || !q || l.from === l.to) return { ok: false };
    const drawn = dist(p, q);
    if (drawn < 1e-9) return { ok: false };
    if (l.value !== null) lengthPairs.push({ value: l.value, drawn });
    if (!labelAgrees(l.label, l.value)) return { ok: false };
    if (isAsked(l.label)) {
      unknowns++;
      askedLength = drawn;
    }
  }
  const lengthScale = commonScale(lengthPairs);
  if (lengthScale === null) return { ok: false };
  if (askedLength !== null)
    asked = Number.isNaN(lengthScale)
      ? { measure: null, tolerance: 0 }
      : {
          measure: askedLength * lengthScale,
          tolerance: SCALE_TOLERANCE * askedLength * lengthScale,
        };

  // ── arrows (vectors, forces) ──
  const vec = (a: { from: string; to: string }) => {
    const p = pt(a.from);
    const q = pt(a.to);
    return p && q ? { x: q.x - p.x, y: q.y - p.y } : null;
  };
  const forcePairs: { value: number; drawn: number }[] = [];
  let askedArrow: number | null = null;
  for (const a of f.arrows) {
    const v = vec(a);
    if (!v || Math.hypot(v.x, v.y) < 1e-9) return { ok: false };
    if (a.value !== null) forcePairs.push({ value: a.value, drawn: Math.hypot(v.x, v.y) });
    if (!labelAgrees(a.label, a.value)) return { ok: false };
    if (isAsked(a.label)) {
      unknowns++;
      askedArrow = Math.hypot(v.x, v.y);
    }
  }
  const forceScale = commonScale(forcePairs);
  if (forceScale === null) return { ok: false };
  if (askedArrow !== null)
    asked = Number.isNaN(forceScale)
      ? { measure: null, tolerance: 0 }
      : { measure: askedArrow * forceScale, tolerance: SCALE_TOLERANCE * askedArrow * forceScale };
  for (const r of f.arrows.filter((a) => a.resultant)) {
    if (!resultantHolds(r, f.arrows, vec)) return { ok: false };
  }

  // ── rays and lines: two different, existing points ──
  for (const r of f.rays)
    if (!pt(r.from) || !pt(r.through) || r.from === r.through) return { ok: false };
  for (const l of f.lines) if (!pt(l.a) || !pt(l.b) || l.a === l.b) return { ok: false };

  return { ok: true, asked, unknowns };
}

type Arrow = Geometry['arrows'][number];

/**
 * A resultant is the vector sum of the forces it sums: either the forces that start where it
 * starts (a parallelogram), or the chain of forces laid head to tail from its start to its end.
 */
function resultantHolds(r: Arrow, arrows: readonly Arrow[], vec: (a: Arrow) => XY | null): boolean {
  const target = vec(r);
  if (!target) return false;
  const size = Math.hypot(target.x, target.y);
  const close = (s: XY) => Math.hypot(s.x - target.x, s.y - target.y) <= SCALE_TOLERANCE * size;
  const parts = arrows.filter((a) => a !== r && !a.resultant);
  const fromHere = parts.filter((a) => a.from === r.from);
  if (fromHere.length >= 2) {
    const sum = fromHere.reduce(
      (s, a) => {
        const v = vec(a) ?? { x: 0, y: 0 };
        return { x: s.x + v.x, y: s.y + v.y };
      },
      { x: 0, y: 0 },
    );
    if (close(sum)) return true;
  }
  // Head to tail: follow the arrows from the resultant's start; they must end at its end.
  let at = r.from;
  const sum = { x: 0, y: 0 };
  const used = new Set<Arrow>();
  for (;;) {
    const next = parts.find((a) => a.from === at && !used.has(a));
    if (!next) break;
    used.add(next);
    const v = vec(next) ?? { x: 0, y: 0 };
    sum.x += v.x;
    sum.y += v.y;
    at = next.to;
    if (at === r.to) break;
  }
  return used.size >= 2 && at === r.to && close(sum);
}

/** A figure that declares what its key is (`ask`) holds only with exactly that key. */
function checkMoleculeFigure(f: Molecule, solution: string): boolean {
  const c = checkMolecule(f, { style: f.style, mark: f.mark });
  if (!c.ok) return false;
  switch (f.ask) {
    case null:
      return true;
    case 'formula': {
      // A key in the app's math notation ($C_{2}H_{6}O$) counts like the plain one: the
      // subscript mark carries no chemistry (the braces and dollars parseFormula drops itself).
      const parsed = parseFormula(solution.replace(/_/g, ''));
      if (!parsed || parsed.charge !== c.facts.charge) return false;
      if (parsed.atoms.size !== c.facts.counts.size) return false;
      for (const [el, n] of c.facts.counts) if (parsed.atoms.get(el) !== n) return false;
      return true;
    }
    case 'lone_pairs': {
      const v = leadingNumber(solution);
      return v !== null && v === c.facts.totalLonePairs;
    }
    case 'molar_mass': {
      const v = leadingNumber(solution);
      if (v === null) return false;
      return Math.abs(v - c.facts.molarMass) <= MOLAR_MASS_TOLERANCE * c.facts.molarMass;
    }
  }
}

/** A key's time, in the one notation a key writes it in ("7:45", "19:05"). */
const CLOCK_KEY = /^\s*(\d{1,2}):([0-5]\d)\s*$/;

/** The key's number in `to` (min, ct), from its own unit or the item's; null without one. */
function inUnit(solution: string, unit: string | null, to: string): number | null {
  const key = parseCanonicalKey(solution);
  const from = canonicalizeUnit(unit) ?? key.unit;
  if (key.value === null || from === null) return null;
  const factor = unitFactor(from, to);
  return factor === null ? null : (key.value * Number(factor.num)) / Number(factor.den);
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/**
 * A primary-school figure (issue #254) holds by its own rules, and a key it declares is the one
 * code computes from it. A time is never a number question: "7:45" as a number is 7 ÷ 45.
 */
export function primaryHolds(
  f: Primary,
  solution: string,
  numeric: boolean,
  unit: string | null,
): boolean {
  if (primaryProblem(f) !== null) return false;
  const key = primaryKey(f);
  if (key === null) return true;
  switch (key.kind) {
    case 'time': {
      const m = CLOCK_KEY.exec(solution);
      if (numeric || !m || Number(m[1]) > 23) return false;
      return sameTime({ h: Number(m[1]), m: Number(m[2]) }, key.time, key.h24);
    }
    case 'span': {
      const minutes = inUnit(solution, unit, 'min');
      return minutes !== null && same(minutes, key.minutes);
    }
    case 'amount': {
      // Exactly the coins' sum: 3,455 € cannot be laid with euro pieces, and is not 3,45 €.
      const cents = inUnit(solution, unit, 'ct');
      return cents !== null && same(cents, key.cents);
    }
    case 'count': {
      const v = leadingNumber(solution);
      return v !== null && v === key.n;
    }
  }
}

/**
 * Does a question's figure hold, together with its key? `solution` is the key as the learner
 * would see it (for multiple choice the text of the right option); `numeric` says whether the
 * key must be a number; `unit` is the item's own unit, when the key does not carry one. True
 * for every figure this module has nothing to check on.
 */
export function figureHolds(
  figure: ModelFigure | null,
  solution: string,
  numeric: boolean,
  unit: string | null = null,
): boolean {
  if (!figure) return true;
  if (figure.type === 'molecule') return checkMoleculeFigure(figure, solution);
  if (isPrimary(figure)) return primaryHolds(figure, solution, numeric, unit);
  if (figure.type !== 'geometry') return true;
  const g = checkGeometry(figure);
  if (!g.ok) return false;
  // One question, one answer: two "?" in the drawing leave open which one the key is.
  if (g.unknowns > 1) return !numeric;
  if (g.unknowns === 0 || g.asked === null || g.asked.measure === null) return true;
  const v = leadingNumber(solution);
  if (v === null) return !numeric;
  return Math.abs(v - g.asked.measure) <= Math.max(g.asked.tolerance, 1e-6);
}
