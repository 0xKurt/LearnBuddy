// Local answer evaluator. Doc 07 §3 (one branch per answer_kind).
//
// Returns 'correct' | 'incorrect' | 'unknown'. 'unknown' means delegate to
// the LLM (POST /attempts). 'incorrect' is returned only when we are
// confident locally (e.g. multiple-choice index mismatch).
//
// All paths are pure functions over the item shape so the same evaluator
// can be unit-tested without expo-sqlite.

import {
  canonicalizeFormula,
  lengthRatio,
  normalizeShortAnswer,
  parseMathLite,
  parseNumericInput,
  tokenOverlap,
} from '@learnbuddy/shared-math';
import type { AnswerKind, Item } from '@learnbuddy/shared-types';

export type LocalVerdict = 'correct' | 'incorrect' | 'unknown';

export type EvaluatableItem = Pick<
  Item,
  | 'answer_kind'
  | 'expected_answer'
  | 'acceptable_answers'
  | 'mc_options'
  | 'mc_correct_index'
  | 'units'
  | 'latex_expected'
  | 'latex_acceptable'
  | 'fill_blank_answers'
>;

export function localEvaluate(item: EvaluatableItem, kidAnswer: string): LocalVerdict {
  switch (item.answer_kind as AnswerKind) {
    case 'multiple_choice':
      return evaluateMultipleChoice(item, kidAnswer);
    case 'numeric':
      return evaluateNumeric(item, kidAnswer);
    case 'formula':
      return evaluateFormula(item, kidAnswer);
    case 'short':
    case 'diagram_label':
      return evaluateShort(item, kidAnswer);
    case 'long':
      return evaluateLong(item, kidAnswer);
    case 'fill_blank':
      return evaluateFillBlank(item, kidAnswer);
  }
}

// ─── multiple_choice ─────────────────────────────────────────────────────────

function evaluateMultipleChoice(item: EvaluatableItem, kidAnswer: string): LocalVerdict {
  const correctIdx = item.mc_correct_index;
  if (correctIdx == null) return 'unknown';
  // kidAnswer is the stringified index for tap input.
  const idx = Number(kidAnswer);
  if (Number.isInteger(idx)) return idx === correctIdx ? 'correct' : 'incorrect';
  // Accessibility fallback — kid typed the option text instead of tapping.
  if (item.mc_options && item.mc_options[correctIdx]) {
    return normalizeShortAnswer(kidAnswer) === normalizeShortAnswer(item.mc_options[correctIdx]!)
      ? 'correct'
      : 'unknown';
  }
  return 'unknown';
}

// ─── numeric ─────────────────────────────────────────────────────────────────

function evaluateNumeric(item: EvaluatableItem, kidAnswer: string): LocalVerdict {
  const parsed = parseNumericInput(kidAnswer, 'de');
  if (parsed.value == null) return 'unknown';
  const expected = parseNumericInput(item.expected_answer, 'de').value;
  if (expected == null) return 'unknown';

  const tolerance = Math.abs(expected) < 1 ? 0.01 : Math.abs(expected) * 0.01;
  if (Math.abs(parsed.value - expected) <= tolerance) {
    return matchesUnit(item.units, parsed.unit) ? 'correct' : 'unknown';
  }

  for (const alt of item.acceptable_answers ?? []) {
    const a = parseNumericInput(alt, 'de').value;
    if (a == null) continue;
    if (Math.abs(parsed.value - a) <= tolerance) {
      return matchesUnit(item.units, parsed.unit) ? 'correct' : 'unknown';
    }
  }
  return 'unknown';
}

function matchesUnit(expected: string | null | undefined, got: string | null): boolean {
  if (!expected) return true;
  if (!got) return false;
  return expected.trim().toLowerCase() === got.trim().toLowerCase();
}

// ─── formula ─────────────────────────────────────────────────────────────────

function evaluateFormula(item: EvaluatableItem, kidAnswer: string): LocalVerdict {
  const learner = parseMathLite(kidAnswer);
  if (!learner.ast || learner.errors.length > 0) return 'unknown';
  const learnerCanon = canonicalizeFormula(learner.ast);

  const refs: string[] = [];
  if (item.latex_expected) refs.push(item.latex_expected);
  if (item.expected_answer) refs.push(item.expected_answer);
  for (const a of item.latex_acceptable ?? []) refs.push(a);
  for (const a of item.acceptable_answers ?? []) refs.push(a);

  for (const ref of refs) {
    const refParsed = parseMathLite(stripLatexWrappers(ref));
    if (!refParsed.ast || refParsed.errors.length > 0) continue;
    if (canonicalizeFormula(refParsed.ast) === learnerCanon) return 'correct';
  }
  return 'unknown';
}

function stripLatexWrappers(s: string): string {
  // Tolerate raw LaTeX like `$x^2$` or `\frac{a}{b}` by stripping outer math
  // delimiters; the MathLite parser is forgiving enough for the rest in most
  // common cases. If it can't parse, evaluateFormula returns 'unknown' and
  // the LLM decides.
  return s.replace(/^\$+|\$+$/g, '').trim();
}

// ─── short / diagram_label ───────────────────────────────────────────────────

function evaluateShort(item: EvaluatableItem, kidAnswer: string): LocalVerdict {
  const a = normalizeShortAnswer(kidAnswer);
  if (a === '') return 'unknown';
  const refs = [item.expected_answer, ...(item.acceptable_answers ?? [])];
  for (const ref of refs) {
    const b = normalizeShortAnswer(ref);
    if (b === '') continue;
    if (tokenOverlap(a, b) >= 0.9 && lengthRatio(a, b) >= 0.7) return 'correct';
  }
  return 'unknown';
}

// ─── long ────────────────────────────────────────────────────────────────────

function evaluateLong(item: EvaluatableItem, kidAnswer: string): LocalVerdict {
  // Only catch obvious-wrong locally: empty answer or <25% of expected length.
  const a = kidAnswer.trim();
  if (a.length === 0) return 'incorrect';
  const expectedLen = item.expected_answer.trim().length;
  if (expectedLen > 0 && a.length < expectedLen * 0.25) return 'incorrect';
  return 'unknown';
}

// ─── fill_blank ──────────────────────────────────────────────────────────────

function evaluateFillBlank(item: EvaluatableItem, kidAnswer: string): LocalVerdict {
  // The mobile encodes the learner's blanks as a "||"-joined string in
  // the order they appear in fill_blank_template's `___` markers.
  const blanks = kidAnswer.split('||');
  const expected = item.fill_blank_answers ?? [];
  if (blanks.length !== expected.length) return 'unknown';
  let correctCount = 0;
  for (let i = 0; i < blanks.length; i++) {
    if (normalizeShortAnswer(blanks[i] ?? '') === normalizeShortAnswer(expected[i] ?? '')) {
      correctCount++;
    }
  }
  if (correctCount === expected.length) return 'correct';
  if (correctCount === 0) return 'incorrect';
  return 'unknown';
}
