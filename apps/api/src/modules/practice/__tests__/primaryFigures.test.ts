// Primary-school figures (issue #254): the key a figure declares is the one code computes, a
// broken figure costs its question, and a time next to a clock is graded as a time.

import { describe, expect, it } from 'vitest';

import { choiceProblem } from '../choiceCheck.js';
import { clockVerdict, ruleCheck, type ItemForCheck } from '../evaluate.js';
import { figureHolds, figureIsRejectedPrimary } from '../figureCheck.js';

type Fig = Parameters<typeof figureHolds>[0];

const clock = (h: number, m: number, ask: 'time' | 'none' = 'time', h24 = false): Fig => ({
  type: 'clock',
  c: [{ h, m }],
  h24,
  ask,
});
const span: Fig = {
  type: 'clock',
  c: [
    { h: 7, m: 45 },
    { h: 8, m: 30 },
  ],
  h24: false,
  ask: 'span',
};
const coins: Fig = {
  type: 'money',
  p: [
    { d: '2€', n: 1 },
    { d: '1€', n: 1 },
    { d: '20ct', n: 2 },
    { d: '5ct', n: 1 },
  ],
  ask: 'sum',
};

describe('the key a primary-school figure declares', () => {
  it('a time: the hands, on the dial or in 24 hours when the task asks for that', () => {
    expect(figureHolds(clock(7, 45), '7:45', false)).toBe(true);
    expect(figureHolds(clock(19, 45), '7:45', false)).toBe(true);
    expect(figureHolds(clock(7, 45), '8:45', false)).toBe(false);
    expect(figureHolds(clock(19, 45, 'time', true), '7:45', false)).toBe(false);
    expect(figureHolds(clock(19, 45, 'time', true), '19:45', false)).toBe(true);
    // A time is never a number question, and a key in words cannot be checked.
    expect(figureHolds(clock(7, 45), '7:45', true)).toBe(false);
    expect(figureHolds(clock(7, 45), 'Viertel vor acht', false)).toBe(false);
    // No key declared: nothing to hold the key to.
    expect(figureHolds(clock(7, 45, 'none'), 'Viertel vor acht', false)).toBe(true);
  });

  it('a span in min or h', () => {
    expect(figureHolds(span, '45', true, 'min')).toBe(true);
    expect(figureHolds(span, '0.75', true, 'h')).toBe(true);
    expect(figureHolds(span, '45 min', true)).toBe(true);
    expect(figureHolds(span, '50', true, 'min')).toBe(false);
    // Without a unit a span says nothing.
    expect(figureHolds(span, '45', true)).toBe(false);
  });

  it('an amount in € or ct, to the cent', () => {
    expect(figureHolds(coins, '3.45', true, '€')).toBe(true);
    expect(figureHolds(coins, '345', true, 'ct')).toBe(true);
    expect(figureHolds(coins, '3,45 €', false)).toBe(true);
    expect(figureHolds(coins, '3.40', true, '€')).toBe(false);
    // Not layable with euro pieces, and not what the coins make.
    expect(figureHolds(coins, '3.455', true, '€')).toBe(false);
    expect(figureHolds(coins, '345', true)).toBe(false);
  });

  it('a count of dots or blocks', () => {
    const dots: Fig = { type: 'dot_field', field: 'twenty', n: [8, 6], ask: 'count' };
    const blocks: Fig = { type: 'base_ten', h: 1, t: 12, o: 3, ask: 'count' };
    expect(figureHolds(dots, '14', true)).toBe(true);
    expect(figureHolds(dots, '13', true)).toBe(false);
    expect(figureHolds(blocks, '223', true)).toBe(true);
    expect(figureHolds(blocks, '123', true)).toBe(false);
  });
});

describe('a broken primary-school figure costs its question', () => {
  it.each([
    ['a clock at 25 o’clock', { type: 'clock', c: [{ h: 25, m: 0 }], h24: false, ask: 'time' }],
    ['a 3-cent coin', { type: 'money', p: [{ d: '3ct', n: 1 }], ask: 'sum' }],
    ['21 dots in a field of 20', { type: 'dot_field', field: 'twenty', n: [15, 6], ask: 'count' }],
    ['a span with one clock', { type: 'clock', c: [{ h: 7, m: 0 }], h24: false, ask: 'span' }],
  ])('%s', (_, raw) => {
    expect(figureIsRejectedPrimary(raw)).toBe(true);
  });

  it('a figure that holds, and any other figure, is not rejected here', () => {
    expect(figureIsRejectedPrimary(coins)).toBe(false);
    expect(figureIsRejectedPrimary({ type: 'fraction', shape: 'bar', fractions: [] })).toBe(false);
    expect(figureIsRejectedPrimary(null)).toBe(false);
  });
});

describe('clocks as options', () => {
  const draft = {
    prompt: 'Welche Uhr zeigt halb drei?',
    answer: '2:30',
    choices: ['2:30', '3:30'],
    correct_choice: 0,
  };
  it('every option is what its clock shows', () => {
    const right = [clock(2, 30), clock(3, 30)] as never;
    const wrong = [clock(2, 30), clock(3, 35)] as never;
    expect(choiceProblem({ ...draft, choice_figures: right })).toBeNull();
    expect(choiceProblem({ ...draft, choice_figures: wrong })).toBe('figure_text');
  });
});

describe('a time next to a clock is graded as a time', () => {
  const item: ItemForCheck = {
    kind: 'short',
    answer: '7:45',
    accepted_answers: [],
    unit: null,
    choices: null,
    correct_choice: null,
    tolerance: null,
    spelling: null,
    subject_kind: 'math',
    figure: clock(7, 45),
  };
  it.each([
    ['7:45', 'correct'],
    ['7.45', 'correct'],
    ['19:45', 'correct'],
    ['8:45', 'incorrect'],
    ['7:15', 'incorrect'],
  ])('%s is %s', (text, verdict) => {
    expect(clockVerdict(item.figure, text)).toBe(verdict);
    expect(ruleCheck(item, { text, choice: null })).toBe(verdict);
  });

  it('words are the tutor’s, and without a clock "7:45" stays what it was', () => {
    expect(clockVerdict(item.figure, 'Viertel vor acht')).toBeNull();
    expect(clockVerdict(clock(7, 45, 'none'), '7:45')).toBeNull();
    expect(clockVerdict(null, '7:45')).toBeNull();
  });

  it('24 hours asked: 7:45 is not 19:45', () => {
    expect(clockVerdict(clock(19, 45, 'time', true), '7:45')).toBe('incorrect');
    expect(clockVerdict(clock(19, 45, 'time', true), '19.45')).toBe('correct');
  });

  it('an amount next to coins is right in ct as well as in €', () => {
    const money: ItemForCheck = {
      ...item,
      kind: 'numeric',
      answer: '3.45',
      unit: '€',
      figure: coins,
    };
    expect(ruleCheck(money, { text: '345 ct', choice: null })).toBe('correct');
    expect(ruleCheck(money, { text: '3,45', choice: null })).toBe('correct');
    expect(ruleCheck(money, { text: '340 ct', choice: null })).toBe('incorrect');
    // Without the coins the unit stays the tutor's to judge (D-3).
    expect(ruleCheck({ ...money, figure: null }, { text: '345 ct', choice: null })).toBe(
      'other_form',
    );
  });
});
