// Does the answer key agree with the question it belongs to (issue #157)?
//
// The item validation checks shape, consistency, language and whether the solution is given
// away in the question — none of which says the generated key is RIGHT. The rule check then
// compares her answer against exactly that key and says "falsch" with full authority. The
// external audit of 30.09. put a key of `8` on `6 + 4` and watched the correct answer `10`
// be rejected: a sure-sounding judgement standing in for an unchecked source, and a child
// left to argue with it.
//
// Where arithmetic makes it decidable, it is decided here — before the question is ever
// asked. That is a small set on purpose: a question whose prompt is nothing but a constant
// expression, or one the model marked inside its sentence (`computes`, #227 finding 4); a
// system or a single equation the question prints in its maths, solved and compared with the
// key (#263, #227 B4); a derivative against the function the question
// defines (#235); a reaction whose key does not balance (#227 B6, #263); a number key whose
// accepted answers or unit say something else (#227 B5, B10). Everything else needs subject
// knowledge, and claiming to check it would be the same mistake one level up (CLAUDE.md
// rule 5). Checked task families with solutions computed from parameters are issue #162.

import {
  canonicalizeUnit,
  compareNumbers,
  compileExpression,
  evaluateExpression,
  type Expr,
  parseCanonicalKey,
  parseExpression,
  plainMath,
  variablesOf,
} from '@learnbuddy/shared-math';

import { imbalanceOf, looksLikeEquation, parseEquation } from './chemistry.js';
import { labelled, mathRunsOf } from './form.js';
import { nuclearImbalance, parseNuclear } from './nuclear.js';
import { equationContradicts, systemContradicts } from './systems.js';

/** Within this of the key, the two agree — floating point, not tolerance for a wrong key. */
const EPSILON = 1e-9;

/**
 * The arithmetic the prompt asks for, when the prompt is nothing else.
 *
 * "6 + 4", "17 · 23 = ?", "$\\frac{1}{2} + \\frac{1}{4}$" qualify. "Wie viel sind 20 % von
 * 80?" does not — it reads as a sentence, and a parser that guessed at it would invent the
 * very certainty this module exists to withhold.
 */
export function askedArithmetic(prompt: string): number | null {
  const bare = plainMath(prompt)
    .replace(/\s+/g, ' ')
    .trim()
    // A trailing "= ?" or "=" is how a worksheet writes the question mark.
    .replace(/=\s*\?*\s*$/, '')
    .trim();
  if (bare.length === 0 || bare.length > 60) return null;
  // Any letter means words, a variable or a unit: not a constant to compute.
  if (/\p{L}/u.test(bare)) return null;
  if (!/[+\-*/·:^]/.test(bare)) return null;
  const fn = compileExpression(bare);
  if (!fn) return null;
  const value = fn(0);
  return Number.isFinite(value) ? value : null;
}

/** Without spaces, the way `plainMath` writes it: "$6 + 4$" and "6+4" are one calculation. */
const tight = (s: string) => plainMath(s).replace(/\s+/g, '');

/** What may not touch a marked calculation: it would make it part of a longer number or term. */
const CONTINUES = /[\d+\-*/·×÷:^(){}\\]/;

/**
 * Whether `part` stands in `whole` as a calculation of its own: "6+4" in "16+4" or "6+4·2" does
 * not. A point or a comma continues it only as a decimal separator, between digits; after the
 * calculation it is usually the end of the sentence.
 */
function standsIn(whole: string, part: string): boolean {
  const decimal = (sep: string, digit: string) => /[.,]/.test(sep) && /\d/.test(digit);
  for (let at = whole.indexOf(part); at >= 0; at = whole.indexOf(part, at + 1)) {
    const end = at + part.length;
    const before = whole[at - 1] ?? '';
    const after = whole[end] ?? '';
    if (CONTINUES.test(before) || decimal(before, whole[at - 2] ?? '')) continue;
    if (CONTINUES.test(after) || decimal(after, whole[end + 1] ?? '')) continue;
    return true;
  }
  return false;
}

/**
 * The calculation the model marked inside a sentence (issue #227, finding 4), computed — when it
 * really stands in the question. Finding it there is not code's to guess (the fraction in
 * "Erweitere 2/5 mit 3" is not what is asked), but checking a marked one is: a marker the
 * question does not contain as a calculation of its own proves nothing, and the value is
 * computed by the same rules as a bare calculation.
 */
export function markedArithmetic(
  prompt: string,
  computes: string | null | undefined,
): number | null {
  if (!computes || !standsIn(tight(prompt), tight(computes))) return null;
  return askedArithmetic(computes);
}

/**
 * False only when the question's own arithmetic contradicts the key. Unknown questions and
 * unparseable keys answer true: this says "no proof against it", never "proven right".
 */
function arithmeticAgrees(item: {
  prompt: string;
  answer: string;
  unit: string | null;
  computes?: string | null;
}): boolean {
  const asked = askedArithmetic(item.prompt) ?? markedArithmetic(item.prompt, item.computes);
  if (asked === null) return true;
  const key = parseCanonicalKey(item.answer);
  if (key.value === null) return true;
  // A unit on either side means the question was about more than the bare arithmetic.
  if (item.unit || key.unit) return true;
  return Math.abs(key.value - asked) <= EPSILON * Math.max(1, Math.abs(asked));
}

// ── a derivative or an antiderivative against the function the question prints (#235) ──────

/** The one function the prompt defines ("$f(x) = x^3 - 2x$"), by its letter. */
function definedFunction(prompt: string): { name: string; arg: string; body: Expr } | null {
  const found = mathRunsOf(prompt)
    .map((run) => labelled(run))
    .filter((l) => l.label !== null && /^[a-z]$/.test(l.label) && l.arg !== null);
  if (found.length !== 1) return null;
  const f = found[0]!;
  const body = parseExpression(f.body, 'letters');
  if (body === null) return null;
  const vars = variablesOf(body);
  if (vars.length > 1 || (vars.length === 1 && vars[0] !== f.arg)) return null;
  return { name: f.label!, arg: f.arg!, body };
}

/** Fixed points, non-integer, where a derivative is compared. */
const SLOPE_PROBES = [-2.375, -1.25, -0.625, 0.875, 1.375, 2.125, 3.625] as const;

/**
 * The derivative of `f` at `p` by central differences with one Richardson step, or null where
 * two step sizes disagree (a kink, a pole, the edge of the domain): there it decides nothing.
 */
function slopeAt(f: (x: number) => number, p: number): number | null {
  const d = (h: number) => (f(p + h) - f(p - h)) / (2 * h);
  const coarse = d(1e-3);
  const fine = d(5e-4);
  if (!Number.isFinite(coarse) || !Number.isFinite(fine)) return null;
  const estimate = (4 * fine - coarse) / 3;
  if (Math.abs(coarse - fine) > 1e-3 * Math.max(1, Math.abs(estimate))) return null;
  return estimate;
}

/**
 * True only when a key labelled as the derivative (f'(x) = …) or as an antiderivative with its
 * constant (F(x) = … + C) of the one function the question prints certainly is not one: its
 * values differ from the computed slope at most of the points where the slope can be computed.
 */
function calculusContradicts(prompt: string, key: string): boolean {
  const f = definedFunction(prompt);
  if (f === null) return false;
  const k = labelled(key);
  if (k.label === null || k.arg !== f.arg) return false;
  const derivative = k.label === `${f.name}'`;
  const antiderivative = k.label === f.name.toUpperCase();
  if (!derivative && !antiderivative) return false;
  const keyTerm = parseExpression(
    antiderivative ? k.body.replace(/\+\s*C\s*$/, '') : k.body,
    'letters',
  );
  // An antiderivative is only read with its "+ C": without it, F may be any function the task
  // happens to call F, and then the slope says nothing about it.
  if (keyTerm === null || (antiderivative && !/\+\s*C\s*$/.test(k.body))) return false;
  const keyVars = variablesOf(keyTerm);
  if (keyVars.length > 1 || (keyVars.length === 1 && keyVars[0] !== f.arg)) return false;
  const at = (e: Expr) => (x: number) => evaluateExpression(e, { [f.arg]: x });
  // Derivative: the key against the slope of f. Antiderivative: the slope of the key against f.
  const slopeOf = at(derivative ? f.body : keyTerm);
  const target = at(derivative ? keyTerm : f.body);
  let usable = 0;
  let off = 0;
  for (const p of SLOPE_PROBES) {
    const slope = slopeAt(slopeOf, p);
    const want = target(p);
    if (slope === null || !Number.isFinite(want)) continue;
    usable += 1;
    if (Math.abs(slope - want) > 1e-5 * Math.max(1, Math.abs(slope), Math.abs(want))) off += 1;
  }
  return usable >= 3 && off >= 2 && off * 2 >= usable;
}

// ── a balance that does not hold ───────────────────────────────────────────────────────────

/** A reaction or nuclear equation as key that does not add up itself (#227 B6, #263). */
function unbalancedKey(key: string): boolean {
  const nuclear = parseNuclear(key);
  if (nuclear !== null) return nuclearImbalance(nuclear) !== null;
  if (!looksLikeEquation(key)) return false;
  const eq = parseEquation(key);
  return eq !== null && imbalanceOf(eq) !== null;
}

/** An accepted answer of a number question with another value than the key (#227 B5). */
function acceptedDisagrees(item: {
  answer: string;
  accepted_answers: readonly string[];
  unit: string | null;
}): boolean {
  const key = parseCanonicalKey(item.answer);
  if (key.value === null) return false;
  return item.accepted_answers.some((acc) => {
    const other = parseCanonicalKey(acc);
    if (other.value === null || other.unit !== key.unit) return false;
    // Either may be the rounded one ("1/3" and "0.33"): agreeing in one direction is enough.
    return (
      compareNumbers(other, key, { unit: item.unit }) === 'different' &&
      compareNumbers(key, other, { unit: item.unit }) === 'different'
    );
  });
}

/** The key's own unit is another one than the item's unit field (#227 B10). */
function unitDisagrees(item: { answer: string; unit: string | null }): boolean {
  const key = parseCanonicalKey(item.answer);
  const field = canonicalizeUnit(item.unit);
  return key.value !== null && key.unit !== null && field !== null && key.unit !== field;
}

/**
 * False when the question PROVES its key wrong, or the key contradicts itself — the item is
 * then dropped, never repaired (Regel 0, generated content). Every check here can only say
 * "certainly not": a question it cannot read, a key it cannot parse, a system it cannot solve
 * all answer true. What is checked:
 *   - the arithmetic a bare calculation asks for (#157), or the one the model marked inside a
 *     sentence (`computes`, #227 finding 4);
 *   - a system of linear equations printed in the question, solved, against a key of named
 *     values — and that it has exactly one solution (#263);
 *   - a single equation in one variable, against the value the key gives it (#227 B4);
 *   - a derivative or antiderivative key against the function the question defines (#235);
 *   - a reaction or nuclear equation as key that does not balance (#227 B6, #263);
 *   - an accepted answer of a number question with another value (#227 B5), and a key whose
 *     unit is not the item's unit (#227 B10).
 */
export function keyAgreesWithPrompt(item: {
  kind: string;
  prompt: string;
  answer: string;
  unit: string | null;
  accepted_answers?: readonly string[];
  choices?: readonly string[] | null;
  correct_choice?: number | null;
  computes?: string | null;
}): boolean {
  // Multiple choice: the option the index points at is the key the learner is judged by
  // (#227 Nr. 2) — "$6 + 4$" with the options 8, 10, 12 and the index on 8 is the #157 case.
  if (item.kind === 'multiple_choice') {
    const chosen =
      item.choices && item.correct_choice != null ? item.choices[item.correct_choice] : undefined;
    return chosen === undefined
      ? true
      : keyAgreesWithPrompt({
          kind: 'numeric',
          prompt: item.prompt,
          answer: chosen,
          unit: item.unit,
          computes: item.computes,
        });
  }
  if (item.kind !== 'numeric' && item.kind !== 'short' && item.kind !== 'formula') return true;
  const keys = [item.answer, ...(item.accepted_answers ?? [])];
  if (!arithmeticAgrees(item)) return false;
  if (keys.some((k) => unbalancedKey(k))) return false;
  if (systemContradicts(item.prompt, item.answer)) return false;
  if (equationContradicts(item.prompt, item.answer)) return false;
  if (keys.some((k) => calculusContradicts(item.prompt, k))) return false;
  if (item.kind === 'numeric') {
    if (acceptedDisagrees({ ...item, accepted_answers: item.accepted_answers ?? [] })) return false;
    if (unitDisagrees(item)) return false;
  }
  return true;
}
