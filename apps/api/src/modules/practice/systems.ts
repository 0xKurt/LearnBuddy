// Answers with several values, and systems of equations (issues #263 and #227 A7, B4).
//
// "x = 2; y = 3" for a key of "x = 2, y = 3", "y = 3, x = 2", "(2|3)", "L = {2; 5}": every
// one of these is several numbers, and until now each went to the tutor as one string. They
// are compared value by value here — by the numeric rules, so the decimal separators and the
// key's own rounding decide exactly what they decide for a single number (D-1).
//
// The separators are read structurally and never guessed:
//   - a list of named values ("x = 2, y = 3"): split at ";" or at a "," that is followed by the
//     next "name =". "x = 2,5" stays one value;
//   - a point "(2|3)" or "S(2|3)": the coordinates in order;
//   - a list of numbers only with ";" — "2, 5" is also how German writes 2,5, and a set is
//     written "{2; 5}" for exactly that reason. A list in braces (or after "L =") is a SET and its
//     order does not count; a bare list may be an order the question asked for, so a reordered
//     one is the same values in another form, for the tutor.
//
// The other direction (Regel 0, generated content): a system printed in the question is solved
// here, and a key that does not solve it — or a system without exactly one solution behind a
// key that claims one — never reaches her (`systemContradicts`). The same for a single equation
// whose key does not satisfy it (`equationContradicts`, #227 B4).

import {
  compareNumbers,
  evaluateExpression,
  parseCanonicalKey,
  parseNumericInput,
  plainMath,
  sameWrittenForm,
} from '@learnbuddy/shared-math';

import { mathRunsOf } from './form.js';
import { parseLine, solvedValue, type Line } from './steps.js';

type Verdict = 'correct' | 'other_form' | 'incorrect';

/** One value of hers against one value of the key, by the numeric rules. */
function oneValue(key: string, given: string): 'same' | 'other_form' | 'different' | null {
  const g = parseNumericInput(given);
  const k = parseCanonicalKey(key);
  const c = compareNumbers(g, k);
  if (c === 'unknown') return null;
  if (c === 'different') return 'different';
  return sameWrittenForm(g, k) ? 'same' : 'other_form';
}

/** All values compared: any certainly different makes it wrong; one unreadable leaves it open. */
function combine(
  results: ReadonlyArray<'same' | 'other_form' | 'different' | null>,
): Verdict | null {
  if (results.includes('different')) return 'incorrect';
  if (results.includes(null)) return null;
  return results.includes('other_form') ? 'other_form' : 'correct';
}

// ── named values: "x = 2, y = 3" ───────────────────────────────────────────────────────────

/** "x = 2, y = 3" / "x=2; y=3" / one per line → {x: "2", y: "3"}; null for anything else. */
export function assignmentsOf(text: string): Map<string, string> | null {
  // One value per line is a list too; `plainMath` would fold the line breaks into spaces.
  const parts = text
    .split(/\r?\n/)
    .map((line) => plainMath(line))
    .join(';')
    .replace(/^\s*L\s*=\s*\{(.*)\}\s*$/, '$1')
    .split(/\s*;\s*|\s*,\s*(?=[A-Za-z]\s*=)/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length < 2) return null;
  const out = new Map<string, string>();
  for (const p of parts) {
    const m = /^([A-Za-z])\s*=\s*([^=<>]+)$/.exec(p);
    if (m === null || out.has(m[1]!)) return null;
    // A value, not a term: "y = 2x" is an equation still to be solved.
    if (/[A-Za-z]/.test(m[2]!)) return null;
    out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

/** Her named values against the key's: the same variables, each value by the numeric rules. */
export function sameAssignments(key: string, answer: string): Verdict | null {
  const k = assignmentsOf(key);
  const a = assignmentsOf(answer);
  if (k === null || a === null) return null;
  if (k.size !== a.size || [...k.keys()].some((v) => !a.has(v))) return null;
  return combine([...k].map(([v, value]) => oneValue(value, a.get(v)!)));
}

// ── a point: "(2|3)" ───────────────────────────────────────────────────────────────────────

function pointOf(text: string): string[] | null {
  const m = /^\s*(?:[A-Z]\s*)?\(([^()]*)\)\s*$/.exec(plainMath(text));
  if (m === null || !m[1]!.includes('|')) return null;
  const coords = m[1]!.split('|').map((c) => c.trim());
  return coords.length >= 2 && coords.every((c) => c !== '') ? coords : null;
}

/** Her point against the key's, coordinate by coordinate in order. */
export function samePoint(key: string, answer: string): Verdict | null {
  const k = pointOf(key);
  const a = pointOf(answer);
  if (k === null || a === null || k.length !== a.length) return null;
  return combine(k.map((c, i) => oneValue(c, a[i]!)));
}

// ── a list of numbers: "2; 5", "L = {2; 5}" ─────────────────────────────────────────────────

function listOf(text: string): { set: boolean; items: string[] } | null {
  const plain = plainMath(text).trim();
  const braced = /^(?:L\s*=\s*)?\{(.*)\}$/.exec(plain);
  const body = braced ? braced[1]! : plain;
  if (!body.includes(';')) return null;
  const items = body.split(';').map((p) => p.trim());
  if (items.length < 2 || items.some((i) => i === '' || parseNumericInput(i).value === null)) {
    return null;
  }
  return { set: braced !== null, items };
}

/**
 * Her list against the key's. A value that is in no place of the key is wrong; the same values
 * in another order are right for a set and another form for a list; a missing value leaves the
 * question open (what is there may be right, and the tutor says what is missing).
 */
export function sameList(key: string, answer: string): Verdict | null {
  const k = listOf(key);
  const a = listOf(answer);
  if (k === null || a === null) return null;
  const inOrder =
    k.items.length === a.items.length
      ? combine(k.items.map((c, i) => oneValue(c, a.items[i]!)))
      : null;
  if (inOrder === 'correct' || inOrder === 'other_form') return inOrder;
  // Matched as a multiset: each of hers to one unused key value with the same value.
  const unused = [...k.items];
  let otherForm = false;
  for (const given of a.items) {
    const verdicts = unused.map((c) => oneValue(c, given));
    if (verdicts.includes(null)) return null;
    const at = verdicts.findIndex((v) => v === 'same' || v === 'other_form');
    if (at < 0) return 'incorrect';
    if (verdicts[at] === 'other_form') otherForm = true;
    unused.splice(at, 1);
  }
  if (unused.length > 0) return null;
  // Every value is there, in another order: a set does not have one.
  return k.set && a.set && !otherForm ? 'correct' : 'other_form';
}

// ── the key against the question ───────────────────────────────────────────────────────────

/** Half a unit of the key's last written decimal; exact (up to float noise) otherwise. */
function within(keyText: string, value: number): boolean | null {
  const k = parseCanonicalKey(keyText);
  if (k.value === null || k.unit !== null) return null;
  const tolerance =
    k.form === 'decimal' && k.decimals > 0
      ? 0.5 * 10 ** -k.decimals * (1 + 1e-9)
      : 1e-9 * Math.max(1, Math.abs(k.value));
  return Math.abs(value - k.value) <= tolerance;
}

/** The equations a prompt prints in its maths runs, with the variables they use. */
function equationsIn(prompt: string): Line[] {
  return (
    mathRunsOf(prompt)
      // Several equations in one run are separated by ";" or ", " (a decimal comma has no space).
      .flatMap((run) => run.split(/\s*;\s*|\s*,\s+/))
      // A Roman numeral naming the equation ("I: x + y = 5") is a label, not a variable.
      .map((r) => r.replace(/^\s*(?:I{1,3}|IV)\s*[:.)]\s*/, ''))
      .map((r) => parseLine(r))
      .filter((l): l is Line => l !== null && l.rel === '=')
  );
}

/** The variables of a line as written (a single variable was renamed to x by `parseLine`). */
function namesOf(l: Line): string[] {
  return l.named !== null ? [l.named] : [...l.vars];
}

/**
 * The coefficients of a linear equation in `vars`, or null when it is not linear: left − right
 * is evaluated at the origin and at each unit vector, and checked at two more points.
 */
function linear(l: Line, vars: readonly string[]): { a: number[]; b: number } | null {
  const renamed = l.named !== null;
  const env = (values: number[]): Record<string, number> =>
    renamed ? { x: values[0]! } : Object.fromEntries(vars.map((v, i) => [v, values[i]!]));
  const d = (values: number[]) =>
    evaluateExpression(l.left, env(values)) - evaluateExpression(l.right!, env(values));
  const zero = vars.map(() => 0);
  const b = d(zero);
  const a = vars.map((_, i) => d(zero.map((_, j) => (i === j ? 1 : 0))) - b);
  if (![b, ...a].every(Number.isFinite)) return null;
  for (const probe of [
    vars.map((_, i) => 1.625 + i * 0.75),
    vars.map((_, i) => -2.375 + i * 1.25),
  ]) {
    const expected = b + a.reduce((s, ai, i) => s + ai * probe[i]!, 0);
    const got = d(probe);
    if (!Number.isFinite(got)) return null;
    if (Math.abs(got - expected) > 1e-9 * Math.max(1, Math.abs(got), Math.abs(expected)))
      return null;
  }
  return { a, b };
}

/** Gaussian elimination with partial pivoting; null when the system has no single solution. */
function solve(rows: { a: number[]; b: number }[]): number[] | null {
  const n = rows.length;
  const m = rows.map((r) => [...r.a, -r.b]);
  const scale = Math.max(1, ...m.flat().map(Math.abs));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) <= 1e-9 * scale) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c] = m[r]![c]! - f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * True only when the question's own system PROVES the key wrong: the prompt prints exactly as
 * many linear equations as the key names variables, all in those variables, and either they
 * have no single solution (the key claims one) or their solution is not the key's. Anything
 * else — a word problem, a nonlinear system, one equation too many — is no proof, and says
 * false: this never says "right", only "certainly not".
 */
export function systemContradicts(prompt: string, key: string): boolean {
  const values = assignmentsOf(key);
  if (values === null) return false;
  const vars = [...values.keys()].sort();
  const equations = equationsIn(prompt).filter((l) => namesOf(l).every((v) => vars.includes(v)));
  if (equations.length !== vars.length) return false;
  if (!equations.some((l) => namesOf(l).length === vars.length)) return false;
  const rows: { a: number[]; b: number }[] = [];
  for (const l of equations) {
    const names = namesOf(l);
    const row = linear(l, l.named !== null ? names : vars);
    if (row === null) return false;
    // A single-variable line was renamed to x: put its one coefficient in its own column.
    rows.push(
      l.named !== null ? { a: vars.map((v) => (v === l.named ? row.a[0]! : 0)), b: row.b } : row,
    );
  }
  const solution = solve(rows);
  if (solution === null) return true;
  return vars.some((v, i) => within(values.get(v)!, solution[i]!) === false);
}

/**
 * True only when the question prints exactly one equation in one variable and the key's value
 * for that variable does not satisfy it (#227 B4): "Löse $2x + 3 = 7$" with a key of x = 3. A
 * rounded key (x ≈ 1,41 for x² = 2) satisfies it when the sides cross within the key's last
 * decimal. A key that is one root of several is no contradiction — whether all were asked for
 * is the question's business, not arithmetic.
 */
export function equationContradicts(prompt: string, key: string): boolean {
  const named = /^\s*([A-Za-z])\s*=/.exec(plainMath(key));
  const value = solvedValue(key);
  if (named === null || value === null) return false;
  const equations = equationsIn(prompt);
  if (equations.length !== 1) return false;
  const l = equations[0]!;
  if (l.named !== named[1]!.toLowerCase()) return false;
  const k = parseCanonicalKey(value);
  if (k.value === null || k.unit !== null) return false;
  const d = (x: number) => evaluateExpression(l.left, { x }) - evaluateExpression(l.right!, { x });
  const at = d(k.value);
  if (!Number.isFinite(at)) return false;
  const scale = Math.max(1, Math.abs(evaluateExpression(l.left, { x: k.value })));
  if (Math.abs(at) <= 1e-9 * scale) return false;
  const half =
    k.form === 'decimal' && k.decimals > 0
      ? 0.5 * 10 ** -k.decimals
      : 1e-9 * Math.max(1, Math.abs(k.value));
  const lo = d(k.value - half);
  const hi = d(k.value + half);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
  return Math.sign(lo) === Math.sign(hi) && lo !== 0 && hi !== 0;
}
