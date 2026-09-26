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

/** 'close': the same except for accents/diacritics (e.g. "eleve" for "élève") — the tutor says so. */
export type RuleVerdict = 'correct' | 'close' | 'incorrect' | 'unknown';

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
      // A spoken or typed choice ("2/3") matches the choice however it is written ($\frac{2}{3}$).
      const norm = normalizeShortAnswer(plainMath(answer.text));
      const idx = item.choices.findIndex((c) => normalizeShortAnswer(plainMath(c)) === norm);
      if (idx >= 0) return idx === item.correct_choice ? 'correct' : 'incorrect';
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
 * sure. Only for tests (one answer per question) — in homework "12" may be a
 * right step towards 11/12. The same value in another form ("4/8" for "1/2")
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
