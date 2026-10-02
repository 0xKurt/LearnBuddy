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
//     (2x+3=7 → 2x=4 keeps the difference; 2x=4 → x=2 halves it, and both have the same root).
// The probe points are FIXED, never random: a judgement about a child's work must not depend on
// a dice roll, and two runs must agree (CLAUDE.md rule 7's spirit — one clock, no chance).
//
// What it deliberately refuses, rather than guessing (first cut, per the issue):
//   - more than one variable, inequalities, case distinctions, proofs;
//   - any line it cannot parse completely.
// All of those come back `unknown` and go to the model, which is where they belonged anyway.

import { compileExpression, type CompiledFunction, plainMath } from '@learnbuddy/shared-math';

/** Known names the parser already owns; anything else alphabetic is the variable. */
const RESERVED = new Set(['sqrt', 'abs', 'sin', 'cos', 'tan', 'ln', 'log', 'exp', 'pi', 'e', 'x']);

/**
 * Fixed, non-integer probe points. Non-integer on purpose: at whole numbers two different
 * expressions agree by accident far more often (x² and 2x both give 4 at x=2). Spread over
 * negatives and positives so a sign error cannot hide.
 */
const PROBES = [-3.25, -1.5, -0.375, 0.75, 1.625, 2.5, 4.125, 6.75] as const;

/** At least this many points must be usable before any verdict is given. */
const ENOUGH_PROBES = 3;

function close(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * The one variable a line uses, renamed to the `x` the parser knows — or null when there is
 * more than one, which this module does not handle.
 */
function oneVariable(src: string): string | null {
  const names = new Set((src.toLowerCase().match(/[a-z]+/g) ?? []).filter((n) => !RESERVED.has(n)));
  if (names.size > 1) return null;
  const name = [...names][0];
  if (name === undefined) return src; // a pure number line is fine
  if (name.length > 1) return null; // a word, not a variable: not ours
  return src.replace(new RegExp(name, 'gi'), 'x');
}

type Line = { raw: string; left: CompiledFunction; right: CompiledFunction | null };

/**
 * One line: a term, or an equation with exactly one "=". Returns null for anything that does
 * not compile completely — a line half understood is worse than a line not understood.
 */
function parseLine(raw: string): Line | null {
  const renamed = oneVariable(raw);
  if (renamed === null) return null;
  const parts = renamed.split(/=/);
  if (parts.length === 1) {
    const left = compileExpression(parts[0]!.trim());
    return left ? { raw, left, right: null } : null;
  }
  if (parts.length !== 2) return null;
  const left = compileExpression(parts[0]!.trim());
  const right = compileExpression(parts[1]!.trim());
  return left && right ? { raw, left, right } : null;
}

/** The lines of a written path, in order; empty lines and bullet markers dropped. */
export function pathLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) =>
      l
        // A learner numbers or bullets her lines; the marker is not part of the maths.
        .replace(/^\s*(?:\d+[.)]|[-–•*>])\s*/, '')
        .replace(/[$]/g, '')
        .trim(),
    )
    .filter((l) => l !== '');
}

type Compared = 'same' | 'different' | 'unsure';

/** Two terms: the same value everywhere it can be checked. */
function sameTerm(a: CompiledFunction, b: CompiledFunction): Compared {
  let usable = 0;
  for (const p of PROBES) {
    const va = a(p);
    const vb = b(p);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    usable += 1;
    if (!close(va, vb)) return 'different';
  }
  return usable >= ENOUGH_PROBES ? 'same' : 'unsure';
}

/**
 * Two equations: the difference of the sides must be proportional, so the solutions are the
 * same. Dividing a whole equation by 2 is a legal step and must not read as a mistake.
 */
function sameEquation(a: Line, b: Line): Compared {
  const da = (p: number) => a.left(p) - (a.right ? a.right(p) : 0);
  const db = (p: number) => b.left(p) - (b.right ? b.right(p) : 0);
  let ratio: number | null = null;
  let usable = 0;
  for (const p of PROBES) {
    const va = da(p);
    const vb = db(p);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    // Both sides vanish here: this point says nothing about the factor, but it does not
    // contradict either (it is a shared root).
    if (close(va, 0) && close(vb, 0)) continue;
    // One vanishes and the other does not: a root was gained or lost. That is a real change.
    if (close(va, 0) !== close(vb, 0)) return 'different';
    usable += 1;
    const r = va / vb;
    if (ratio === null) ratio = r;
    else if (!close(r, ratio)) return 'different';
  }
  if (usable < ENOUGH_PROBES || ratio === null) return 'unsure';
  // A factor of zero would mean the second line is "0 = 0": true, but it has lost the task.
  return close(ratio, 0) ? 'different' : 'same';
}

function sameStep(a: Line, b: Line): Compared {
  const aIsEquation = a.right !== null;
  const bIsEquation = b.right !== null;
  // A term turning into an equation (or back) is not a transformation this module can judge.
  if (aIsEquation !== bIsEquation) return 'unsure';
  return aIsEquation ? sameEquation(a, b) : sameTerm(a.left, b.left);
}

export type PathCheck =
  /** Every step follows from the one before it. */
  | { kind: 'sound'; lines: number }
  /** The first transition that does not follow: from line `line` to line `line + 1`. */
  | { kind: 'broke'; line: number; lines: number }
  /** Not checkable in code — one line did not parse, or a step is outside the first cut. */
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
 * The one variable a text uses, AS WRITTEN: `X` and `x` are not the same variable, so a key of
 * `X^2` is not answered by `x^2` (grading truth table C-6). Null when the text uses no variable
 * or more than one — two variable-free numbers are for the numeric rules, which own the decimal
 * separators and the tolerances this module knows nothing about ("1.000" is not 1000 here).
 */
function variableOf(src: string): string | null {
  const names = new Set(
    (src.match(/[A-Za-z]+/g) ?? []).filter((n) => !NOT_A_VARIABLE.has(n.toLowerCase())),
  );
  if (names.size !== 1) return null;
  const name = [...names][0] ?? '';
  return name.length === 1 ? name : null;
}

/**
 * Algebra has structure: an operator, a relation, brackets. "1250 m" has none — it is a measured
 * number whose unit happens to be a single letter, and the numeric rules own it with its unit
 * (grading truth table H-4). The same gate keeps a single chemical formula out ("O2" is not 2·x;
 * `chemistry.ts` counts those).
 */
const STRUCTURE = /[-+*/^=():·]/;

/**
 * A key and an answer read as algebra: the same term or an equivalent equation, certainly a
 * different one, or null when this module cannot tell (a line that does not parse, an
 * inequality, two different letters, anything without algebraic structure — all of which stay
 * the tutor's). Both sides must carry the SAME single variable and both must show structure:
 * that is what makes this algebra rather than two numbers or two measurements.
 */
export function sameAlgebra(key: string, answer: string): 'same' | 'different' | null {
  const k = plainMath(key).trim();
  const a = plainMath(answer).trim();
  if (!STRUCTURE.test(k) || !STRUCTURE.test(a)) return null;
  const variable = variableOf(k);
  if (variable === null || variable !== variableOf(a)) return null;
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
