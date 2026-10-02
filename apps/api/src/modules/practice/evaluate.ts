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
//
// Where comparing the CHARACTERS decides nothing, the VALUE still can (issue #227, findings 5
// and 8): algebra against algebra (`steps.ts`), a date, a clock time and a year inside a
// sentence (`dates.ts`) — see `byValue` at the bottom. And where the value is the key's, the
// FORM is read off the syntax tree (issue #235, `form.ts`): the same summands in another order
// are right, the task's own term typed back is a near miss, and only a real change of form —
// factored against expanded — is left to the tutor. Several values (a system's solution, a
// point, a list) are compared one by one (issue #263, `systems.ts`), a nuclear equation is
// counted (`nuclear.ts`).

import { isStructuredKind, type ItemKind } from '@learnbuddy/shared-types/contracts';

import {
  checkEquation,
  type EquationFault,
  looksLikeEquation,
  sameRatio,
  sameSubstance,
} from './chemistry.js';
import { isYear, sameClockTime, sameDate, yearIn } from './dates.js';
import { type FormNote, judgeAlgebra, typedBack } from './form.js';
import { checkNuclear, looksNuclear, type NuclearImbalance } from './nuclear.js';
import { checkPath, lastValue, solvedValue } from './steps.js';
import { sameAssignments, sameList, samePoint } from './systems.js';
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
  /** Structured kinds (#228–#230) never reach `ruleCheck`: their parts are checked in structured.ts. */
  kind: ItemKind;
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
   * The question as printed. Only read to see whether an answer is the task's own term typed
   * back (issue #235, `form.ts` `typedBack`) — never to decide what the question asks.
   */
  prompt?: string;
  /**
   * The question asks for an AMOUNT, not a notation (issue #162): set only for a question
   * whose text, picture and key code computed from a reviewed task (`practice/bars.ts`), so
   * code KNOWS no particular form was asked for — 2/4, 1/2 and 0,5 are then one answer and
   * a rule may say "correct" for any of them. Absent for everything the model wrote, where
   * decision D-3 stands: the same value in another form is the tutor's to judge, because
   * "Kürze $\frac{6}{8}$" is not answered by 6/8.
   */
  form_free?: boolean;
  /**
   * The question is answered from HEARING a spoken text (issue #210): `items.listen_task` is
   * set. Then only the CONTENT is judged — in a listening task the curriculum expressly does
   * not mark language ("sprachliche Verstöße werden nicht gewertet", NRW Sek I;
   * `docs/lehrplan-und-uebungsformen.md` §7.3, issue #197). A word she heard right and typed
   * with a slip of the pen is right, and `contentOnly` below is where that is said once.
   */
  listening?: boolean;
  /**
   * The question is about a text she READ (issue #233): `items.read_passage` is set. Judged
   * like a listening question — the content, never the language (§7.3, issue #197).
   */
  reading?: boolean;
};

/**
 * Verdicts that are about the FORM of a written answer and not about what she understood:
 * capitalisation, an accent, a dropped first word, a slip of the pen. Everywhere else they
 * are a near miss she fixes herself — in a listening task they are the answer.
 */
const FORM_ONLY: ReadonlySet<RuleVerdict> = new Set([
  'spelling',
  'close',
  'missing_word',
  'typo',
  'folded',
]);

/**
 * The verdict for a question where only the content counts (issue #210). A form near miss
 * becomes 'correct'; everything else is untouched — a wrong answer stays wrong, and something
 * undecidable still goes to the tutor.
 *
 * This is the one place that licence lives, and it is read off the stored text, never off a
 * subject or a guess: without a spoken text on the question nothing calls it.
 */
export function contentOnly(verdict: RuleVerdict): RuleVerdict {
  return FORM_ONLY.has(verdict) ? 'correct' : verdict;
}

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
  /** A written path whose steps stop following each other (issue #209). */
  | 'step_broke'
  /** The same value, written another way: right in value, and the FORM is the question. */
  | 'other_form'
  /**
   * The same value because it IS the task's own term or equation, typed back while the key is a
   * transformed one ("Faktorisiere x²+2x+1" → "x²+2x+1", issue #235). Right in value, and the
   * transformation the question is about has not happened yet.
   */
  | 'not_transformed'
  /**
   * A note line she wrote where some of it holds and some does not (issue #226). It never comes
   * out of a per-key comparison — `staff.ts` compares note by note and sets it — so it is
   * deliberately absent from `STRENGTH` below, which only aggregates per-key verdicts.
   */
  | 'parts_left'
  /** A reaction equation whose atoms or charge do not add up (issue #212). */
  | 'unbalanced'
  /** Balanced, but every coefficient divisible by the same number: right, not yet reduced. */
  | 'not_lowest'
  | 'incorrect'
  | 'unknown';

/** Near misses: partly right, not wrong. */
export const NEAR_MISS = new Set<RuleVerdict>([
  'spelling',
  'close',
  'missing_word',
  'typo',
  // The substances are hers and right; the counting is not finished. Wrong would be unfair
  // and unhelpful, and the question stays open so she fixes it herself (issue #212).
  'unbalanced',
  'not_lowest',
  // The way is hers and most of it holds; one step does not follow. Wrong would throw away
  // everything that was right, which is what the class test does NOT do (issue #209).
  'step_broke',
  // The value is the key's because nothing was done to the task's term: not wrong, and not the
  // answer either (issue #235). She is told what code saw and transforms it herself.
  'not_transformed',
  // Three of four notes in a line she wrote: the same argument one form further (issue #226).
  // Partly right, so the question stays open and she fixes what does not hold — it is not a
  // score, and it is not a grade (see `staff.ts`).
  'parts_left',
]);

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
  item: Pick<ItemForCheck, 'kind' | 'spelling' | 'subject_kind' | 'listening' | 'reading'>,
): 'strict' | 'gentle' {
  if (item.spelling) return item.spelling;
  // Listening: how she spells a word she HEARD is not what the question asks, and marking it
  // is what §7.3 of the curriculum report forbids (issue #210, #197). Before the per-item
  // mark could be trusted here, because the default for a language subject — which every
  // listening task is — goes the other way.
  if (item.listening === true || item.reading === true) return 'gentle';
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
  // The letter AND the option, the way a worksheet answer is written: "a) 1/2" (#227 A9). Only
  // when both name the same option; a letter that points elsewhere leaves it to the tutor.
  const both = /^([a-z])[.)]\s+(\S.*)$/i.exec(t);
  if (both) {
    const at = both[1]!.toLowerCase().charCodeAt(0) - 97;
    const rest = choiceNamed(both[2]!, choices);
    return at < choices.length && rest === at ? at : null;
  }
  const named = choices.flatMap((c, i) => (namesOption(c, t) ? [i] : []));
  const letter = /^([a-z])[.)]?$/i.exec(t);
  const index = letter ? letter[1]!.toLowerCase().charCodeAt(0) - 97 : -1;
  const byLetter = index >= 0 && index < choices.length ? index : null;
  if (named.length > 1) return null;
  if (named.length === 1) return byLetter === null || byLetter === named[0] ? named[0]! : null;
  if (byLetter !== null) return byLetter;
  // The value of exactly one option, written another way ("0,5" for ½, #227 A9). Choosing is
  // the question, not the notation — but only when no other option has that value too.
  const given = parseNumericInput(t);
  if (given.value === null || given.form === 'expression') return null;
  const byValue = choices.flatMap((c, i) =>
    compareNumbers(given, parseCanonicalKey(c)) === 'equal' ? [i] : [],
  );
  return byValue.length === 1 ? byValue[0]! : null;
}

const STRENGTH: readonly RuleVerdict[] = [
  'correct',
  'spelling',
  'close',
  'missing_word',
  'typo',
  // Counting is certain, so it outranks "I cannot tell" — but never a match against a key.
  'not_lowest',
  'unbalanced',
  'step_broke',
  'other_form',
  'folded',
  'unknown',
];

/**
 * What kind of slip a typo was — read off the two strings, nothing guessed about the
 * language (issue #207). Until now a typo was answered with the correct spelling at once,
 * so the next "Richtig" was copying rather than knowing. This says WHAT slipped, so she
 * finds it herself; the spelling follows on the second try.
 */
export type TypoShape = 'missing' | 'extra' | 'swapped' | 'wrong';

/**
 * The slip against the key she came closest to — the rules compare against the answer and
 * every accepted answer, so the hint has to talk about the one she nearly wrote.
 */
export function typoShapeFor(
  item: Pick<ItemForCheck, 'answer' | 'accepted_answers'>,
  text: string,
): TypoShape {
  const said = withoutAccents(normalizeShortAnswer(text));
  let best = withoutAccents(normalizeShortAnswer(item.answer));
  let bestDistance = editDistance(said, best);
  for (const alt of item.accepted_answers) {
    const key = withoutAccents(normalizeShortAnswer(alt));
    const d = editDistance(said, key);
    if (d < bestDistance) {
      best = key;
      bestDistance = d;
    }
  }
  return typoShape(best, said);
}

/** Exported for the tests; `typoShapeFor` picks the key first. */
export function typoShape(wanted: string, said: string): TypoShape {
  if (said.length < wanted.length) return 'missing';
  if (said.length > wanted.length) return 'extra';
  // Same length: two neighbours the wrong way round is the slip a learner recognises
  // instantly once named, and it is the one case where "ein Buchstabe stimmt nicht" would
  // send her looking in the wrong place.
  const differs: number[] = [];
  for (let i = 0; i < wanted.length; i++) {
    if (wanted[i] !== said[i]) differs.push(i);
  }
  if (differs.length === 2) {
    const [i, j] = differs as [number, number];
    if (j === i + 1 && wanted[i] === said[j] && wanted[j] === said[i]) return 'swapped';
  }
  return 'wrong';
}

/** A written answer against one key. */
function writtenAgainst(item: ItemForCheck, key: string, text: string): RuleVerdict {
  // Counted before compared (issue #212): a reaction equation written in another order is the
  // same equation, and no string comparison can see that. What is not countable — different
  // substances, a hydrate, a structural formula — falls through to everything below.
  // A nuclear equation is counted by mass and atomic numbers (issue #263) — before chemistry,
  // whose element counting cannot read a mass number.
  if (looksNuclear(key)) {
    const nuc = checkNuclear(key, text);
    if (nuc.verdict !== 'unknown') return nuc.verdict;
  } else if (looksLikeEquation(key)) {
    const eq = checkEquation(key, text);
    if (eq.verdict !== 'unknown') return eq.verdict;
  }
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
  // Decision D-3 stands: whether the FORM matters ("4/8" for "1/2" may still be unreduced) is
  // the tutor's call, not the rules'. But it used to be handed over as "not decidable", and the
  // tutor is allowed to say WRONG to that — about an answer whose value code had just confirmed
  // (issue #227, finding 1). It now goes over as what it is: right in value, the form open.
  if (equalInOtherForm) return 'other_form';
  return allDifferent ? 'incorrect' : 'unknown';
}

/**
 * Why a reaction equation is not finished, against whichever key it was counted against
 * (issue #212). Separate from `ruleCheck` so the verdict stays a plain enum and only the
 * reply needs the detail.
 */
export type CountFault =
  | EquationFault
  /** A nuclear equation whose mass or atomic numbers do not add up (issue #263). */
  | { verdict: 'unbalanced'; imbalance: NuclearImbalance };

export function equationDetail(
  item: Pick<ItemForCheck, 'answer' | 'accepted_answers'>,
  text: string,
): CountFault | null {
  for (const key of [item.answer, ...item.accepted_answers]) {
    if (looksNuclear(key)) {
      const n = checkNuclear(key, text);
      if (n.verdict === 'unbalanced') return n;
      continue;
    }
    if (!looksLikeEquation(key)) continue;
    const v = checkEquation(key, text);
    if (v.verdict === 'unbalanced' || v.verdict === 'not_lowest') return v;
  }
  return null;
}

/**
 * One key against the answer, by VALUE where comparing the characters said nothing: algebra
 * (issue #227, finding 5), a date, a clock time, a year inside a sentence (finding 8), several
 * values (issue #263). 'same_form' means the value is the key's and the form is the key's up to
 * the order of its parts; 'same' the value with another notation; 'typed_back' the value because
 * it is the task's own term (issue #235); 'different' certainly another value; null undecidable,
 * which is most of the world.
 */
type ByValue = 'same_form' | 'same' | 'typed_back' | 'different';

function byValueAgainst(item: ItemForCheck, key: string, text: string): ByValue | null {
  // Several values: a system's solution, a point, a list.
  const several = sameAssignments(key, text) ?? samePoint(key, text) ?? sameList(key, text);
  if (several !== null) {
    return several === 'correct' ? 'same_form' : several === 'other_form' ? 'same' : 'different';
  }
  const algebra = judgeAlgebra(key, text);
  if (algebra !== null) {
    if (algebra.verdict === 'different') return 'different';
    if (algebra.sameForm) return 'same_form';
    if (item.prompt !== undefined && typedBack(item.prompt, key, text)) return 'typed_back';
    return 'same';
  }
  // The value a solved key states, written without naming the variable: "-5" for "x = 5" is a
  // different value, "5" is the same one in another notation. Compared with the numeric rules,
  // so the key's tolerance and unit keep deciding what they already decide (D-1).
  const solved = solvedValue(key);
  if (solved !== null) {
    const c = compareNumbers(parseNumericInput(text), parseCanonicalKey(solved), {
      unit: item.unit,
      tolerance: item.tolerance,
    });
    if (c !== 'unknown') return c === 'equal' ? 'same' : 'different';
  }
  const date = sameDate(key, text);
  if (date !== null) return date;
  if (sameClockTime(key, text)) return 'same';
  // A year inside a sentence: only a DIFFERENT one is decided. A sentence that names the right
  // year can still be missing everything else the question asked for, and code cannot read that.
  if (isYear(key)) {
    const stated = yearIn(text);
    if (
      stated !== null &&
      compareNumbers(parseNumericInput(stated), parseCanonicalKey(key), {
        unit: item.unit,
        tolerance: item.tolerance,
      }) === 'different'
    ) {
      return 'different';
    }
  }
  return null;
}

/**
 * What the characters could not decide, the value still can (issue #227, findings 5 and 8).
 * The verdicts are the ones decision D-3 already set: a different value is 'incorrect', the same
 * value in another notation is 'other_form' — right in value, with the form left to the tutor,
 * who may never call it wrong for the value (issue #227, finding 1, `enforceTutorInvariants`).
 * The same value in the key's own form up to order is 'correct' (issue #235): "6+2x" for 2x+6
 * is not another form, it is the same summands, and there is nothing left to judge.
 *
 * 'incorrect' needs EVERY key to be certainly different, the way the numeric rules do it: one
 * key this cannot read leaves the question open.
 */
function byValue(item: ItemForCheck, text: string): RuleVerdict | null {
  // A free text has no single right answer to compare against: here code claims nothing
  // (issue #197, `noSingleSolution`).
  if (noSingleSolution(item)) return null;
  const keys = [item.answer, ...item.accepted_answers];
  const found = keys.map((key) => byValueAgainst(item, key, text));
  if (found.includes('same_form')) return 'correct';
  if (found.includes('same')) return 'other_form';
  if (found.includes('typed_back')) return 'not_transformed';
  return keys.length > 0 && found.every((c) => c === 'different') ? 'incorrect' : null;
}

/**
 * What code can say about the FORM of an answer whose value is right (issue #235), for the
 * tutor: which shape the key and the answer have, a missing constant of integration, an
 * equation not solved for the key's variable. Null when there is nothing to add.
 */
export function formNoteFor(
  item: Pick<ItemForCheck, 'answer' | 'accepted_answers'>,
  text: string,
): FormNote | null {
  for (const key of [item.answer, ...item.accepted_answers]) {
    const j = judgeAlgebra(key, text);
    if (j?.verdict === 'same' && j.note !== null) return j.note;
  }
  return null;
}

export function ruleCheck(
  item: ItemForCheck,
  answer: { text: string | null; choice: number | null },
): RuleVerdict {
  // A structured answer (issues #228–#230) is never one value against one key: `structured.ts`
  // compares every part and this function has nothing to say about it. Saying so here rather
  // than letting it fall through to `writtenAgainst` keeps her arrangement in words from being
  // compared, as a string, with the solution in words — which would occasionally say "correct"
  // for the wrong reason.
  if (isStructuredKind(item.kind)) return 'unknown';
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

  const written = (answer.text ?? '').trim();
  if (!written) return 'unknown';

  // A written path, checked step by step (issue #209). Only where a calculation is plausible:
  // a free text is many lines of prose, and `checkPath` leaves that alone anyway, but saying so
  // here keeps the intent readable. A sound path is then judged on its LAST line — the value it
  // arrives at — so a correct way with the right result counts as right.
  let text = written;
  if (item.kind === 'numeric' || item.kind === 'formula' || item.kind === 'short') {
    const path = checkPath(written);
    if (path.kind === 'broke') return 'step_broke';
    if (path.kind === 'sound') text = lastValue(written) ?? written;
  }

  if (item.kind === 'numeric') return numericVerdict(item, text);

  // A single chemical formula, counted instead of compared as text (issue #227, finding 6):
  // "H₂SO₄" and "H2SO4" are the same substance, "H2SO3" is certainly another one. Only when
  // BOTH sides are unmistakably a formula — a name or a single capital letter is not.
  for (const key of [item.answer, ...item.accepted_answers]) {
    const same = sameSubstance(key, text);
    if (same === 'same') return 'correct';
    if (same === 'different') return 'incorrect';
  }

  // A ratio — a Punnett cross, an inheritance pattern — compared reduced, and ONLY when the
  // key is a ratio too: the same characters mean division everywhere else, and deciding which
  // from context would be guessing (rule 3, issue #175). This sits here rather than in
  // `writtenAgainst` because a wrong ratio is certainly wrong, and STRENGTH deliberately drops
  // a per-key 'incorrect' — a written answer that matches no key is 'unknown', not wrong.
  for (const key of [item.answer, ...item.accepted_answers]) {
    const ratio = sameRatio(key, text);
    if (ratio === true) return 'correct';
    if (ratio === false) return 'incorrect';
  }

  // short / long / formula / vocab: the strongest verdict over the key and its accepted answers.
  const verdicts = [item.answer, ...item.accepted_answers].map((k) =>
    writtenAgainst(item, k, text),
  );
  const strongest = STRENGTH.find((v) => verdicts.includes(v)) ?? 'unknown';
  // Only where the characters decided nothing: what they could not say, the value still can
  // (issue #227, findings 5 and 8).
  const verdict: RuleVerdict =
    strongest === 'unknown' ? (byValue(item, text) ?? 'unknown') : strongest;
  // Listening (issue #210): she heard it, and what she understood is the whole question — so a
  // slip of the pen is not a near miss to fix, it is the right answer. Last, because it softens
  // whatever verdict the comparison arrived at, including one the value decided.
  // The same for a text she read (issue #233): understanding is the question, not spelling.
  return item.listening === true || item.reading === true ? contentOnly(verdict) : verdict;
}

/**
 * A plain number whose value differs from every expected number: wrong for
 * sure. Not for homework — there "12" may be a right step towards 11/12. The same value in
 * another form ("4/8" for "1/2") is not decided here: it may still be wrong (not reduced).
 */
export function differentNumber(item: ItemForCheck, text: string): boolean {
  if (item.kind !== 'short' && item.kind !== 'formula' && item.kind !== 'numeric') return false;
  if (compareWithKeys(item, text) === 'different') return true;
  // A typed CALCULATION whose value is already wrong (issue #227, finding 7): "17·22" where the
  // answer is 391. The value is computed and it is not the key's, so nothing is left to judge.
  //
  // The asymmetry is the point: a calculation whose value MATCHES is the task typed back rather
  // than answered (audit H-1), and that is not "wrong" — it stays for the tutor. So only a
  // differing value is decided here, never a matching one.
  const given = parseNumericInput(text);
  if (given.form !== 'expression' || given.value === null) return false;
  const keys = [item.answer, ...item.accepted_answers].map((k) => parseCanonicalKey(k));
  if (keys.length === 0 || keys.some((k) => k.value === null || k.unit !== item.unit)) return false;
  return keys.every(
    (k) =>
      Math.abs((k.value as number) - (given.value as number)) >
      1e-9 * Math.max(1, Math.abs(k.value as number)),
  );
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
