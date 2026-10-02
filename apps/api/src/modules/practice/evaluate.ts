// Deterministic answer checks for the cases where exactness is decidable:
// multiple choice, written numbers (exact, or within the key's own rounding), exact matches
// of written answers, and named near misses. Anything else ("unknown") is judged by the tutor
// model. docs/architecture.md §Practice (grading); audit C-1–C-7, H-1–H-6, M-30.
// No word lists: this only compares the answer with the expected solution.
//
// A rule "correct" is final (no model sees the answer), so it is only said when it is certain:
// - numbers: the same value in the key's form (packages/shared-math numeric-input.ts); the
//   same value in another form (1/8 for 0.125) or a calculation (17·23 for 391) → the tutor;
// - math: the same text with every operator, sign and relation kept (canonicalMath);
// - words: the same text with case, ß and punctuation kept (canonicalText). A difference only
//   there is a near miss where spelling is the point (decision D-2: language subjects and
//   vocabulary, or an item marked strict) and otherwise for the tutor to judge gently.

import {
  canonicalMath,
  canonicalText,
  compareNumbers,
  isMathText,
  normalizeShortAnswer,
  parseCanonicalKey,
  parseNumericInput,
  plainMath,
  sameWrittenForm,
  type ValueComparison,
} from '@learnbuddy/shared-math';

export { plainMath };

export type ItemForCheck = {
  kind: 'short' | 'long' | 'numeric' | 'multiple_choice' | 'formula' | 'vocab' | 'speak';
  answer: string;
  accepted_answers: string[];
  unit: string | null;
  choices: string[] | null;
  correct_choice: number | null;
  /** An explicit ± tolerance for a rounded or measured number (migration 0012); else D-1. */
  tolerance: number | null;
  /** Whether case, ß and punctuation are the point (migration 0012); null: the subject decides. */
  spelling: 'strict' | 'gentle' | null;
  /** subjects.kind of the item's subject, when it has one. */
  subject_kind: string | null;
  /**
   * The question asks for an AMOUNT, not a notation (issue #162): set only for a question
   * whose text, picture and key code computed from a reviewed task (`practice/bars.ts`), so
   * code KNOWS no particular form was asked for — 2/4, 1/2 and 0,5 are then one answer and
   * a rule may say "correct" for any of them. Absent for everything the model wrote, where
   * decision D-3 stands: the same value in another form is the tutor's to judge, because
   * "Kürze $\frac{6}{8}$" is not answered by 6/8.
   */
  form_free?: boolean;
};

/**
 * Near misses on a written answer, decided without a model (the kind of check
 * Anki, Quizlet and LibreLingo do):
 * - 'spelling': the same except case, ß/ss or punctuation, where spelling is the point;
 * - 'close': the same except for accents/diacritics ("eleve" for "élève");
 * - 'missing_word': the key without its first word ("Küche" for "die Küche");
 * - 'typo': a small slip — Damerau distance within a limit that grows with the
 *   word (none up to 4 letters, 1 up to 8, else 2). A slip can also be another
 *   real word ("horse" for "house"), so it is never counted right: the app shows
 *   the spelling and she types it again. Never for numbers ("15:35" is no slip of "14:35").
 * 'folded' is no near miss: the same except case, ß/ss or punctuation where spelling is not
 * the point — the tutor judges it (gently), the rules don't.
 */
export type RuleVerdict =
  | 'correct'
  | 'spelling'
  | 'close'
  | 'missing_word'
  | 'typo'
  | 'folded'
  | 'incorrect'
  | 'unknown';

/** Near misses: partly right, not wrong. */
export const NEAR_MISS = new Set<RuleVerdict>(['spelling', 'close', 'missing_word', 'typo']);

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

/** Letters without accents: é → e. */
function withoutAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC');
}

/**
 * Subject kinds (subjects.kind) where spelling, case and punctuation are what is learnt.
 *
 * Latin is deliberately NOT in this set (issue #197). Its vocabulary still gets the strict
 * rule through `kind === 'vocab'` below — a Latin word form IS the thing being learnt. But a
 * Latin TRANSLATION is marked officially on the degree to which it conveys the sense of the
 * original, not on the German spelling it happens to use; rebuking a correct translation for
 * a comma claims a criterion that no curriculum applies
 * (`docs/lehrplan-und-uebungsformen.md` §8).
 */
const LANGUAGE_SUBJECTS: ReadonlySet<string> = new Set([
  'german',
  'english',
  'french',
  'spanish',
  'other_language',
]);

/**
 * A free text ("Erörtere …", "Nimm Stellung …", an Inhaltsangabe) has no single right
 * answer that could be shown. Its quality is the object, and the quality is not what
 * `items.answer` holds — at most 600 characters the model wrote as a key. So three things the
 * app does after a wrong try must not happen here (issue #197, CLAUDE.md rule 5):
 *
 *   - no "Die Lösung ist …", because there is none to state;
 *   - no FSRS rating, because `Again` would record a memory judgement nobody measured;
 *   - no named weakness in the summary, for the same reason.
 *
 * A prepared `worked_solution` stays allowed: it shows ONE way, not THE answer — and says so.
 * `docs/lehrplan-und-uebungsformen.md` §0 calls this class H: here code may claim nothing, and
 * the model may not call a whole text wrong either.
 */
export function noSingleSolution(item: { kind: string }): boolean {
  return item.kind === 'long';
}

/** Decision D-2: set per item; by default strict for vocabulary and language subjects. */
export function spellingOf(
  item: Pick<ItemForCheck, 'kind' | 'spelling' | 'subject_kind'>,
): 'strict' | 'gentle' {
  if (item.spelling) return item.spelling;
  // A free text is never rebuked for its form: in a text of several sentences a comma is not
  // what is being asked, and in reading or listening comprehension marking language is
  // expressly forbidden (`docs/lehrplan-und-uebungsformen.md` §7, issue #197).
  if (noSingleSolution(item)) return 'gentle';
  return item.kind === 'vocab' ||
    (item.subject_kind !== null && LANGUAGE_SUBJECTS.has(item.subject_kind))
    ? 'strict'
    : 'gentle';
}

type KeyedItem = {
  answer: string;
  accepted_answers: readonly string[];
  unit: string | null;
  tolerance?: number | null;
};

/**
 * The value comparison against every key of an item (answer and accepted answers), for any
 * caller that needs "does she state the right number?" — the rule check below and homework
 * help (audit I-3). 'equal' when one key has the learner's value (in any form: 0,75 for
 * $\frac{3}{4}$), 'different' when every key is a number and none has it, else 'unknown'
 * (words, a calculation, another unit, an ambiguous "1.000"). Tolerance: decision D-1.
 */
export function compareWithKeys(item: KeyedItem, text: string): ValueComparison {
  const given = parseNumericInput(text);
  const results = [item.answer, ...item.accepted_answers].map((k) =>
    compareNumbers(given, parseCanonicalKey(k), {
      unit: item.unit,
      tolerance: item.tolerance ?? null,
    }),
  );
  if (results.includes('equal')) return 'equal';
  if (results.length > 0 && results.every((r) => r === 'different')) return 'different';
  return 'unknown';
}

/** The learner wrote this key's number, in its form (a rule can say "correct"). */
function sameNumber(item: ItemForCheck, key: string, text: string): boolean {
  const given = parseNumericInput(text);
  const k = parseCanonicalKey(key);
  return (
    compareNumbers(given, k, { unit: item.unit, tolerance: item.tolerance }) === 'equal' &&
    sameWrittenForm(given, k)
  );
}

/** Does a typed or spoken text name this option, however it is written? */
function namesOption(option: string, text: string): boolean {
  if (isMathText(option) || isMathText(text)) {
    const t = canonicalMath(text);
    if (t !== '' && t === canonicalMath(option)) return true;
    const given = parseNumericInput(text);
    const k = parseCanonicalKey(option);
    return compareNumbers(given, k) === 'equal' && sameWrittenForm(given, k);
  }
  const t = normalizeShortAnswer(text);
  return t !== '' && t === normalizeShortAnswer(option);
}

/**
 * The option a spoken or typed answer names, or null: the option itself however it is
 * written ("2/3" for $\frac{2}{3}$, "richtig" for "Richtig"), or its letter as voice mode reads
 * them ("B", "b."). Only when exactly one option fits: a letter that is also another option's
 * text ("A" with the options the, a, an — audit H-5) and an option with more words after it
 * ("Richtig ist das nicht" — audit M-30) are left to the tutor.
 */
export function choiceNamed(text: string, choices: readonly string[]): number | null {
  const t = text.trim();
  const named = choices.flatMap((c, i) => (namesOption(c, t) ? [i] : []));
  const letter = /^([a-z])[.)]?$/i.exec(t);
  const index = letter ? letter[1]!.toLowerCase().charCodeAt(0) - 97 : -1;
  const byLetter = index >= 0 && index < choices.length ? index : null;
  if (named.length > 1) return null;
  if (named.length === 1) return byLetter === null || byLetter === named[0] ? named[0]! : null;
  return byLetter;
}

const STRENGTH: readonly RuleVerdict[] = [
  'correct',
  'spelling',
  'close',
  'missing_word',
  'typo',
  'folded',
  'unknown',
];

/** A written answer against one key. */
function writtenAgainst(item: ItemForCheck, key: string, text: string): RuleVerdict {
  if (item.kind === 'formula' || isMathText(key) || isMathText(text)) {
    // Math: every operator, sign and relation counts (x=5 is not x=-5, 3,4 is not 3/4).
    if (canonicalMath(text) === canonicalMath(key)) return 'correct';
    return sameNumber(item, key, text) ? 'correct' : 'unknown';
  }
  if (canonicalText(text) === canonicalText(key)) return 'correct';
  const said = normalizeShortAnswer(text);
  const wanted = normalizeShortAnswer(key);
  if (said === '' || wanted === '') return 'unknown';
  if (said === wanted) return spellingOf(item) === 'strict' ? 'spelling' : 'folded';
  const saidPlain = withoutAccents(said);
  const wantedPlain = withoutAccents(wanted);
  if (saidPlain === wantedPlain) return 'close';
  if (item.kind === 'vocab' || item.kind === 'short') {
    const words = wanted.split(' ');
    if (words.length >= 2 && words.slice(1).join(' ') === said) return 'missing_word';
    const slips = allowedSlips(wanted);
    if (slips > 0 && editDistance(saidPlain, wantedPlain) <= slips) return 'typo';
  }
  return 'unknown';
}

function numericVerdict(item: ItemForCheck, text: string): RuleVerdict {
  const given = parseNumericInput(text);
  // Not a number, or a calculation (17·23 for 391 — the task typed again, audit H-1): the tutor.
  if (given.value === null || given.form === 'expression') return 'unknown';
  let equalInOtherForm = false;
  let allDifferent = true;
  for (const keyText of [item.answer, ...item.accepted_answers]) {
    const key = parseCanonicalKey(keyText);
    const c = compareNumbers(given, key, { unit: item.unit, tolerance: item.tolerance });
    if (c === 'equal') {
      // The question asks for an amount (issue #162): any way of writing it is the answer.
      if (item.form_free === true || sameWrittenForm(given, key)) return 'correct';
      equalInOtherForm = true;
    }
    if (c !== 'different') allDifferent = false;
  }
  if (equalInOtherForm) return 'unknown'; // decision D-3: another form is for the tutor
  return allDifferent ? 'incorrect' : 'unknown';
}

export function ruleCheck(
  item: ItemForCheck,
  answer: { text: string | null; choice: number | null },
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
  if (item.kind === 'numeric') return numericVerdict(item, text);

  // short / long / formula / vocab: the strongest verdict over the key and its accepted answers.
  const verdicts = [item.answer, ...item.accepted_answers].map((k) =>
    writtenAgainst(item, k, text),
  );
  return STRENGTH.find((v) => verdicts.includes(v)) ?? 'unknown';
}

/**
 * A plain number whose value differs from every expected number: wrong for
 * sure. Not for homework — there "12" may be a right step towards 11/12. The same value in
 * another form ("4/8" for "1/2") is not decided here: it may still be wrong (not reduced).
 */
export function differentNumber(item: ItemForCheck, text: string): boolean {
  if (item.kind !== 'short' && item.kind !== 'formula' && item.kind !== 'numeric') return false;
  return compareWithKeys(item, text) === 'different';
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
