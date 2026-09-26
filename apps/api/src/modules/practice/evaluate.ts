// Deterministic answer checks for the cases where exactness is decidable:
// multiple choice, numbers (tolerance, units, decimal comma), exact matches
// of short answers. Anything else ("unknown") is judged by the tutor model.
// No word lists: this only compares the answer with the expected solution.

import { canonicalizeUnit, normalizeShortAnswer, parseNumericInput } from '@learnbuddy/shared-math';

export type ItemForCheck = {
  kind: 'short' | 'long' | 'numeric' | 'multiple_choice' | 'formula' | 'vocab' | 'speak';
  answer: string;
  accepted_answers: string[];
  unit: string | null;
  choices: string[] | null;
  correct_choice: number | null;
};

/**
 * Near misses on a written answer, decided without a model (the kind of check
 * Anki, Quizlet and LibreLingo do):
 * - 'close': the same except for accents/diacritics ("eleve" for "élève");
 * - 'missing_word': the key without its first word ("Küche" for "die Küche");
 * - 'typo': a small slip — Damerau distance within a limit that grows with the
 *   word (none up to 4 letters, 1 up to 8, else 2). A slip can also be another
 *   real word ("horse" for "house"), so it is never counted right: the app shows
 *   the spelling and she types it again.
 */
export type RuleVerdict = 'correct' | 'close' | 'missing_word' | 'typo' | 'incorrect' | 'unknown';

/** Near misses: partly right, not wrong. */
export const NEAR_MISS = new Set<RuleVerdict>(['close', 'missing_word', 'typo']);

/** Optimal-string-alignment distance: insert, delete, replace, swap two neighbours. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

/** Slips allowed for a key of this length: short words must be exact ("cat" ≠ "car"). */
function allowedSlips(key: string): number {
  const letters = key.replace(/\s+/g, '').length;
  return letters <= 4 ? 0 : letters <= 8 ? 1 : 2;
}

/** $\\frac{a}{b}$ → a/b, x^{2} → x^2, \\sqrt{x} → √x, \\cdot → ·; without the dollar signs. */
export function plainMath(s: string): string {
  let out = s.replace(/\$/g, '');
  for (let i = 0; i < 4; i++) out = out.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2');
  return out
    .replace(/\\sqrt\{([^{}]*)\}/g, '√$1')
    .replace(/\^\{([^{}]*)\}/g, '^$1')
    .replace(/_\{([^{}]*)\}/g, '_$1')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, ':')
    .replace(/\\pi/g, 'π')
    .replace(/\\(left|right)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Letters without accents: é → e, ß stays (it is a letter of its own). */
function withoutAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC');
}

function closeEnough(actual: number, expected: number): boolean {
  if (expected === 0) return Math.abs(actual) <= 1e-9;
  return (
    Math.abs(actual - expected) <=
    Math.max(Math.abs(expected) * 0.01, Math.abs(expected) < 1 ? 0.01 : 0)
  );
}

/**
 * The option a spoken or typed answer names, or null: the option itself however it
 * is written ("2/3" for $\frac{2}{3}$), its letter as voice mode reads them ("B",
 * "b."), or the option said first and then explained further ("Die Brüche
 * gleichnamig machen, auf denselben Nenner bringen"). Only when exactly one
 * option fits; anything else is left to the tutor.
 */
export function choiceNamed(text: string, choices: readonly string[]): number | null {
  const norm = normalizeShortAnswer(plainMath(text));
  const options = choices.map((c) => normalizeShortAnswer(plainMath(c)));
  const exact = options.indexOf(norm);
  if (exact >= 0) return exact;
  const letter = /^([a-z])[.)]?$/i.exec(text.trim());
  if (letter) {
    const i = letter[1]!.toLowerCase().charCodeAt(0) - 97;
    return i < choices.length ? i : null;
  }
  const first = options
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.length >= 3 && norm.startsWith(o) && /^\W/u.test(norm.slice(o.length)));
  return first.length === 1 ? first[0]!.i : null;
}

export function ruleCheck(
  item: ItemForCheck,
  answer: { text: string | null; choice: number | null },
  locale: string,
): RuleVerdict {
  if (item.kind === 'multiple_choice') {
    if (answer.choice !== null && item.correct_choice !== null) {
      return answer.choice === item.correct_choice ? 'correct' : 'incorrect';
    }
    if (answer.text && item.choices) {
      const idx = choiceNamed(answer.text, item.choices);
      if (idx !== null) return idx === item.correct_choice ? 'correct' : 'incorrect';
    }
    return 'unknown';
  }

  const text = (answer.text ?? '').trim();
  if (!text) return 'unknown';

  if (item.kind === 'numeric') {
    const numLocale =
      locale === 'de' || locale === 'fr' || locale === 'es' || locale === 'it' ? 'de' : 'en';
    const given = parseNumericInput(text, numLocale);
    const expected = parseNumericInput(item.answer, numLocale);
    if (given.value === null || expected.value === null) return 'unknown';
    const expectedUnit = canonicalizeUnit(item.unit) ?? expected.unit;
    if (given.unit && expectedUnit && given.unit !== expectedUnit) return 'unknown';
    return closeEnough(given.value, expected.value) ? 'correct' : 'incorrect';
  }

  // short / long / formula: an exact match (after normalisation) is decidable;
  // everything else needs judgement.
  // Math written as \\frac{3}{4} (stored) and 3/4 (typed) is the same answer.
  const norm = normalizeShortAnswer(plainMath(text));
  const targets = [item.answer, ...item.accepted_answers]
    .map((a) => normalizeShortAnswer(plainMath(a)))
    .filter(Boolean);
  if (targets.includes(norm)) return 'correct';
  if (targets.map(withoutAccents).includes(withoutAccents(norm))) return 'close';
  if (item.kind === 'vocab' || item.kind === 'short') {
    const folded = withoutAccents(norm);
    const words = (x: string) => x.split(' ').filter(Boolean);
    if (targets.some((t) => words(t).length >= 2 && words(t).slice(1).join(' ') === norm)) {
      return 'missing_word';
    }
    if (
      targets.some((t) => {
        const slips = allowedSlips(t);
        return slips > 0 && editDistance(folded, withoutAccents(t)) <= slips;
      })
    ) {
      return 'typo';
    }
  }
  if (item.kind === 'formula') {
    const compact = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    if ([item.answer, ...item.accepted_answers].some((a) => compact(a) === compact(text)))
      return 'correct';
  }
  return 'unknown';
}

/** A plain number or simple fraction ("3", "-0,75", "3/4", "\\frac{3}{4}"); null for anything else. */
function plainNumber(s: string): number | null {
  // Spaces only around the number: "3 1/2" is a mixed number, not 31/2.
  const x = plainMath(s).trim();
  const m = /^(-?\d+(?:[.,]\d+)?)(?:\/(\d+(?:[.,]\d+)?))?$/.exec(x);
  if (!m) return null;
  // "1.000" / "1,000" could be a thousand or one: not decidable.
  if (/[.,]\d{3}$/.test(m[1]!) || (m[2] && /[.,]\d{3}$/.test(m[2]))) return null;
  const num = Number(m[1]!.replace(',', '.'));
  const den = m[2] ? Number(m[2].replace(',', '.')) : 1;
  return den === 0 ? null : num / den;
}

/**
 * A plain number whose value differs from every expected number: wrong for
 * sure. Not for homework — there "12" may be a right step towards 11/12. The same value in another form ("4/8" for "1/2")
 * is not decided here: it may still be wrong (not reduced).
 */
export function differentNumber(item: ItemForCheck, text: string): boolean {
  if (item.kind !== 'short' && item.kind !== 'formula' && item.kind !== 'numeric') return false;
  const given = plainNumber(text);
  if (given === null) return false;
  const expected = [item.answer, ...item.accepted_answers].map(plainNumber);
  if (expected.length === 0 || expected.some((v) => v === null)) return false;
  return expected.every((v) => !closeEnough(given, v!));
}

/**
 * The numbers a text states, as values: 3/4, 0,75, 1 11/20, $1\frac{11}{20}$, $\frac{31}{20}$.
 * For telling whether a hint states the result in another form (31/20 for 1 11/20).
 */
export function valuesIn(text: string): number[] {
  const t = text
    .replace(/(\d)\s*\\[dt]?frac\{(\d+)\}\{(\d+)\}/g, '$1 $2/$3')
    .replace(/\\[dt]?frac\{(-?\d+(?:[.,]\d+)?)\}\{(\d+(?:[.,]\d+)?)\}/g, '$1/$2');
  const out: number[] = [];
  const num = (x: string) => Number(x.replace(',', '.'));
  const re =
    /(-?\d+)\s+(\d+)\/(\d+)|(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)|(-?\d+(?:[.,]\d+)?)/g;
  for (const m of t.matchAll(re)) {
    if (m[1] !== undefined) {
      const whole = num(m[1]);
      const frac = num(m[2]!) / num(m[3]!);
      out.push(whole < 0 ? whole - frac : whole + frac);
    } else if (m[4] !== undefined) {
      const den = num(m[5]!);
      if (den !== 0) out.push(num(m[4]) / den);
    } else if (m[6] !== undefined) {
      out.push(num(m[6]));
    }
  }
  return out;
}
