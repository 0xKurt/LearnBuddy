// The FORM of a term, read off its syntax tree (issue #235).
//
// `steps.ts` decides whether two terms have the same VALUE. That alone was handed to the tutor
// as "the value is right, the form is your call" (issue #227, finding 1) — for every answer that
// differed from the key in any way, including "6+2x" for 2x+6, which differs in nothing but the
// order of its summands. Three things here are mechanical and therefore code's (Regel 0):
//
//   1. **Same up to order** — the same summands and factors, in another order, with a power of
//      a bracket written out ((x+1)² and (x+1)(x+1)). That is the key's form, so it is right,
//      and no model is asked (`orderFree`).
//   2. **The task typed back** — "Faktorisiere x²+2x+1", answered "x²+2x+1": the value is right
//      because nothing was done. Code sees that the answer IS the task's own term while the key
//      is not; that is a near miss with its own gentle reply, never "right" (`typedBack`).
//   3. **The shape** — a product of brackets (factored) or a sum (expanded). Code does not
//      decide whether the question asked for a shape: telling "Faktorisiere" from "Vereinfache"
//      is reading language, and a word list is what CLAUDE.md rule 3 forbids. It tells the
//      tutor what the two shapes ARE (`shapeOf`), so the tutor decides about the question and
//      not about the algebra.
//
// Also here, because it is the same kind of reading: a function label (`f(x) =`, `f'(x) =`,
// `F(x) =`, `y =`) is notation, not value — and an antiderivative written with its constant
// (`+ C`) is decided up to that constant: the difference to the key must be the same number at
// every probe point. Without its own `+ C` she wrote ONE antiderivative, not all of them; the
// value is right, and whether the constant is the question is again the tutor's call.

import {
  evaluateExpression,
  type Expr,
  parseExpression,
  plainMath,
  variablesOf,
} from '@learnbuddy/shared-math';

import { close, type Compared, type Line, parseLine, probeEnvs, sameAlgebra } from './steps.js';

/** A number printed the same however it was written: 0,5 and 0.5. */
function num(v: number): string {
  return String(v);
}

type Signed = { neg: boolean; e: Expr };

function isSum(e: Expr): boolean {
  return e.k === 'add' || e.k === 'sub';
}

/** The summands of a sum, with their signs; a minus in front of a SUM stays a bracket. */
function summands(e: Expr, neg = false, out: Signed[] = []): Signed[] {
  if (e.k === 'add') {
    summands(e.a, neg, out);
    summands(e.b, neg, out);
  } else if (e.k === 'sub') {
    summands(e.a, neg, out);
    // "a − (b + c)" keeps its bracket: removing it is a step, and the step is the form.
    if (isSum(e.b)) out.push({ neg: !neg, e: e.b });
    else summands(e.b, !neg, out);
  } else if (e.k === 'neg') {
    // A minus in front of a bracket stays a bracket with a minus: "−(x − 3)" is not "3 − x".
    if (isSum(e.a)) out.push({ neg: !neg, e: e.a });
    else summands(e.a, !neg, out);
  } else if (e.k === 'mul') {
    // "-4x" is read as (−4)·x: the minus of a factor is the sign of the summand.
    let flip = false;
    const plain = factors(e).map((f) => {
      if (f.k === 'neg' && !isSum(f.a)) {
        flip = !flip;
        return f.a;
      }
      return f;
    });
    out.push({ neg: flip ? !neg : neg, e: plain.reduce((a, b) => ({ k: 'mul', a, b }) as Expr) });
  } else {
    out.push({ neg, e });
  }
  return out;
}

/** A power of a bracket with a small whole exponent: (x+1)² is the factor (x+1) twice. */
function repeats(e: Expr): number {
  if (e.k !== 'pow' || !isSum(e.a) || e.b.k !== 'num' || !e.b.integer) return 0;
  return e.b.v >= 2 && e.b.v <= 6 ? e.b.v : 0;
}

function factors(e: Expr, out: Expr[] = []): Expr[] {
  if (e.k === 'mul') {
    factors(e.a, out);
    factors(e.b, out);
  } else if (repeats(e) > 0) {
    for (let i = 0; i < repeats(e); i++) out.push((e as { a: Expr }).a);
  } else {
    out.push(e);
  }
  return out;
}

function wrapped(e: Expr): string {
  const c = orderFree(e);
  return e.k === 'num' || e.k === 'const' || e.k === 'var' || e.k === 'fn' ? c : `(${c})`;
}

/**
 * A canonical text for a term that forgets only the ORDER of summands and factors (and how a
 * power of a bracket is written). Everything else stays: 2(x+3) is not 2x+6, ½x is not 0,5x,
 * x·x is not x². Two terms with the same text here are the same answer in the same form.
 */
export function orderFree(e: Expr): string {
  switch (e.k) {
    case 'num':
      return num(e.v);
    case 'const':
    case 'var':
      return e.name;
    case 'fn':
      return `${e.name}(${orderFree(e.arg)})`;
    case 'add':
    case 'sub':
    case 'neg':
    case 'mul': {
      // Every sign is the sign of a summand: −4x, (−4)·x and −(4x) are one term.
      const terms = summands(e);
      const only = terms[0];
      if (terms.length === 1 && only !== undefined && !only.neg && only.e.k === 'mul') {
        return factors(only.e).map(wrapped).sort().join('*');
      }
      return terms
        .map((t) => `${t.neg ? '-' : '+'}${isSum(t.e) ? `(${orderFree(t.e)})` : orderFree(t.e)}`)
        .sort()
        .join('');
    }
    case 'pow':
      if (repeats(e) > 0) return factors(e).map(wrapped).sort().join('*');
      return `${wrapped(e.a)}^${wrapped(e.b)}`;
    case 'div':
      return `${wrapped(e.a)}/${wrapped(e.b)}`;
  }
}

/** A relation line in a canonical text: sides of "=" unordered, ">" turned into "<". */
function lineText(l: Line): string {
  const left = orderFree(l.left);
  if (l.right === null || l.rel === null) return left;
  const right = orderFree(l.right);
  switch (l.rel) {
    case '=':
      return [left, right].sort().join('=');
    case '<':
      return `${left}<${right}`;
    case '>':
      return `${right}<${left}`;
    case '≤':
      return `${left}≤${right}`;
    case '≥':
      return `${right}≤${left}`;
  }
}

/**
 * A line's order-free text, or null when it does not parse. `parseLine` renames a single
 * variable to x; every caller compares two texts whose variables were already checked to be the
 * same letters (`sameAlgebra`), or the task's own term, where the renaming is what is wanted.
 */
export function orderFreeLine(text: string): string | null {
  const l = parseLine(text);
  return l === null ? null : lineText(l);
}

export type Shape = 'product' | 'sum' | 'other';

/**
 * Factored (a product with a bracket of several summands in it), expanded (a sum), or neither
 * (a single monomial, a quotient, a function). A minus in front changes nothing.
 */
export function shapeOf(e: Expr): Shape {
  const inner = e.k === 'neg' ? e.a : e;
  if (isSum(inner)) return 'sum';
  if (inner.k === 'mul' || repeats(inner) > 0) {
    return factors(inner).some(isSum) ? 'product' : 'other';
  }
  return 'other';
}

// ── function labels ────────────────────────────────────────────────────────────────────────

type Labelled = { label: string | null; arg: string | null; body: string };

/**
 * "f(x) = 3x²", "f'(x) = 6x", "F(x) = x³ + C", "y = 2x + 3": the label in front is notation.
 * Returned with the label normalised (′ → '), or with `label: null` when there is none.
 */
export function labelled(text: string): Labelled {
  const s = plainMath(text).replace(/[′’]/g, "'").trim();
  const fn = /^([A-Za-z])('{0,3})\s*\(\s*([A-Za-z])\s*\)\s*=\s*(\S.*)$/.exec(s);
  if (fn) return { label: `${fn[1]}${fn[2]}`, arg: fn[3]!, body: fn[4]!.trim() };
  // "y = …" is a function equation only when the right side uses one other variable; "y = 3"
  // is a value, and "y = 2y" is an equation in y.
  const y = /^y\s*=\s*(\S.*)$/.exec(s);
  if (y) {
    const body = y[1]!.trim();
    const tree = parseExpression(body, 'letters');
    const vars = tree ? variablesOf(tree) : [];
    if (vars.length === 1 && vars[0] !== 'y') return { label: 'y', arg: vars[0]!, body };
  }
  return { label: null, arg: null, body: s };
}

/** Two labels name the same thing: the same letter and primes, or y and an unprimed f(x). */
function compatible(a: Labelled, b: Labelled): boolean {
  if (a.label === null || b.label === null) return true;
  if (a.arg !== b.arg) return false;
  if (a.label === b.label) return true;
  const plainLower = (l: string) => /^[a-z]$/.test(l);
  return (a.label === 'y' && plainLower(b.label)) || (b.label === 'y' && plainLower(a.label));
}

// ── an antiderivative, up to its constant ──────────────────────────────────────────────────

/** "x³/3 + C" → the term without its lone constant summand, and that the constant was there. */
function withoutConstant(body: string): { term: Expr; constant: boolean } | null {
  const tree = parseExpression(body, 'letters');
  if (tree === null) return null;
  const terms = summands(tree);
  const isC = (t: Signed) => !t.neg && t.e.k === 'var' && (t.e.name === 'C' || t.e.name === 'c');
  const lone = terms.filter(isC);
  if (lone.length !== 1) return { term: tree, constant: false };
  const rest = terms.filter((t) => !isC(t));
  if (rest.length === 0) return null;
  // The letter may appear only as that summand: "Cx + C" is not a constant of integration.
  const term = rest
    .map((t) => (t.neg ? ({ k: 'neg', a: t.e } as Expr) : t.e))
    .reduce((a, b) => ({ k: 'add', a, b }) as Expr);
  const name = (lone[0]!.e as { name: string }).name;
  if (variablesOf(term).includes(name)) return null;
  return { term, constant: true };
}

/**
 * Her antiderivative against the key's, which carries `+ C`: the same family when the
 * difference is one constant at every probe point, certainly another function when it is not.
 */
function upToConstant(key: Expr, answer: Expr, variable: string): Compared {
  const envs = probeEnvs([variable]);
  let first: number | null = null;
  let usable = 0;
  for (const env of envs) {
    const d = evaluateExpression(answer, env) - evaluateExpression(key, env);
    if (!Number.isFinite(d)) continue;
    usable += 1;
    if (first === null) first = d;
    else if (!close(d, first)) return 'different';
  }
  return usable >= 3 ? 'same' : 'unsure';
}

// ── one answer against one key ─────────────────────────────────────────────────────────────

/** What code can say about the form beside the value, for the tutor. */
export type FormNote =
  | { kind: 'shape'; key: Shape; answer: Shape }
  | { kind: 'constant_missing' }
  | { kind: 'not_solved_for'; variable: string };

export type AlgebraJudgement =
  /** The same value; `sameForm` when only the order of summands or factors differs. */
  { verdict: 'same'; sameForm: boolean; note: FormNote | null } | { verdict: 'different' };

/** The variable a line is solved for: "v = s/t" → v; null when its left side is more. */
function solvedFor(text: string): string | null {
  const m = /^\s*([A-Za-z])\s*=([^=<>]+)$/.exec(plainMath(text));
  if (m === null) return null;
  const right = parseExpression(m[2]!.trim(), 'letters');
  return right !== null && !variablesOf(right).includes(m[1]!) ? m[1]! : null;
}

function noteFor(key: string, answer: string): FormNote | null {
  const k = parseLine(key);
  const a = parseLine(answer);
  if (k === null || a === null) return null;
  if (k.rel === null && a.rel === null) {
    const ks = shapeOf(k.left);
    const as = shapeOf(a.left);
    return ks !== as && (ks === 'product' || as === 'product')
      ? { kind: 'shape', key: ks, answer: as }
      : null;
  }
  // A key solved for one variable ("v = s/t"), an answer that is not solved for it.
  const v = solvedFor(key);
  if (v !== null && k.vars.length >= 2 && solvedFor(answer) !== v) {
    return { kind: 'not_solved_for', variable: v };
  }
  return null;
}

/**
 * Her answer against one key as algebra — the value through `steps.ts`, the form from the tree.
 * Null wherever `steps.ts` would say nothing, and where a label names another function
 * (g(x) for f(x), f'(x) for f(x)).
 */
export function judgeAlgebra(key: string, answer: string): AlgebraJudgement | null {
  const k = labelled(key);
  const a = labelled(answer);
  if (!compatible(k, a)) return null;
  const labels = k.label !== null || a.label !== null;

  // An antiderivative written with its constant: one variable besides the C, in both.
  const kc = labels || /\bC\b/.test(k.body) ? withoutConstant(k.body) : null;
  const vars = kc?.constant ? variablesOf(kc.term) : [];
  if (kc?.constant && vars.length === 1) {
    const ac = withoutConstant(a.body);
    if (ac === null || variablesOf(ac.term).join() !== vars.join()) return null;
    const c = upToConstant(kc.term, ac.term, vars[0]!);
    if (c === 'unsure') return null;
    if (c === 'different') return { verdict: 'different' };
    if (!ac.constant)
      return { verdict: 'same', sameForm: false, note: { kind: 'constant_missing' } };
    const sameForm = orderFree(kc.term) === orderFree(ac.term);
    return { verdict: 'same', sameForm, note: null };
  }

  // A label makes the body a function term even without an operator ("f'(x) = 6x"), so the
  // structure gate of `sameAlgebra` is satisfied by the label itself.
  const verdict = labels
    ? sameAlgebra(k.body, a.body, { structure: false })
    : sameAlgebra(key, answer);
  if (verdict === null) return null;
  if (verdict === 'different') return { verdict: 'different' };
  const kt = orderFreeLine(labels ? k.body : key);
  const at = orderFreeLine(labels ? a.body : answer);
  const sameForm = kt !== null && kt === at;
  return {
    verdict: 'same',
    sameForm,
    note: sameForm ? null : noteFor(labels ? k.body : key, labels ? a.body : answer),
  };
}

// ── the task typed back ────────────────────────────────────────────────────────────────────

/** A token that is a word: two or more letters that are not a function name. */
const WORD = /^[\p{L}]{2,}[.,;:!?]*$/u;
const FUNCTION_NAMES = /^(?:sqrt|abs|sin|cos|tan|ln|log|exp|pi)$/;

/**
 * The maths a prompt states: its $…$ runs, or — in a prompt written without dollar signs — the
 * runs of tokens between words. Structure only, nothing about what the words say.
 */
export function mathRunsOf(prompt: string): string[] {
  const dollars = [...prompt.matchAll(/\$([^$]+)\$/g)].map((m) => m[1]!.trim());
  if (dollars.length > 0) return dollars;
  const runs: string[] = [];
  let current: string[] = [];
  for (const token of prompt.split(/\s+/)) {
    const bare = token.replace(/[.,;:!?]+$/, '');
    if (token === '' || (WORD.test(token) && !FUNCTION_NAMES.test(bare.toLowerCase()))) {
      if (current.length) runs.push(current.join(' '));
      current = [];
    } else {
      current.push(bare);
    }
  }
  if (current.length) runs.push(current.join(' '));
  return runs.map((r) => r.replace(/[.,;:!?]+$/, '').trim()).filter((r) => r !== '');
}

/**
 * The answer is the term or equation the task itself states, in the same form, while the key is
 * not: she wrote the task back. Its value is the key's because nothing was done to it.
 */
export function typedBack(prompt: string, key: string, answer: string): boolean {
  const a = orderFreeLine(answer);
  const k = orderFreeLine(labelled(key).body);
  if (a === null) return false;
  for (const run of mathRunsOf(prompt)) {
    const r = orderFreeLine(labelled(run).body);
    if (r !== null && r === a && r !== k) return true;
  }
  return false;
}
