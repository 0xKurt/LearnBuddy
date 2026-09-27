import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  choiceNamed,
  compareWithKeys,
  differentNumber,
  editDistance,
  ruleCheck,
  spellingOf,
  valuesIn,
  type ItemForCheck,
  type RuleVerdict,
} from '../evaluate.js';

const base: ItemForCheck = {
  kind: 'short',
  answer: '',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  tolerance: null,
  spelling: null,
  subject_kind: null,
};
const item = (over: Partial<ItemForCheck>): ItemForCheck => ({ ...base, ...over });
const check = (it: ItemForCheck, text: string) => ruleCheck(it, { text, choice: null });

const mc = item({
  kind: 'multiple_choice',
  answer: '$\\frac{2}{3}$',
  choices: ['$\\frac{2}{3}$', '$\\frac{3}{5}$'],
  correct_choice: 0,
});

describe('ruleCheck', () => {
  it('matches a spoken or typed choice however the choice is written', () => {
    expect(check(mc, '2/3')).toBe('correct');
    expect(check(mc, '3/5')).toBe('incorrect');
    expect(check(mc, 'keine Ahnung')).toBe('unknown');
  });

  it('treats typed 3/4 and a stored \\frac{3}{4} as the same short answer', () => {
    expect(check(item({ answer: '$\\frac{3}{4}$' }), '3/4')).toBe('correct');
  });

  it('calls a translation with missing accents close, not right', () => {
    expect(check(item({ kind: 'vocab', answer: "l'élève" }), "l'eleve")).toBe('close');
  });
});

/**
 * The grading truth table (audit §15.1): (kind, key, answer, locale the learner writes in) →
 * the verdicts allowed. A right answer is never 'incorrect'; a wrong one is never 'correct'.
 * The check does not depend on the app language: the locale column says how the learner wrote.
 */
type Row = {
  id: string;
  item: Partial<ItemForCheck>;
  text: string;
  locale: 'de' | 'fr' | 'es' | 'it' | 'en';
  expect: RuleVerdict | RuleVerdict[];
};

const numeric = (answer: string, over: Partial<ItemForCheck> = {}) => ({
  kind: 'numeric' as const,
  answer,
  ...over,
});

const TABLE: Row[] = [
  // C-1: a three-decimal key is a decimal for every learner.
  ...(['de', 'fr', 'es', 'it', 'en'] as const).flatMap((locale): Row[] => [
    { id: 'C-1', item: numeric('0.125'), text: '0,125', locale, expect: 'correct' },
    { id: 'C-1', item: numeric('0.125'), text: '125', locale, expect: 'incorrect' },
    { id: 'C-1', item: numeric('2.375'), text: '2,375', locale, expect: ['correct', 'unknown'] },
    { id: 'C-1', item: numeric('1.250'), text: '1,25', locale, expect: 'correct' },
    { id: 'C-1', item: numeric('0.001'), text: '1', locale, expect: 'incorrect' },
    { id: 'C-1', item: numeric('0.125'), text: '1/8', locale, expect: 'unknown' },
  ]),
  { id: 'C-1', item: numeric('0.125'), text: '0.125', locale: 'en', expect: 'correct' },
  // H-2: "0,125" for an English profile is not 125.
  { id: 'H-2', item: numeric('0.125'), text: '0,125', locale: 'en', expect: 'correct' },
  // C-2: no blanket 1 % tolerance.
  { id: 'C-2', item: numeric('240'), text: '242', locale: 'de', expect: 'incorrect' },
  { id: 'C-2', item: numeric('100'), text: '101', locale: 'de', expect: 'incorrect' },
  { id: 'C-2', item: numeric('1000'), text: '1009', locale: 'de', expect: 'incorrect' },
  { id: 'C-2', item: numeric('1000'), text: '999', locale: 'de', expect: 'incorrect' },
  { id: 'C-2', item: numeric('753'), text: '750', locale: 'de', expect: 'incorrect' },
  { id: 'C-2', item: numeric('12'), text: '12,1', locale: 'de', expect: 'incorrect' },
  { id: 'C-2', item: numeric('0.01'), text: '0,02', locale: 'de', expect: 'incorrect' },
  {
    id: 'C-2',
    item: numeric('240', { unit: 'cm' }),
    text: '242 cm',
    locale: 'de',
    expect: 'incorrect',
  },
  { id: 'C-2', item: numeric('240'), text: '2*121', locale: 'de', expect: 'unknown' },
  // D-1: a decimal key accepts what rounds to it; an explicit tolerance only when declared.
  { id: 'D-1', item: numeric('3.14'), text: '3,1416', locale: 'de', expect: 'correct' },
  { id: 'D-1', item: numeric('3.14'), text: '3,1', locale: 'de', expect: 'incorrect' },
  {
    id: 'D-1',
    item: numeric('4.5', { tolerance: 0.2 }),
    text: '4,6',
    locale: 'de',
    expect: 'correct',
  },
  {
    id: 'D-1',
    item: numeric('4.5', { tolerance: 0.2 }),
    text: '4,8',
    locale: 'de',
    expect: 'incorrect',
  },
  // C-3: mixed numbers.
  { id: 'C-3', item: numeric('3.5'), text: '3 1/2', locale: 'de', expect: ['correct', 'unknown'] },
  {
    id: 'C-3',
    item: numeric('1.5', { unit: 'h' }),
    text: '1 1/2 h',
    locale: 'de',
    expect: ['correct', 'unknown'],
  },
  { id: 'C-3', item: numeric('3 1/2'), text: '3,5', locale: 'de', expect: ['correct', 'unknown'] },
  { id: 'C-3', item: numeric('3 1/2'), text: '3 1/2', locale: 'de', expect: 'correct' },
  { id: 'C-3', item: numeric('3.5'), text: '15,5', locale: 'de', expect: 'incorrect' },
  // C-4: percent is a unit.
  ...(['25%', '25 %', '25 Prozent', '25'] as const).map(
    (text): Row => ({
      id: 'C-4',
      item: numeric('25', { unit: '%' }),
      text,
      locale: 'de',
      expect: 'correct',
    }),
  ),
  { id: 'C-4', item: numeric('25 %'), text: '25', locale: 'de', expect: 'correct' },
  {
    id: 'C-4',
    item: numeric('25', { unit: '%' }),
    text: '0,25',
    locale: 'de',
    expect: 'incorrect',
  },
  // H-1: the task typed again is not a computed result.
  { id: 'H-1', item: numeric('391'), text: '17·23', locale: 'de', expect: 'unknown' },
  { id: 'H-1', item: numeric('12'), text: '√144', locale: 'de', expect: 'unknown' },
  { id: 'H-1', item: numeric('0.75'), text: '1/2+1/4', locale: 'de', expect: 'unknown' },
  // accepted answers count in the numeric branch too.
  {
    id: 'C-1',
    item: numeric('0.5', { accepted_answers: ['1/2'] }),
    text: '1/2',
    locale: 'de',
    expect: 'correct',
  },
  // H-6: nothing expensive runs.
  { id: 'H-6', item: numeric('3'), text: '1:1e8', locale: 'de', expect: 'unknown' },
  { id: 'H-6', item: numeric('3'), text: 'ones(9000,9000)', locale: 'de', expect: 'unknown' },
  // C-5: a LaTeX mixed key is 3½.
  {
    id: 'C-5',
    item: { answer: '$3\\frac{1}{2}$' },
    text: '7/2',
    locale: 'de',
    expect: ['correct', 'unknown'],
  },
  {
    id: 'C-5',
    item: { answer: '$3\\frac{1}{2}$' },
    text: '3,5',
    locale: 'de',
    expect: ['correct', 'unknown'],
  },
  {
    id: 'C-5',
    item: { answer: '$3\\frac{1}{2}$' },
    text: '31/2',
    locale: 'de',
    expect: ['incorrect', 'unknown'],
  },
  {
    id: 'C-5',
    item: { answer: '$3\\frac{1}{2}$' },
    text: '3 1/2',
    locale: 'de',
    expect: 'correct',
  },
  {
    id: 'C-5',
    item: { answer: '$1\\frac{11}{20}$' },
    text: '1,55',
    locale: 'de',
    expect: ['correct', 'unknown'],
  },
  // C-6: operators, signs and relations count.
  {
    id: 'C-6',
    item: { kind: 'formula', answer: '$x^{2}+2x$' },
    text: 'x^2-2x',
    locale: 'de',
    expect: 'unknown',
  },
  {
    id: 'C-6',
    item: { kind: 'formula', answer: '$x^{2}+2x$' },
    text: 'x² + 2x',
    locale: 'de',
    expect: 'correct',
  },
  { id: 'C-6', item: { answer: 'x=-5' }, text: 'x=5', locale: 'de', expect: 'unknown' },
  { id: 'C-6', item: { answer: 'x<3' }, text: 'x>3', locale: 'de', expect: 'unknown' },
  { id: 'C-6', item: { answer: '$\\frac{3}{4}$' }, text: '3,4', locale: 'de', expect: 'unknown' },
  { id: 'C-6', item: { answer: '$\\frac{3}{4}$' }, text: '3-4', locale: 'de', expect: 'unknown' },
  { id: 'C-6', item: { answer: '$\\frac{3}{4}$' }, text: '3:4', locale: 'de', expect: 'unknown' },
  { id: 'C-6', item: { answer: '-5' }, text: '5', locale: 'de', expect: 'unknown' },
  { id: 'C-6', item: { answer: '$-\\frac{3}{4}$' }, text: '3/4', locale: 'de', expect: 'unknown' },
  {
    id: 'C-6',
    item: { kind: 'formula', answer: 'X^2' },
    text: 'x^2',
    locale: 'de',
    expect: 'unknown',
  },
  { id: 'C-6', item: { answer: '0.75' }, text: '0,75', locale: 'de', expect: 'correct' },
  // C-7 / D-2: case, ß and punctuation.
  {
    id: 'C-7',
    item: { answer: 'ß', subject_kind: 'german' },
    text: 'ss',
    locale: 'de',
    expect: 'spelling',
  },
  {
    id: 'C-7',
    item: { answer: 'Straße', subject_kind: 'german' },
    text: 'Strasse',
    locale: 'de',
    expect: 'spelling',
  },
  {
    id: 'C-7',
    item: { answer: 'weiß', subject_kind: 'german' },
    text: 'weiss',
    locale: 'de',
    expect: 'spelling',
  },
  {
    id: 'C-7',
    item: { answer: 'das Laufen', subject_kind: 'german' },
    text: 'das laufen',
    locale: 'de',
    expect: 'spelling',
  },
  {
    id: 'C-7',
    item: { answer: 'L', subject_kind: 'german' },
    text: 'l',
    locale: 'de',
    expect: 'spelling',
  },
  {
    id: 'C-7',
    item: { kind: 'long', answer: 'Ich glaube, dass er kommt.', subject_kind: 'german' },
    text: 'Ich glaube dass er kommt',
    locale: 'de',
    expect: 'spelling',
  },
  {
    id: 'C-7',
    item: { kind: 'vocab', answer: 'die Straße' },
    text: 'die strasse',
    locale: 'de',
    expect: 'spelling',
  },
  {
    id: 'C-7',
    item: { answer: 'Monday', subject_kind: 'english' },
    text: 'monday',
    locale: 'en',
    expect: 'spelling',
  },
  {
    id: 'D-2',
    item: { answer: 'Berlin', subject_kind: 'geography' },
    text: 'berlin',
    locale: 'de',
    expect: 'folded',
  },
  {
    id: 'D-2',
    item: { answer: 'Berlin', subject_kind: 'geography', spelling: 'strict' },
    text: 'berlin',
    locale: 'de',
    expect: 'spelling',
  },
  {
    id: 'D-2',
    item: { answer: 'Straße', subject_kind: 'german', spelling: 'gentle' },
    text: 'Strasse',
    locale: 'de',
    expect: 'folded',
  },
  {
    id: 'D-2',
    item: { answer: 'Straße', subject_kind: 'german' },
    text: 'Straße',
    locale: 'de',
    expect: 'correct',
  },
  // H-3: missing_word never on math keys.
  { id: 'H-3', item: { answer: 'x = 5' }, text: '5', locale: 'de', expect: 'unknown' },
  { id: 'H-3', item: { answer: 'x = 5' }, text: '-5', locale: 'de', expect: 'unknown' },
  {
    id: 'H-3',
    item: { kind: 'vocab', answer: 'der Schüler' },
    text: 'Schüler',
    locale: 'de',
    expect: 'missing_word',
  },
  // H-4: a different number is no typo.
  { id: 'H-4', item: { answer: '14:35 Uhr' }, text: '15:35 Uhr', locale: 'de', expect: 'unknown' },
  { id: 'H-4', item: { answer: '14:30' }, text: '14:50', locale: 'de', expect: 'unknown' },
  { id: 'H-4', item: { answer: '1250 m' }, text: '1350 m', locale: 'de', expect: 'unknown' },
  { id: 'H-4', item: { answer: '24 cm²' }, text: '42 cm²', locale: 'de', expect: 'unknown' },
  { id: 'H-4', item: { answer: 'a = 12 cm' }, text: 'a = 13 cm', locale: 'de', expect: 'unknown' },
  // H-5: a spoken letter that is also an option.
  {
    id: 'H-5',
    item: {
      kind: 'multiple_choice',
      answer: 'the',
      choices: ['the', 'a', 'an'],
      correct_choice: 0,
    },
    text: 'A',
    locale: 'en',
    expect: 'unknown',
  },
  {
    id: 'H-5',
    item: {
      kind: 'multiple_choice',
      answer: 'the',
      choices: ['the', 'a', 'an'],
      correct_choice: 0,
    },
    text: 'the',
    locale: 'en',
    expect: 'correct',
  },
  // M-30: an option followed by more words (a negation, a correction) is for the tutor.
  {
    id: 'M-30',
    item: {
      kind: 'multiple_choice',
      answer: 'richtig',
      choices: ['richtig', 'falsch'],
      correct_choice: 1,
    },
    text: 'Richtig ist das nicht',
    locale: 'de',
    expect: 'unknown',
  },
  {
    id: 'M-30',
    item: {
      kind: 'multiple_choice',
      answer: 'richtig',
      choices: ['richtig', 'falsch'],
      correct_choice: 1,
    },
    text: 'Richtig, nein falsch',
    locale: 'de',
    expect: 'unknown',
  },
  {
    id: 'M-30',
    item: {
      kind: 'multiple_choice',
      answer: 'richtig',
      choices: ['richtig', 'falsch'],
      correct_choice: 1,
    },
    text: 'falsch',
    locale: 'de',
    expect: 'correct',
  },
  // A multiple choice number option: "3,4" does not name 3/4.
  {
    id: 'C-6',
    item: {
      kind: 'multiple_choice',
      answer: '3/4',
      choices: ['$\\frac{3}{4}$', '$\\frac{1}{2}$'],
      correct_choice: 0,
    },
    text: '3,4',
    locale: 'de',
    expect: 'unknown',
  },
];

describe('grading truth table', () => {
  for (const row of TABLE) {
    const allowed = Array.isArray(row.expect) ? row.expect : [row.expect];
    it(`${row.id}: ${row.item.kind ?? 'short'} key ${JSON.stringify(row.item.answer)} ← ${JSON.stringify(row.text)} (${row.locale}) is ${allowed.join(' or ')}`, () => {
      expect(allowed).toContain(check(item(row.item), row.text));
    });
  }
});

describe('spelling strictness (decision D-2)', () => {
  it('is strict for vocabulary and language subjects, gentle elsewhere, and settable per item', () => {
    expect(spellingOf(item({ kind: 'vocab' }))).toBe('strict');
    expect(spellingOf(item({ subject_kind: 'german' }))).toBe('strict');
    expect(spellingOf(item({ subject_kind: 'latin' }))).toBe('strict');
    expect(spellingOf(item({ subject_kind: 'math' }))).toBe('gentle');
    expect(spellingOf(item({ subject_kind: null }))).toBe('gentle');
    expect(spellingOf(item({ subject_kind: 'math', spelling: 'strict' }))).toBe('strict');
    expect(spellingOf(item({ kind: 'vocab', spelling: 'gentle' }))).toBe('gentle');
  });
});

describe('differentNumber (tests only)', () => {
  const short = (answer: string, accepted: string[] = []) =>
    item({ answer, accepted_answers: accepted });

  it('knows a plain number with another value is wrong', () => {
    expect(differentNumber(short('$\\frac{3}{4}$'), '3/7')).toBe(true);
    expect(differentNumber(short('0,75'), '0,5')).toBe(true);
    expect(differentNumber(short('12'), '-12')).toBe(true);
    // No tolerance: 242 is not 240 (C-2).
    expect(differentNumber(short('240'), '242')).toBe(true);
  });

  it('leaves everything else to the model', () => {
    // Same value, other form: may still be wrong (not reduced).
    expect(differentNumber(short('1/2'), '4/8')).toBe(false);
    expect(differentNumber(short('3/4'), '0,75')).toBe(false);
    // Not a plain number: equations, words, units, ambiguous separators.
    expect(differentNumber(short('3,5'), '3 1/2')).toBe(false);
    expect(differentNumber(short('3'), 'x=3')).toBe(false);
    expect(differentNumber(short('3'), 'drei')).toBe(false);
    expect(differentNumber(short('12'), '12 cm')).toBe(false);
    expect(differentNumber(short('1000'), '1.000')).toBe(false);
    // A LaTeX mixed key is 3½, not 15.5 (C-5).
    expect(differentNumber(short('$3\\frac{1}{2}$'), '7/2')).toBe(false);
    // A word solution, or an accepted answer that is not a number.
    expect(differentNumber(short('Nenner'), '3')).toBe(false);
    expect(differentNumber(short('3/4', ['drei Viertel']), '3/7')).toBe(false);
    // Any accepted value counts as right.
    expect(differentNumber(short('3/4', ['0,8']), '0,8')).toBe(false);
  });
});

describe('compareWithKeys — the shared value comparison (for homework help, I-3)', () => {
  it('compares values in any form against the key and the accepted answers', () => {
    const it34 = { answer: '$\\frac{3}{4}$', accepted_answers: [], unit: null };
    expect(compareWithKeys(it34, '0,75')).toBe('equal');
    expect(compareWithKeys(it34, '6/8')).toBe('equal');
    expect(compareWithKeys(it34, '3,4')).toBe('different');
    expect(compareWithKeys(it34, 'drei Viertel')).toBe('unknown');
    expect(compareWithKeys(it34, '1/2+1/4')).toBe('unknown');
    // One key with the value is enough; one key that is no number keeps "different" away.
    expect(compareWithKeys({ answer: 'x', accepted_answers: ['0.5'], unit: null }, '1/2')).toBe(
      'equal',
    );
    expect(compareWithKeys({ answer: '0.5', accepted_answers: ['x'], unit: null }, '0,7')).toBe(
      'unknown',
    );
  });
});

describe('near misses on written answers', () => {
  const vocab = (answer: string, accepted: string[] = []) =>
    item({ kind: 'vocab', answer, accepted_answers: accepted });
  const near = (answer: string, text: string, accepted: string[] = []) =>
    check(vocab(answer, accepted), text);

  it('measures slips like a typist makes them', () => {
    expect(editDistance('garden', 'gardn')).toBe(1);
    expect(editDistance('garden', 'gadren')).toBe(1); // two letters swapped
    expect(editDistance('kitchen', 'kitchen')).toBe(0);
  });

  it('allows slips by word length, never on short words', () => {
    expect(near('garden', 'gardn')).toBe('typo');
    expect(near('cat', 'car')).toBe('unknown'); // short: must be exact
    expect(near('bedroom', 'bedrm')).toBe('unknown'); // 2 slips on 7 letters: too many
    expect(near('Schlafzimmer', 'Schlafzimer')).toBe('typo');
    expect(near('Schlafzimmer', 'Schlfzimer')).toBe('typo'); // 2 slips on 12 letters
    expect(near('garden', 'Garten')).toBe('typo'); // shown the spelling, never counted right
  });

  it('notices a missing first word and keeps exact and accepted answers right', () => {
    expect(near('der Schüler', 'Schüler')).toBe('missing_word');
    expect(near('der Schüler', 'der Schüler')).toBe('correct');
    expect(near('die Katze', 'Katze', ['Katze'])).toBe('correct');
    expect(near('élève', 'eleve')).toBe('close');
  });
});

describe('values in a text', () => {
  it('reads fractions, decimals and mixed numbers in any notation', () => {
    expect(valuesIn('$\\frac{31}{20}$')).toEqual([1.55]);
    expect(valuesIn('$1\\frac{11}{20}$ und 1 11/20')).toEqual([1.55, 1.55]);
    expect(valuesIn('0,75 oder 3/4')).toEqual([0.75, 0.75]);
  });
});

describe('a spoken or typed choice', () => {
  const choices = [
    'Die Zähler direkt addieren',
    'Die Brüche gleichnamig machen',
    'Die Nenner miteinander multiplizieren',
  ];

  it('is the option it names: exactly or by its letter', () => {
    expect(choiceNamed('die brüche gleichnamig machen', choices)).toBe(1);
    expect(choiceNamed('B', choices)).toBe(1);
    expect(choiceNamed('c.', choices)).toBe(2);
    expect(choiceNamed('2/3', ['$\\frac{2}{3}$', '$\\frac{3}{5}$'])).toBe(0);
  });

  it('leaves everything unclear to the tutor', () => {
    expect(choiceNamed('ich glaube die zweite', choices)).toBeNull();
    expect(choiceNamed('nicht die brüche gleichnamig machen', choices)).toBeNull();
    expect(choiceNamed('d', choices)).toBeNull();
    expect(choiceNamed('die', choices)).toBeNull();
    // Said first and explained further: the tutor decides (M-30 — it may be a correction).
    expect(
      choiceNamed('Die Brüche gleichnamig machen, auf denselben Nenner bringen.', choices),
    ).toBeNull();
    expect(choiceNamed('true is not the answer', ['true', 'false'])).toBeNull();
    // A longer number is not the option (review finding).
    expect(choiceNamed('125,5', ['125', '130', '135'])).toBeNull();
    expect(choiceNamed('100.000', ['100', '1000'])).toBeNull();
    // Options that are only symbols never swallow an answer made of punctuation.
    expect(choiceNamed('?', ['<', '>', '='])).toBeNull();
    expect(choiceNamed('<', ['<', '>', '='])).toBe(0);
  });

  it('never picks a one-letter option for a badge letter that means another one (H-5)', () => {
    expect(choiceNamed('A', ['the', 'a', 'an'])).toBeNull();
    expect(choiceNamed('a', ['the', 'a', 'an'])).toBeNull();
    expect(choiceNamed('A', ['c', 'a', 'b'])).toBeNull();
    expect(choiceNamed('C', ['c', 'a', 'b'])).toBeNull();
    // Only the option can be meant: the letter is past the last badge.
    expect(choiceNamed('d', ['x', 'y', 'd'])).toBe(2);
    // Letter and option agree.
    expect(choiceNamed('a', ['a', 'b', 'c'])).toBe(0);
    // Numbers are not a badge letter: -5 and 5 stay apart.
    expect(choiceNamed('5', ['-5', '5'])).toBe(1);
  });
});

// ── Property tests (audit S-1) over the whole rule check: a numeric answer written the way a
// learner in any locale writes it is 'correct' or 'unknown', never 'incorrect'; a changed value
// (last place ± 1, sign flip) is never 'correct'; an operator swapped in a formula is never
// 'correct'.

const LOCALES = ['de', 'fr', 'es', 'it', 'en'] as const;
const COMMA: ReadonlySet<string> = new Set(['de', 'fr', 'es', 'it']);

describe('property: rule check over generated numbers', () => {
  const written = fc
    .record({
      whole: fc.integer({ min: 0, max: 9_999 }),
      decimals: fc.integer({ min: 0, max: 4 }),
      frac: fc.integer({ min: 0, max: 9999 }),
      negative: fc.boolean(),
      locale: fc.constantFrom(...LOCALES),
      unit: fc.constantFrom(null, '%', 'cm', 'kg'),
      withUnit: fc.boolean(),
      kind: fc.constantFrom('numeric' as const, 'short' as const),
    })
    .map((r) => {
      const scale = 10 ** r.decimals;
      const units = (r.whole * scale + (r.frac % scale)) * (r.negative ? -1 : 1);
      const write = (n: number, sep: string) => {
        const a = Math.abs(n);
        const f = r.decimals ? `${sep}${String(a % scale).padStart(r.decimals, '0')}` : '';
        return `${n < 0 ? '-' : ''}${Math.floor(a / scale)}${f}`;
      };
      const sep = COMMA.has(r.locale) ? ',' : '.';
      const suffix = r.unit && r.withUnit && r.kind === 'numeric' ? ` ${r.unit}` : '';
      return { ...r, units, write, sep, suffix };
    });

  it('a right value is never incorrect', () => {
    fc.assert(
      fc.property(written, (r) => {
        const it = item({ kind: r.kind, answer: r.write(r.units, '.'), unit: r.unit });
        const text = r.write(r.units, r.sep) + r.suffix;
        const v = check(it, text);
        if (v !== 'correct' && v !== 'unknown') throw new Error(`${text} for ${it.answer}: ${v}`);
        if (r.kind === 'short' && differentNumber(it, text))
          throw new Error(`${text} for ${it.answer}: different`);
      }),
      { numRuns: 400 },
    );
  });

  it('a changed value is never correct', () => {
    fc.assert(
      fc.property(written, fc.constantFrom(-1, 1), (r, delta) => {
        const it = item({ kind: r.kind, answer: r.write(r.units, '.'), unit: r.unit });
        const wrong = [r.write(r.units + delta, r.sep) + r.suffix];
        if (r.units !== 0) wrong.push(r.write(-r.units, r.sep) + r.suffix);
        for (const text of wrong) {
          if (check(it, text) === 'correct') throw new Error(`${text} for ${it.answer}: correct`);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('a swapped operator or relation is never correct', () => {
    const swaps: Array<[string, string]> = [
      ['+', '-'],
      ['-', '+'],
      ['<', '>'],
      ['>', '<'],
      ['·', ':'],
    ];
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99 }),
        fc.integer({ min: 1, max: 99 }),
        fc.constantFrom(...swaps),
        fc.constantFrom('x', 'a', 'y'),
        (a, b, [op, other], v) => {
          const key = `${a}${v}${op}${b}`;
          const it = item({ kind: 'formula', answer: key });
          const text = `${a}${v} ${other} ${b}`;
          if (check(it, text) === 'correct') throw new Error(`${text} for ${key}: correct`);
          if (check(item({ answer: key }), text) === 'correct')
            throw new Error(`${text} for short ${key}: correct`);
        },
      ),
      { numRuns: 300 },
    );
  });
});
