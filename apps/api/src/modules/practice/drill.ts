// Kopfrechnen-Schnellrunde (issue #243): the tasks, their keys, their order and the check —
// all code, no model. docs/architecture.md §Practice "Kopfrechnen".
//
// Buddy picks ONE thing: a range from a closed list (`DrillSpec`, contracts/drill.ts). From
// there everything is arithmetic:
//
//   · `factsOf` lists every task of the range. A task is a FACT with a machine key
//     (`times:7x8`, `plus:37+48`, `frac:1/2+1/4` …) — the key is what makes "7 · 8" the same
//     question across rounds, with one FSRS state, so the weak facts can come back more often.
//   · `factOf` reads a key back. The key is the question's one source: its text and its value
//     are COMPUTED from it, so the stored answer is never trusted and never needed — the check
//     recomputes the value from the key (#224 "Regel 0": code solves what is mechanical).
//   · `pickRound` draws a round, weighted by what FSRS knows (`weightOf`): a fact she missed
//     last time weighs the most, a due one next, a new one in between, a sitting one least.
//     Never a fact twice in a round, and never two mirror tasks (7 · 8, 8 · 7) in a row.
//   · `checkDrill` compares values exactly (rational arithmetic, no floats): because code wrote
//     the task, code knows it asks for an AMOUNT — 6/8 for ½ + ¼ is right, like the fraction
//     bars' `form_free` (issue #162). For a key the model wrote, decision D-3 stands as before.
//   · `drillLine` says the one sentence at the end, from what was observed — never a count.
//
// Nothing here touches the database, a clock or a random source of its own: the round is a
// function of the range, the states, the instant and a seed, so a test can reproduce it.

import {
  DRILL_ROUND,
  type DrillGroup,
  type DrillLine,
  type DrillSpec,
} from '@learnbuddy/shared-types/contracts';

import { t } from '../../i18n/index.js';

/** `practice_sessions.pass` of a round (migration 0082). */
export const DRILL_PASS = 'drill';

/** A whole number or a fraction, kept exact. `d` > 0, not necessarily reduced. */
type Rational = { n: number; d: number };

export type Fact =
  | { op: 'times'; a: number; b: number }
  | { op: 'divide'; a: number; b: number }
  | { op: 'plus'; a: number; b: number }
  | { op: 'minus'; a: number; b: number }
  | { op: 'frac'; x: Rational; y: Rational }
  | { op: 'pct'; p: number; of: number };

// ─────────────── keys ───────────────

export function keyOf(f: Fact): string {
  switch (f.op) {
    case 'times':
      return `times:${f.a}x${f.b}`;
    case 'divide':
      return `divide:${f.a}/${f.b}`;
    case 'plus':
      return `plus:${f.a}+${f.b}`;
    case 'minus':
      return `minus:${f.a}-${f.b}`;
    case 'frac':
      return `frac:${f.x.n}/${f.x.d}+${f.y.n}/${f.y.d}`;
    case 'pct':
      return `pct:${f.p}%${f.of}`;
  }
}

/** Each key shape, and how its numbers become a fact. Numbers have at most three digits. */
const SHAPES: ReadonlyArray<[RegExp, (v: number[]) => Fact]> = [
  [/^times:(\d{1,3})x(\d{1,3})$/, ([a, b]) => ({ op: 'times', a: a!, b: b! })],
  [/^divide:(\d{1,3})\/(\d{1,3})$/, ([a, b]) => ({ op: 'divide', a: a!, b: b! })],
  [/^plus:(\d{1,3})\+(\d{1,3})$/, ([a, b]) => ({ op: 'plus', a: a!, b: b! })],
  [/^minus:(\d{1,3})-(\d{1,3})$/, ([a, b]) => ({ op: 'minus', a: a!, b: b! })],
  [
    /^frac:(\d{1,3})\/(\d{1,3})\+(\d{1,3})\/(\d{1,3})$/,
    ([a, b, c, d]) => ({ op: 'frac', x: { n: a!, d: b! }, y: { n: c!, d: d! } }),
  ],
  [/^pct:(\d{1,3})%(\d{1,3})$/, ([p, of]) => ({ op: 'pct', p: p!, of: of! })],
];

/**
 * A stored key read back as a fact — or null when it is not one a range can produce. The
 * same test `factsOf` passes, so a hand-edited or corrupted row is never asked and never
 * checked against a value nobody computed.
 */
export function factOf(key: string): Fact | null {
  for (const [shape, make] of SHAPES) {
    const m = shape.exec(key);
    if (!m) continue;
    const f = make(m.slice(1).map(Number));
    return wellFormed(f) ? f : null;
  }
  return null;
}

/** The conditions every range keeps; a fact outside them is not a task. */
function wellFormed(f: Fact): boolean {
  switch (f.op) {
    case 'times':
      return inRow(f.a) && inRow(f.b);
    case 'divide':
      return inRow(f.b) && f.a % f.b === 0 && inRow(f.a / f.b);
    case 'plus':
      return f.a >= 1 && f.b >= 1 && f.a + f.b <= 100;
    case 'minus':
      return f.b >= 1 && f.a > f.b && f.a <= 100;
    case 'frac': {
      const fam = familyOf(f.x.d);
      return (
        fam !== null &&
        fam === familyOf(f.y.d) &&
        properLowest(f.x) &&
        properLowest(f.y) &&
        f.x.n * f.y.d + f.y.n * f.x.d <= f.x.d * f.y.d
      );
    }
    case 'pct':
      return PERCENTS.includes(f.p) && f.of % 20 === 0 && f.of >= 20 && f.of <= 200;
  }
}

const inRow = (v: number) => Number.isInteger(v) && v >= 1 && v <= 10;

// ─────────────── the ranges ───────────────

const ALL_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Denominator families: a sum stays within one, so it is mental arithmetic, not a method. */
const FAMILIES: readonly (readonly number[])[] = [
  [2, 4, 8],
  [3, 6],
  [5, 10],
];
const PERCENTS = [10, 20, 25, 50, 75];

function familyOf(d: number): number | null {
  const i = FAMILIES.findIndex((f) => f.includes(d));
  return i < 0 ? null : i;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

function properLowest(r: Rational): boolean {
  return r.n >= 1 && r.n < r.d && gcd(r.n, r.d) === 1;
}

/** Crossing the ten: the units add up to ten or more (plus), or borrow (minus). */
export function carries(f: Fact): boolean {
  if (f.op === 'plus') return (f.a % 10) + (f.b % 10) >= 10;
  if (f.op === 'minus') return f.a % 10 < f.b % 10;
  return false;
}

function keepCarry(spec: DrillSpec, f: Fact): boolean {
  if (spec.carry === null) return true;
  return carries(f) === (spec.carry === 'with');
}

/** Every task of a range, each once, in a fixed order. */
export function factsOf(spec: DrillSpec): Fact[] {
  const out: Fact[] = [];
  const rows = spec.rows ?? ALL_ROWS;
  switch (spec.range) {
    case 'plus_10':
      for (let a = 1; a <= 9; a++) for (let b = 1; a + b <= 10; b++) out.push({ op: 'plus', a, b });
      break;
    case 'plus_20':
      for (let a = 1; a <= 19; a++)
        for (let b = 1; a + b <= 20; b++) if (a + b > 10) out.push({ op: 'plus', a, b });
      break;
    case 'minus_20':
      for (let a = 11; a <= 20; a++) for (let b = 1; b < a; b++) out.push({ op: 'minus', a, b });
      break;
    case 'plus_100':
      // Within 100 and past 20 (below that is plus_20), at least one two-digit number.
      for (let a = 1; a <= 99; a++)
        for (let b = 1; a + b <= 100; b++)
          if (a + b > 20 && Math.max(a, b) >= 10) out.push({ op: 'plus', a, b });
      break;
    case 'minus_100':
      for (let a = 21; a <= 100; a++) for (let b = 1; b < a; b++) out.push({ op: 'minus', a, b });
      break;
    case 'times': {
      const seen = new Set<string>();
      for (const r of rows)
        for (let k = 1; k <= 10; k++)
          for (const f of [
            { op: 'times', a: r, b: k },
            { op: 'times', a: k, b: r },
          ] as const) {
            if (!seen.has(keyOf(f))) {
              seen.add(keyOf(f));
              out.push(f);
            }
          }
      break;
    }
    case 'divide': {
      const seen = new Set<string>();
      for (const r of rows)
        for (let k = 1; k <= 10; k++)
          // 56 : 7 and 56 : 8 both belong to the 7s: the row is the times table she learns.
          for (const f of [
            { op: 'divide', a: r * k, b: r },
            { op: 'divide', a: r * k, b: k },
          ] as const) {
            if (!seen.has(keyOf(f))) {
              seen.add(keyOf(f));
              out.push(f);
            }
          }
      break;
    }
    case 'fractions':
      for (const fam of FAMILIES) {
        const parts: Rational[] = [];
        for (const d of fam) for (let n = 1; n < d; n++) if (gcd(n, d) === 1) parts.push({ n, d });
        for (const x of parts)
          for (const y of parts) {
            const f: Fact = { op: 'frac', x, y };
            if (wellFormed(f)) out.push(f);
          }
      }
      break;
    case 'percent':
      for (const p of PERCENTS)
        for (let of = 20; of <= 200; of += 20) out.push({ op: 'pct', p, of });
      break;
  }
  return out.filter((f) => wellFormed(f) && keepCarry(spec, f));
}

// ─────────────── values, texts ───────────────

/** The exact value a fact asks for. */
export function valueOf(f: Fact): Rational {
  switch (f.op) {
    case 'times':
      return { n: f.a * f.b, d: 1 };
    case 'divide':
      return { n: f.a / f.b, d: 1 };
    case 'plus':
      return { n: f.a + f.b, d: 1 };
    case 'minus':
      return { n: f.a - f.b, d: 1 };
    case 'frac':
      return reduce({ n: f.x.n * f.y.d + f.y.n * f.x.d, d: f.x.d * f.y.d });
    case 'pct':
      return { n: (f.p * f.of) / 100, d: 1 };
  }
}

function reduce(r: Rational): Rational {
  const g = gcd(r.n, r.d) || 1;
  return { n: r.n / g, d: r.d / g };
}

const frac = (r: Rational) => `\\frac{${r.n}}{${r.d}}`;

/** The task as she reads it (math between `$`, like every other question text). */
export function promptOf(f: Fact, locale: string): string {
  switch (f.op) {
    case 'times':
      return `${f.a} · ${f.b}`;
    case 'divide':
      return `${f.a} : ${f.b}`;
    case 'plus':
      return `${f.a} + ${f.b}`;
    case 'minus':
      return `${f.a} − ${f.b}`;
    case 'frac':
      return `$${frac(f.x)} + ${frac(f.y)}$`;
    case 'pct':
      return t(locale, 'drill.percent_of', { p: f.p, n: f.of });
  }
}

/** The key as she reads it once the task is closed: lowest terms, or a whole number. */
export function answerOf(f: Fact): string {
  const v = valueOf(f);
  return v.d === 1 ? String(v.n) : `$${frac(v)}$`;
}

/** What she typed, as an exact value — digits, one "/" or one decimal mark. */
export function parseGiven(text: string): Rational | null {
  const s = text.trim();
  let m = /^(\d{1,6})\/(\d{1,6})$/.exec(s);
  if (m) {
    const d = Number(m[2]);
    return d === 0 ? null : { n: Number(m[1]), d };
  }
  m = /^(\d{1,6})(?:[.,](\d{1,4}))?$/.exec(s);
  if (!m) return null;
  const decimals = m[2] ?? '';
  const d = 10 ** decimals.length;
  return { n: Number(m[1]) * d + Number(decimals || '0'), d };
}

/**
 * Her answer against the value COMPUTED from the fact — never against a stored key. Exact:
 * cross-multiplied whole numbers, so no rounding can make a wrong answer right.
 */
export function checkDrill(f: Fact, text: string): boolean {
  const given = parseGiven(text);
  if (!given) return false;
  const want = valueOf(f);
  return given.n * want.d === want.n * given.d;
}

/** Fractions need the "/" on the pad; everything else is whole numbers. */
export function inputOf(spec: DrillSpec): 'whole' | 'fraction' {
  return spec.range === 'fractions' ? 'fraction' : 'whole';
}

/** The round's name in her language — also its questions' topic. */
export function titleOf(spec: DrillSpec, locale: string): string {
  const rows = spec.rows ? [...spec.rows].sort((x, y) => x - y) : null;
  const list = rows
    ? rows.length === 1
      ? String(rows[0])
      : `${rows.slice(0, -1).join(', ')} ${t(locale, 'drill.and')} ${rows[rows.length - 1]}`
    : null;
  const base =
    spec.range === 'times'
      ? list
        ? t(locale, 'drill.title.times_rows', { rows: list })
        : t(locale, 'drill.title.times')
      : spec.range === 'divide'
        ? list
          ? t(locale, 'drill.title.divide_rows', { rows: list })
          : t(locale, 'drill.title.divide')
        : t(locale, `drill.title.${spec.range}`);
  return spec.carry === null ? base : `${base} ${t(locale, `drill.carry_${spec.carry}`)}`;
}

/** Which row a times or division task belongs to, as the round names it ("die 7er"). */
export function groupOf(f: Fact, spec: DrillSpec): DrillGroup {
  if (f.op !== 'times' && f.op !== 'divide') return { kind: 'range' };
  const rows = spec.rows ?? ALL_ROWS;
  // times: the factor that is one of her rows (both: the larger, the harder one).
  // divide: the row it was made from — the divisor or the result.
  const candidates = f.op === 'times' ? [f.a, f.b] : [f.b, f.a / f.b];
  const mine = candidates.filter((c) => rows.includes(c));
  const n = Math.max(...(mine.length > 0 ? mine : candidates));
  return { kind: f.op, n };
}

// ─────────────── the round ───────────────

/** What FSRS knows about one fact (null: she has never been asked it). */
export type FactState = {
  due: Date;
  last_outcome: string | null;
  lapses: number;
};

/**
 * How strongly a fact pulls into the next round. Missed last time > due > new > sitting. The
 * numbers are ratios, not probabilities; what they promise is only the ORDER (unit-tested).
 */
export function weightOf(state: FactState | null, now: Date): number {
  if (!state) return 1;
  const lapses = Math.min(state.lapses, 3) * 0.5;
  if (state.last_outcome === 'revealed' || state.last_outcome === 'with_help') return 4 + lapses;
  if (state.due.getTime() <= now.getTime()) return 2.5 + lapses;
  return 0.35 + lapses;
}

/** A small seeded generator (mulberry32): the same seed, the same round. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two tasks with the same numbers (7 · 8 and 8 · 7): back to back, the second is a copy. */
function twins(x: Fact, y: Fact): boolean {
  if (x.op !== y.op || (x.op !== 'times' && x.op !== 'plus') || keyOf(x) === keyOf(y)) {
    return false;
  }
  const xs = x as { a: number; b: number };
  const ys = y as { a: number; b: number };
  return xs.a === ys.b && xs.b === ys.a;
}

/**
 * One round: up to `size` facts, each at most once, drawn by weight (Efraimidis–Spirakis —
 * every fact gets the key u^(1/w), the largest keys win, so a heavy fact is both more likely
 * to be in the round and likely to come early). `avoidFirst` is the fact the previous round
 * ended with, so a new round never opens with the task she just saw.
 */
export function pickRound(
  facts: readonly Fact[],
  states: ReadonlyMap<string, FactState>,
  now: Date,
  seed: string,
  opts: { size?: number; avoidFirst?: string | null } = {},
): Fact[] {
  const size = opts.size ?? DRILL_ROUND;
  const rand = seededRandom(seed);
  const keyed = facts.map((f) => {
    const w = weightOf(states.get(keyOf(f)) ?? null, now);
    // `1 - rand()` is in (0, 1], so the logarithm is finite.
    return { f, k: Math.log(1 - rand()) / w };
  });
  keyed.sort((x, y) => y.k - x.k);
  // Taken in that order, except that a task which would stand right after its mirror (7 · 8,
  // 8 · 7) — or open the round with the task the last one ended with — waits for the next
  // place where it does not. Only when nothing else is left does it go where it clashes.
  const clashes = (round: readonly Fact[], f: Fact): boolean =>
    round.length === 0
      ? opts.avoidFirst != null && keyOf(f) === opts.avoidFirst
      : twins(round[round.length - 1]!, f);
  const order = keyed.map((x) => x.f);
  const round: Fact[] = [];
  const waiting: Fact[] = [];
  let next = 0;
  while (round.length < size && (next < order.length || waiting.length > 0)) {
    const w = waiting.findIndex((f) => !clashes(round, f));
    if (w >= 0) {
      round.push(waiting.splice(w, 1)[0]!);
    } else if (next < order.length) {
      const f = order[next++]!;
      if (clashes(round, f)) waiting.push(f);
      else round.push(f);
    } else {
      round.push(waiting.shift()!);
    }
  }
  return round;
}

// ─────────────── the line at the end ───────────────

export type ClosedTask = {
  fact: Fact;
  correct: boolean;
  /** How the review BEFORE this round had ended (`session_items.state_before`), or null. */
  before: string | null;
};

/**
 * The one sentence at the end of a round — from what was observed in it, never a count.
 *
 *  - `better`: a task of a group she had missed last time (`before` = revealed / with_help) is
 *    right now. That is an improvement measured on the same question, not a feeling.
 *  - `solid`: every task of a group was right (the largest such group, at least three tasks).
 *  - `again`: otherwise the group with the most misses — said as where to go on, not as a
 *    verdict. Null when nothing was answered.
 */
export function drillLine(tasks: readonly ClosedTask[], spec: DrillSpec): DrillLine | null {
  if (tasks.length === 0) return null;
  const byGroup = new Map<
    string,
    { group: DrillGroup; better: number; right: number; n: number }
  >();
  for (const task of tasks) {
    const group = groupOf(task.fact, spec);
    const id = group.kind === 'range' ? 'range' : `${group.kind}:${group.n}`;
    const g = byGroup.get(id) ?? { group, better: 0, right: 0, n: 0 };
    g.n += 1;
    if (task.correct) {
      g.right += 1;
      if (task.before === 'revealed' || task.before === 'with_help') g.better += 1;
    }
    byGroup.set(id, g);
  }
  const groups = [...byGroup.values()];
  const most = <T>(xs: T[], by: (x: T) => number): T | undefined =>
    xs.reduce<T | undefined>(
      (best, x) => (best === undefined || by(x) > by(best) ? x : best),
      undefined,
    );
  const better = most(
    groups.filter((g) => g.better > 0),
    (g) => g.better,
  );
  if (better) return { line: 'better', group: better.group };
  // Everything right: the round as a whole sits (one row: that row).
  if (groups.every((g) => g.right === g.n)) {
    return { line: 'solid', group: groups.length === 1 ? groups[0]!.group : { kind: 'range' } };
  }
  const solid = most(
    groups.filter((g) => g.right === g.n && g.n >= 3),
    (g) => g.n,
  );
  if (solid) return { line: 'solid', group: solid.group };
  return { line: 'again', group: most(groups, (g) => g.n - g.right)!.group };
}
