// A written calculation path, checked step by step (issue #209).
//
// In a class test and in the Abitur the WAY is marked, not only the result: the IQB operator
// "berechnen" says it is "ausgehend von einem Ansatz darzustellen". Until now only one number
// was compared against the key — so someone who computed correctly and mistyped at the end got
// the same verdict as someone who had no idea, and a typed path went to the model, whose
// judgement nothing checked (CLAUDE.md rule 1).
//
// This checks each transition line n → n+1 for EQUIVALENCE and reports the FIRST line that no
// longer follows. Code decides which step broke; the model only helps with that step.
//
// How equivalence is decided, and why that is honest:
//   - a term against a term: the same value at every usable probe point;
//   - an equation against an equation: the difference of the two sides must be PROPORTIONAL
//     (2x+3=7 → 2x=4 keeps the difference; 2x=4 → x=2 halves it, and both have the same root);
//   - with several variables (issue #263, "Formel umstellen": v = s/t → s = v·t) a step may
//     multiply by a VARIABLE, so the factor is no longer constant. Then the roots are compared
//     instead: wherever a line is linear in one variable, its root there is computed and put
//     into the other line, in BOTH directions. A root of one that is no root of the other is a
//     solution gained or lost — certainly a different equation;
//   - an inequality in one variable (issue #263) whose sides differ by a LINEAR term: its
//     solution set is a half-line, computed exactly (boundary, direction, strict or not). The
//     classic slip — multiplying by a negative number without turning the sign — moves the
//     direction, and the step that did it is the one reported.
// The probe points are FIXED, never random: a judgement about a child's work must not depend on
// a dice roll, and two runs must agree (CLAUDE.md rule 7's spirit — one clock, no chance).
//
// Several variables are probed at POSITIVE values only. A formula in school (s = v·t,
// v = √(2gh)) is about quantities that are positive, and squaring both sides of v = √(2gh) is a
// legal step there; probing a negative speed would call it broken. The price is stated, not
// hidden: a step that only holds for positive values is accepted with several variables.
//
// What it deliberately refuses, rather than guessing:
//   - case distinctions, proofs, chains like 1 < x < 3, ≠, an inequality with several variables
//     or one that is not linear;
//   - a line whose variables differ from the line before (a system being solved: that is
//     `systems.ts`, which compares the solution, not the steps);
//   - any line it cannot parse completely.
// All of those come back `unknown` and go to the model, which is where they belonged anyway.

import {
  type Expr,
  evaluateExpression,
  parseExpression,
  plainMath,
  variablesOf,
} from '@learnbuddy/shared-math';

/** Known names the parser already owns; anything else alphabetic is the variable. */
const RESERVED = new Set(['sqrt', 'abs', 'sin', 'cos', 'tan', 'ln', 'log', 'exp', 'pi', 'e', 'x']);

/**
 * Fixed, non-integer probe points. Non-integer on purpose: at whole numbers two different
 * expressions agree by accident far more often (x² and 2x both give 4 at x=2). Spread over
 * negatives and positives so a sign error cannot hide.
 */
const PROBES = [-3.25, -1.5, -0.375, 0.75, 1.625, 2.5, 4.125, 6.75] as const;

/**
 * Fixed POSITIVE probe values for lines with several variables (see the header for why). Each
 * variable walks this list from another starting place, so two variables never share a value
 * at a probe — v = t would otherwise look like an identity.
 */
const POSITIVE = [0.75, 1.625, 2.5, 4.125, 6.75, 0.4375, 3.3125, 5.5625] as const;

/** At least this many points must be usable before any verdict is given. */
const ENOUGH_PROBES = 3;

export function close(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * The one variable a line uses, renamed to the `x` the parser knows — or null when there is
 * more than one, which the single-variable reading does not handle.
 */
function oneVariable(src: string): { src: string; name: string | null } | null {
  // `x` counts as a name here: "2x + y" has two variables, and renaming y to x would turn it
  // into 3x — a different line that the checks below would then judge with full confidence.
  const names = new Set(
    (src.toLowerCase().match(/[a-z]+/g) ?? []).filter((n) => n === 'x' || !RESERVED.has(n)),
  );
  if (names.size > 1) return null;
  const name = [...names][0];
  if (name === undefined) return { src, name: null }; // a pure number line is fine
  if (name.length > 1) return null; // a word, not a variable: not ours
  return { src: src.replace(new RegExp(name, 'gi'), 'x'), name };
}

/**
 * Several variables, each a single letter as written (case kept: `V` is not `v`). A run of two
 * or more letters that is not a function name refuses the line: "cm", "kN", "min" are units,
 * "mal" and "also" are words, and reading any of them as a product of variables would invent
 * algebra that is not there (grading truth table H-4, `a = 12 cm` ← `a = 13 cm`).
 */
function severalVariables(src: string): boolean {
  const runs = src.match(/[A-Za-z]+/g) ?? [];
  return runs.every((r) => r.length === 1 || RESERVED.has(r.toLowerCase()));
}

export type Relation = '=' | '<' | '>' | '≤' | '≥';

/**
 * One parsed line: a term (`right` null), an equation or an inequality. `vars` are the variable
 * names; for a single-variable line the variable is renamed to `x`, so a path may call it a or t.
 */
export type Line = {
  raw: string;
  vars: readonly string[];
  /**
   * The name a single variable had before it was renamed to x (lower case), null for a pure
   * number line or several variables. "x = 2" followed by "y = 3" is two answers, not a step.
   */
  named: string | null;
  left: Expr;
  right: Expr | null;
  rel: Relation | null;
};

const RELATION = /<=|>=|=<|=>|≤|≥|≠|<|>|=/g;

function relationOf(token: string): Relation | null {
  switch (token) {
    case '=':
      return '=';
    case '<':
      return '<';
    case '>':
      return '>';
    case '≤':
    case '<=':
      return '≤';
    case '≥':
    case '>=':
      return '≥';
    // "=<" and "=>" read as implication as often as as a relation, and ≠ has no solution set
    // this module computes: refused.
    default:
      return null;
  }
}

function buildLine(
  raw: string,
  src: string,
  letters: 'x' | 'letters',
  named: string | null,
): Line | null {
  const rels = [...src.matchAll(RELATION)];
  if (rels.length > 1) return null;
  const at = rels[0];
  if (at === undefined) {
    const left = parseExpression(src.trim(), letters);
    return left ? { raw, vars: variablesOf(left), named, left, right: null, rel: null } : null;
  }
  const rel = relationOf(at[0]);
  if (rel === null) return null;
  const left = parseExpression(src.slice(0, at.index).trim(), letters);
  const right = parseExpression(src.slice(at.index + at[0].length).trim(), letters);
  if (!left || !right) return null;
  const vars = [...new Set([...variablesOf(left), ...variablesOf(right)])].sort();
  return { raw, vars, named, left, right, rel };
}

/**
 * One line: a term, or an equation or inequality with exactly one relation. Returns null for
 * anything that does not parse completely — a line half understood is worse than a line not
 * understood. One variable (any name, case folded) is read as before (#209); more than one only
 * when each is a single letter (issue #263).
 */
export function parseLine(raw: string): Line | null {
  const src = plainMath(raw);
  const one = oneVariable(src);
  if (one !== null) return buildLine(raw, one.src, 'x', one.name);
  if (!severalVariables(src)) return null;
  const line = buildLine(raw, src, 'letters', null);
  return line !== null && line.vars.length >= 2 ? line : null;
}

/** A relation in a line: a step note follows an equation or inequality, never a lone term. */
const RELATION_SIGN = /[=<>≤≥]/;

/**
 * A step note: the operation she writes after a vertical bar at the end of a line, as German
 * schools teach it ("2x + 3 = 7 | −3", "2x = 4 | :2"). It says what she does next and is not
 * part of the line's maths. Only an OPENING bar is one — with an even number of bars before it —
 * so the closing bar of an absolute value ("y = |x| · 2") is never taken for a note.
 */
function withoutStepNote(line: string): string {
  const at = line.lastIndexOf('|');
  if (at < 0) return line;
  const before = line.slice(0, at);
  const opening = (before.match(/\|/g) ?? []).length % 2 === 0;
  const note = /^\s*[-+−–·*×:/÷^√]\s*[^|=<>≤≥]*$/.test(line.slice(at + 1));
  return opening && note && RELATION_SIGN.test(before) ? before : line;
}

/**
 * The lines of a written path, in order; empty lines, bullet markers, a leading "⇔"/"⇒" and step
 * notes dropped — typed or copied off her photographed working (issue #444).
 */
export function pathLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) =>
      withoutStepNote(
        l
          // A learner numbers or bullets her lines; the marker is not part of the maths. A marker is
          // followed by a space: "-2x > 6" starts with a minus sign and "2.5x = 5" with a decimal,
          // and stripping either would change the line it is about to check (issue #263).
          .replace(/^\s*(?:\d+[.)]|[-–•*>])\s+/, '')
          // "⇔ 2x = 4": the arrow joins the line to the one before; the next step is checked anyway.
          .replace(/^\s*(?:⇔|⇒|<=>|=>|→)\s*/, '')
          .replace(/[$]/g, ''),
      ).trim(),
    )
    .filter((l) => l !== '');
}

export type Compared = 'same' | 'different' | 'unsure';

type Env = Record<string, number>;

/** The fixed probe assignments for these variables. */
export function probeEnvs(vars: readonly string[]): Env[] {
  if (vars.length <= 1) {
    const name = vars[0] ?? 'x';
    return PROBES.map((p) => ({ [name]: p }));
  }
  return POSITIVE.map((_, k) =>
    Object.fromEntries(vars.map((v, i) => [v, POSITIVE[(k + 3 * i) % POSITIVE.length]!])),
  );
}

const at = (e: Expr, env: Env) => evaluateExpression(e, env);

/** Two terms: the same value everywhere it can be checked. */
export function sameTermOn(a: Expr, b: Expr, envs: readonly Env[]): Compared {
  let usable = 0;
  for (const env of envs) {
    const va = at(a, env);
    const vb = at(b, env);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    usable += 1;
    if (!close(va, vb)) return 'different';
  }
  return usable >= ENOUGH_PROBES ? 'same' : 'unsure';
}

/** left − right of a relation line (a term line is its own difference against 0). */
function difference(l: Line): (env: Env) => number {
  return (env) => at(l.left, env) - (l.right ? at(l.right, env) : 0);
}

/**
 * Two equations: the difference of the sides must be proportional, so the solutions are the
 * same. Dividing a whole equation by 2 is a legal step and must not read as a mistake.
 */
function proportional(da: (e: Env) => number, db: (e: Env) => number, envs: readonly Env[]) {
  let ratio: number | null = null;
  let usable = 0;
  for (const env of envs) {
    const va = da(env);
    const vb = db(env);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    // Both sides vanish here: this point says nothing about the factor, but it does not
    // contradict either (it is a shared root).
    if (close(va, 0) && close(vb, 0)) continue;
    // One vanishes and the other does not: a root was gained or lost. That is a real change.
    if (close(va, 0) !== close(vb, 0)) return 'different' as const;
    usable += 1;
    const r = va / vb;
    if (ratio === null) ratio = r;
    else if (!close(r, ratio)) return 'not_constant' as const;
  }
  if (usable < ENOUGH_PROBES || ratio === null) return 'unsure' as const;
  // A factor of zero would mean the second line is "0 = 0": true, but it has lost the task.
  return close(ratio, 0) ? ('different' as const) : ('same' as const);
}

/**
 * Every root of `from` that can be computed exactly — where `from` is linear in one variable
 * with the others held at a probe — must be a root of `to`. Returns how many roots were checked,
 * or 'different' at the first root `to` does not share.
 */
function rootsShared(
  from: (e: Env) => number,
  to: (e: Env) => number,
  vars: readonly string[],
  envs: readonly Env[],
): number | 'different' {
  let checked = 0;
  for (const env of envs) {
    for (const v of vars) {
      const t0 = env[v]!;
      const g = (t: number) => from({ ...env, [v]: t });
      const g0 = g(t0);
      const g1 = g(t0 + 1);
      const g2 = g(t0 + 2.5);
      if (![g0, g1, g2].every(Number.isFinite)) continue;
      const slope = g1 - g0;
      // Not linear in v here (the third point is off the line through the first two), or flat:
      // no root to compute exactly, so this direction says nothing.
      if (!close(g2 - g0, 2.5 * slope)) continue;
      const scale = Math.max(Math.abs(g0), Math.abs(g1), 1e-12);
      if (Math.abs(slope) <= 1e-9 * scale) continue;
      const root = { ...env, [v]: t0 - g0 / slope };
      const r = root[v]!;
      // Only a positive value is a point of the domain these lines are probed on.
      if (!(r > 0) || !Number.isFinite(r)) continue;
      if (Math.abs(from(root)) > 1e-9 * scale) continue;
      const h = to(root);
      if (!Number.isFinite(h)) continue;
      const toScale = Math.max(Math.abs(to(env)), Math.abs(to({ ...env, [v]: t0 + 1 })), 1e-12);
      if (Math.abs(h) > 1e-7 * toScale) return 'different';
      checked += 1;
    }
  }
  return checked;
}

function sameEquation(a: Line, b: Line): Compared {
  const da = difference(a);
  const db = difference(b);
  const several = a.vars.length >= 2;
  const envs = probeEnvs(several ? a.vars : ['x']);
  const p = proportional(da, db, envs);
  if (p === 'same' || p === 'different' || p === 'unsure') return p;
  // Not constant. With one variable that already means a root was gained or lost (#209). With
  // several, the factor may be a variable (v = s/t → v·t = s): compare the roots instead.
  if (!several) return 'different';
  const there = rootsShared(da, db, a.vars, envs);
  if (there === 'different') return 'different';
  const back = rootsShared(db, da, a.vars, envs);
  if (back === 'different') return 'different';
  return there >= ENOUGH_PROBES && back >= ENOUGH_PROBES ? 'same' : 'unsure';
}

/** The solution set of a linear inequality in one variable: a half-line. */
type HalfLine = { boundary: number; above: boolean; strict: boolean };

/** The half-line `l` describes, or null when its sides do not differ by a linear term. */
export function halfLine(l: Line): HalfLine | null {
  if (l.rel === null || l.rel === '=' || l.vars.length > 1) return null;
  const d = difference(l);
  const v = (x: number) => d({ x });
  const p0 = PROBES[0];
  const p1 = PROBES[PROBES.length - 1]!;
  const slope = (v(p1) - v(p0)) / (p1 - p0);
  const intercept = v(p0) - slope * p0;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;
  for (const p of PROBES) if (!close(v(p), slope * p + intercept)) return null;
  // Constant: always or never true — not a half-line, and nothing a step can be compared on.
  if (close(slope, 0)) return null;
  const greater = l.rel === '>' || l.rel === '≥';
  return {
    boundary: -intercept / slope,
    // a·x + b > 0 with a < 0 is x < −b/a: dividing by a negative number turns the sign.
    above: greater === slope > 0,
    strict: l.rel === '<' || l.rel === '>',
  };
}

function sameInequality(a: Line, b: Line): Compared {
  const ha = halfLine(a);
  const hb = halfLine(b);
  if (ha === null || hb === null) return 'unsure';
  return close(ha.boundary, hb.boundary) && ha.above === hb.above && ha.strict === hb.strict
    ? 'same'
    : 'different';
}

/** One line against the next: the same term, an equivalent equation or inequality, or not. */
export function sameStep(a: Line, b: Line): Compared {
  // A term turning into an equation (or back) is not a transformation this module can judge.
  if ((a.rel === null) !== (b.rel === null)) return 'unsure';
  const several = a.vars.length >= 2 || b.vars.length >= 2;
  if (several && a.vars.join() !== b.vars.join()) return 'unsure';
  // One variable each, but not the same one: "x = 2" then "y = 3" lists two values.
  if (a.named !== null && b.named !== null && a.named !== b.named) return 'unsure';
  if (a.rel === null || b.rel === null) {
    return sameTermOn(a.left, b.left, probeEnvs(several ? a.vars : ['x']));
  }
  const aEq = a.rel === '=';
  const bEq = b.rel === '=';
  if (aEq !== bEq) return 'unsure';
  return aEq ? sameEquation(a, b) : sameInequality(a, b);
}

export type PathCheck =
  /** Every step follows from the one before it. */
  | { kind: 'sound'; lines: number }
  /** The first transition that does not follow: from line `line` to line `line + 1`. */
  | { kind: 'broke'; line: number; lines: number }
  /** Not checkable in code — one line did not parse, or a step is outside what is read. */
  | { kind: 'unknown' };

/**
 * Check a written path. Fewer than two lines is not a path and is left alone; one unparseable
 * or uncomparable step makes the whole thing `unknown`, because reporting the SECOND broken
 * step while silently skipping the first would point her at the wrong line.
 */
export function checkPath(text: string): PathCheck {
  const raw = pathLines(text);
  if (raw.length < 2) return { kind: 'unknown' };
  const lines: Line[] = [];
  for (const r of raw) {
    const line = parseLine(r);
    if (!line) return { kind: 'unknown' };
    lines.push(line);
  }
  for (let i = 0; i + 1 < lines.length; i++) {
    const verdict = sameStep(lines[i]!, lines[i + 1]!);
    if (verdict === 'unsure') return { kind: 'unknown' };
    // Lines are counted the way she sees them: the first line is line 1.
    if (verdict === 'different') return { kind: 'broke', line: i + 1, lines: lines.length };
  }
  return { kind: 'sound', lines: lines.length };
}

/** The last line of a path — what the key is compared against once the path itself is sound. */
export function lastLine(text: string): string | null {
  const lines = pathLines(text);
  return lines.length >= 2 ? (lines.at(-1) ?? null) : null;
}

/**
 * The value the last line of a sound path states: "x = 2" ends in 2, and that is what the key
 * is compared against. A line without an "=" is already the value.
 */
export function lastValue(text: string): string | null {
  const line = lastLine(text);
  if (line === null) return null;
  const parts = line.split('=');
  return (parts.length === 2 ? parts[1]! : line).trim() || null;
}

// ── One answer against one key, with the same machinery (issue #227, finding 5).
//
// The same equivalence that decides whether a STEP follows also decides whether an ANSWER is the
// key's term or equation. Until now "x = -5" for a key of x = 5 and "2x+5" for 2x+6 went to the
// tutor as "not decidable by rules", although a sign and a summand that differ make a different
// value at every probe point — and code had already computed that. It is only ever asked once
// comparing the characters decided nothing (`evaluate.ts`).

/**
 * The names the expression parser owns. `x` is in RESERVED because `oneVariable` leaves it where
 * it is; here it IS the variable, so it is taken back out.
 */
const NOT_A_VARIABLE: ReadonlySet<string> = new Set([...RESERVED].filter((n) => n !== 'x'));

/**
 * The variables a text uses, AS WRITTEN: `X` and `x` are not the same variable, so a key of
 * `X^2` is not answered by `x^2` (grading truth table C-6). Null when a name is longer than one
 * letter. Empty for a variable-free text — two variable-free numbers are for the numeric rules,
 * which own the decimal separators and the tolerances this module knows nothing about ("1.000"
 * is not 1000 here).
 */
function variablesIn(src: string): string[] | null {
  const names = new Set(
    (src.match(/[A-Za-z]+/g) ?? []).filter((n) => !NOT_A_VARIABLE.has(n.toLowerCase())),
  );
  if ([...names].some((n) => n.length !== 1)) return null;
  return [...names].sort();
}

/**
 * Algebra has structure: an operator, a relation, brackets. "1250 m" has none — it is a measured
 * number whose unit happens to be a single letter, and the numeric rules own it with its unit
 * (grading truth table H-4). The same gate keeps a single chemical formula out ("O2" is not 2·x;
 * `chemistry.ts` counts those).
 */
const STRUCTURE = /[-+*/^=<>≤≥():·]/;

/**
 * A key and an answer read as algebra: the same term or an equivalent equation or inequality,
 * certainly a different one, or null when this module cannot tell (a line that does not parse,
 * different letters, anything without algebraic structure — all of which stay the tutor's).
 * Both sides must carry the SAME variables and both must show structure: that is what makes
 * this algebra rather than two numbers or two measurements.
 */
export function sameAlgebra(
  key: string,
  answer: string,
  /**
   * False only where something else already marks the text as a term: a function label in
   * front of it ("f'(x) = 6x", `form.ts`) says it is a function of x, not a measured 6 x.
   */
  opts: { structure?: boolean } = {},
): 'same' | 'different' | null {
  const k = plainMath(key).trim();
  const a = plainMath(answer).trim();
  if (opts.structure !== false && (!STRUCTURE.test(k) || !STRUCTURE.test(a))) return null;
  const kv = variablesIn(k);
  const av = variablesIn(a);
  if (kv === null || av === null || kv.length === 0 || kv.join() !== av.join()) return null;
  const kl = parseLine(k);
  const al = parseLine(a);
  if (kl === null || al === null) return null;
  const verdict = sameStep(kl, al);
  return verdict === 'unsure' ? null : verdict;
}

/**
 * `x = 5` → `5`: the value a key states for its variable, but only when its left side is
 * nothing but that variable. `2x = 10` is deliberately not read — its right side is not the
 * answer to the question, and a learner's "10" for it would be wrong, not right. A right side
 * with a letter in it (`x = 2y`, `a = 12 cm`) states no bare value and gives null: the unit
 * belongs to the numeric rules, not here.
 */
export function solvedValue(key: string): string | null {
  const m = /^\s*([A-Za-z])\s*=\s*(\S.*)$/.exec(plainMath(key));
  if (m === null) return null;
  const value = (m[2] ?? '').trim();
  return /[A-Za-z]/.test(value) ? null : value;
}
