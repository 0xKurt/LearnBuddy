// Numbers as a learner writes them and as a stored answer key holds them.
// docs/architecture.md §Practice (grading); audit C-1–C-4, H-1, H-2, H-6.
//
// Two readers, one grammar:
// - parseNumericInput(text): what a learner typed or said. It does not depend on the app
//   language — the separator is read from the text: "0,125", "2,5", "2.5", "1.234,5" and
//   "1,234.5" are unambiguous in every locale. A single "." or "," followed by exactly three
//   digits ("1.000", "2,375") could be a thousand or a decimal: no value (the tutor decides),
//   unless the whole part is 0 ("0,125" is never a hundred and twenty-five).
// - parseCanonicalKey(key): a stored key. Keys are written with a decimal point (the
//   generation and extraction prompts ask for it), so "0.125" is always 0.125; there are no
//   thousands separators in a key. A decimal comma is read only where it cannot be a
//   thousands separator ("2,5").
// Both know a fraction (3/4), a mixed number (3 1/2, $3\frac{1}{2}$ — never 31/2) and a
// trailing unit (25 %, 1 1/2 h). Values of written numbers are exact rationals, so no float
// rounding decides a verdict.
//
// A learner may also type a small calculation with the math keys (17·23, √144, 2π). It is
// evaluated by the bounded parser of expression.ts — never by a general evaluator (audit H-6:
// mathjs `evaluate` built 1 GB matrices from one answer) — and marked as form 'expression'
// (`has_residue`): a value was computed, not written, so the grader leaves it to the tutor.

import { compileExpression } from './expression.js';
import { plainMath } from './latex.js';
import { canonicalizeUnit, UNIT_ALIASES } from './units.js';

/** Longest learner input read as a number; anything longer is not a number answer. */
export const MAX_NUMERIC_INPUT = 64;
const MAX_KEY = 200;

/** A written number's form. integer and decimal are one family (4 and 4,0). */
export type NumberForm = 'integer' | 'decimal' | 'fraction' | 'mixed' | 'expression';

/** An exact rational value; den > 0. */
export type Exact = { num: bigint; den: bigint };

export type NumericParseResult = {
  /** The value, or null when the text is no number (or an ambiguous one). */
  value: number | null;
  /** The exact value of a written number (not for an expression). */
  exact: Exact | null;
  form: NumberForm | null;
  /** Digits after the decimal separator as written (0 unless form is 'decimal'). */
  decimals: number;
  /**
   * A fraction or mixed number as written, canonical ("-3 1/2", "6/8"): the same value in
   * another spelling is another answer ("Kürze 6/8" is not answered by "6/8").
   */
  written: string | null;
  unit: string | null;
  raw: string;
  matched_unit_alias: string | null;
  /** True when the text is a calculation (an operator, a root, a power), not one written number. */
  has_residue: boolean;
};

// Longest unit alias first ("km/h" before "h").
const SORTED_UNIT_KEYS = Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length);

function stripTrailingUnit(input: string): {
  rest: string;
  unit: string | null;
  alias: string | null;
} {
  const lower = input.toLowerCase();
  for (const alias of SORTED_UNIT_KEYS) {
    if (lower.endsWith(alias)) {
      const before = input.slice(0, input.length - alias.length).replace(/\s+$/, '');
      // The unit follows the number ("5 km", "25%"), never the end of a word ("okm").
      const boundary = before.length === 0 || /[\s\d.,)]/.test(before[before.length - 1]!);
      if (boundary) return { rest: before, unit: canonicalizeUnit(alias), alias };
    }
  }
  return { rest: input, unit: null, alias: null };
}

const RAISED = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** "¹²" → "12": raised digits as plain ones. */
export function superscriptDigits(run: string): string {
  return [...run].map((ch) => String(RAISED.indexOf(ch))).join('');
}

/**
 * The characters the app's math keys insert (and phones type) → what the
 * evaluator reads: − → -, · × → *, ÷ → /, ² ³ ⁴ … → ^2 ^3 ^4, π → pi, √x / √(x) → sqrt(…).
 */
export function typographicToAscii(text: string): string {
  return (
    text
      .replace(/[−–]/g, '-')
      .replace(/[·×⋅]/g, '*')
      .replace(/÷/g, '/')
      // A run of raised digits is one exponent: the exponent key writes x⁴ or 10¹² (issue #239).
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${superscriptDigits(run)}`)
      .replace(/π/g, 'pi')
      .replace(/√\s*\(/g, 'sqrt(')
      .replace(/√\s*(\d+(?:[.,]\d+)?|[a-zA-Z]+)/g, 'sqrt($1)')
  );
}

type Mode = 'learner' | 'key';
type Literal = { exact: Exact; decimals: number; text: string };

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x === 0n ? 1n : x;
}

function reduce(num: bigint, den: bigint): Exact {
  const sign = den < 0n ? -1n : 1n;
  const g = gcd(num, den);
  return { num: (sign * num) / g, den: (sign * den) / g };
}

function decimalLiteral(whole: string, frac: string): Literal {
  const w = BigInt(whole).toString();
  return {
    exact: reduce(BigInt(whole + frac), 10n ** BigInt(frac.length)),
    decimals: frac.length,
    text: frac.length ? `${w}.${frac}` : w,
  };
}

/** One number without sign: "12", "0,125", "2.5", "1.234,5"; null when it is ambiguous or no number. */
function literal(s: string, mode: Mode): Literal | null {
  if (/^\d+$/.test(s)) return decimalLiteral(s, '');
  const single = /^(\d+)([.,])(\d+)$/.exec(s);
  if (single) {
    const whole = single[1]!;
    const sep = single[2]!;
    const frac = single[3]!;
    if (frac.length === 3) {
      // A key is written with a decimal point; a learner's "1.000" / "2,375" may be either.
      if (mode === 'key' ? sep === ',' : !/^0+$/.test(whole)) return null;
    }
    return decimalLiteral(whole, frac);
  }
  if (mode === 'key') return null;
  // Thousands groups: "1.000.000" / "1,000,000", with a decimal part in the other separator.
  const grouped = /^(\d{1,3}(?:([.,])\d{3})+)(?:([.,])(\d+))?$/.exec(s);
  if (grouped) {
    const int = grouped[1]!;
    const group = grouped[2]!;
    const dec = grouped[3];
    const frac = grouped[4];
    const digits = int.split(group).join('');
    const groups = int.split(group).length - 1;
    if (dec === undefined && groups >= 2) return decimalLiteral(digits, '');
    if (dec !== undefined && dec !== group && frac !== undefined)
      return decimalLiteral(digits, frac);
  }
  return null;
}

function toNumber(e: Exact): number {
  return Number(e.num) / Number(e.den);
}

function signed(e: Exact, negative: boolean): Exact {
  return negative ? { num: -e.num, den: e.den } : e;
}

type Written = { exact: Exact; form: NumberForm; decimals: number; written: string | null };

/** One written number: a whole or decimal number, a fraction or a mixed number; else null. */
function readWritten(body: string, mode: Mode): Written | null {
  const mixed = /^([-+]?)\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(body);
  if (mixed) {
    const negative = mixed[1] === '-';
    const whole = BigInt(mixed[2]!);
    const num = BigInt(mixed[3]!);
    const den = BigInt(mixed[4]!);
    if (den === 0n || num === 0n || num >= den) return null;
    return {
      exact: signed(reduce(whole * den + num, den), negative),
      form: 'mixed',
      decimals: 0,
      written: `${negative ? '-' : ''}${whole} ${num}/${den}`,
    };
  }
  const fraction = /^([-+]?)\s*(\d[\d.,]*)\s*\/\s*(\d[\d.,]*)$/.exec(body);
  if (fraction) {
    const negative = fraction[1] === '-';
    const top = literal(fraction[2]!, mode);
    const bottom = literal(fraction[3]!, mode);
    if (!top || !bottom || bottom.exact.num === 0n) return null;
    return {
      exact: signed(
        reduce(top.exact.num * bottom.exact.den, top.exact.den * bottom.exact.num),
        negative,
      ),
      form: 'fraction',
      decimals: 0,
      written: `${negative ? '-' : ''}${top.text}/${bottom.text}`,
    };
  }
  const plain = /^([-+]?)\s*(\d[\d.,]*)$/.exec(body);
  if (plain) {
    const l = literal(plain[2]!, mode);
    if (!l) return null;
    return {
      exact: signed(l.exact, plain[1] === '-'),
      form: l.decimals > 0 ? 'decimal' : 'integer',
      decimals: l.decimals,
      written: null,
    };
  }
  // "1 000" / "12 345": groups of three with a (thin) space.
  const spaced = mode === 'learner' ? /^([-+]?)\s*(\d{1,3}(?: \d{3})+)$/.exec(body) : null;
  if (spaced) {
    const l = decimalLiteral(spaced[2]!.replace(/ /g, ''), '');
    return {
      exact: signed(l.exact, spaced[1] === '-'),
      form: 'integer',
      decimals: 0,
      written: null,
    };
  }
  return null;
}

/** A small calculation typed with the math keys, evaluated with a bounded parser; else null. */
function evaluateCalculation(body: string): number | null {
  // Digits, separators, + − · : / ^ ( ), powers, roots, π — nothing else (no names, no "e").
  const withoutNames = body.replace(/sqrt|abs|pi|π|√/g, '');
  if (!/^[\d.,+\-*/:^()\s·×⋅÷⁰¹²³⁴⁵⁶⁷⁸⁹]*$/.test(withoutNames)) return null;
  let failed = false;
  const canonical = body.replace(/\d[\d.,]*\d|\d/g, (lit) => {
    const l = literal(lit, 'learner');
    if (!l) failed = true;
    return l ? l.text : lit;
  });
  // Two numbers side by side ("3 4") are no calculation anyone typed on purpose.
  if (failed || /\d\s+\d/.test(canonical)) return null;
  const fn = compileExpression(typographicToAscii(canonical));
  const v = fn ? fn(0) : NaN;
  return Number.isFinite(v) ? v : null;
}

function parse(input: string, mode: Mode): NumericParseResult {
  const none = (unit: string | null = null, alias: string | null = null): NumericParseResult => ({
    value: null,
    exact: null,
    form: null,
    decimals: 0,
    written: null,
    unit,
    raw: input,
    matched_unit_alias: alias,
    has_residue: false,
  });
  let s = input.trim();
  if (s === '' || s.length > (mode === 'key' ? MAX_KEY : MAX_NUMERIC_INPUT)) return none();
  // LaTeX from a key ($3\frac{1}{2}$, 25\,\%); a lone "$" is a unit.
  if (/\\|\$.*\$/.test(s)) s = plainMath(s);
  s = s.replace(/[−–]/g, '-').replace(/[\u00A0\u202F\u2009]/g, ' ');
  const { rest, unit, alias } = stripTrailingUnit(s);
  const body = rest.trim();
  if (body === '') return none(unit, alias);
  const w = readWritten(body, mode);
  if (w) {
    return {
      ...w,
      value: toNumber(w.exact),
      unit,
      raw: input,
      matched_unit_alias: alias,
      has_residue: false,
    };
  }
  if (mode === 'key') return none(unit, alias);
  const value = evaluateCalculation(body);
  if (value === null) return none(unit, alias);
  return {
    value,
    exact: null,
    form: 'expression',
    decimals: 0,
    written: null,
    unit,
    raw: input,
    matched_unit_alias: alias,
    has_residue: true,
  };
}

/** What a learner typed or said, read as a number (locale-independent, see the header). */
export function parseNumericInput(input: string): NumericParseResult {
  return parse(input, 'learner');
}

/** A stored answer key (point decimal, fraction, mixed number, LaTeX, trailing unit); never an expression. */
export function parseCanonicalKey(key: string): NumericParseResult {
  return parse(key, 'key');
}

/** 'equal' / 'different' when a rule can say so for sure; 'unknown' leaves it to the tutor. */
export type ValueComparison = 'equal' | 'different' | 'unknown';

export type KeyOptions = {
  /** The item's unit ("%", "cm"); the key's own trailing unit counts when it has none. */
  unit?: string | null;
  /** An explicit ± tolerance the item declares (rounded or measured results); else D-1 below. */
  tolerance?: number | null;
};

function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

/**
 * Does a learner's written number have the key's value? The tolerance (decision D-1): an
 * integer, fraction or mixed-number key must match exactly; a decimal key accepts less than
 * half a unit of its last written decimal (key 3.14: 3.1416 yes, 3.1 no — the answer rounds to
 * the key); a wider tolerance only when the item declares one. Never a percentage of the key
 * (audit C-2: 242 for 240 was "correct").
 *
 * The form is not compared here (3/4 and 0,75 are equal values): see `sameWrittenForm`.
 * A calculation ('expression'), a different unit or an unreadable key is 'unknown'.
 */
export function compareNumbers(
  given: NumericParseResult,
  key: NumericParseResult,
  options: KeyOptions = {},
): ValueComparison {
  if (!key.exact || !given.exact || given.value === null || key.value === null) return 'unknown';
  const keyUnit = canonicalizeUnit(options.unit ?? null) ?? key.unit;
  if (given.unit !== null && given.unit !== keyUnit) return 'unknown';
  const tolerance = options.tolerance ?? null;
  if (tolerance !== null && tolerance > 0) {
    const diff = Math.abs(given.value - key.value);
    return diff <= tolerance * (1 + 1e-12) ? 'equal' : 'different';
  }
  const g = given.exact;
  const k = key.exact;
  const diffNum = abs(g.num * k.den - k.num * g.den); // |g − k| = diffNum / (g.den · k.den)
  if (key.form === 'decimal' && key.decimals > 0) {
    // |g − k| < 1 / (2 · 10^decimals)
    return diffNum * 2n * 10n ** BigInt(key.decimals) < g.den * k.den ? 'equal' : 'different';
  }
  return diffNum === 0n ? 'equal' : 'different';
}

/**
 * The learner wrote the key's form: a whole or decimal number for a number key (4 / 4,0 /
 * 4.00), the same fraction or mixed number as written. Another form of the same value (1/8
 * for 0.125, 6/8 for 3/4, 7/2 for 3 1/2) is for the tutor to judge (decision D-3).
 */
export function sameWrittenForm(given: NumericParseResult, key: NumericParseResult): boolean {
  const family = (f: NumberForm | null) => (f === 'integer' || f === 'decimal' ? 'number' : f);
  if (given.form === null || family(given.form) !== family(key.form)) return false;
  if (given.form === 'fraction' || given.form === 'mixed') return given.written === key.written;
  return true;
}

/**
 * The shared value comparison (also for homework help, audit I-3): does the learner's text
 * state the key's value? Form-independent (0,75 for $\frac{3}{4}$ is 'equal'); a calculation,
 * words, another unit or an ambiguous number ("1.000") is 'unknown'.
 */
export function compareValue(
  keyText: string,
  learnerText: string,
  options: KeyOptions = {},
): ValueComparison {
  return compareNumbers(parseNumericInput(learnerText), parseCanonicalKey(keyText), options);
}
