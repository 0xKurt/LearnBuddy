// A guided worked example (issue #298): the way is kept only when code proves it, and her line
// after a shown step is read by code — a step of hers, the result, a miss, or nothing to judge.

import { describe, expect, it } from 'vitest';

import { t } from '../../../i18n/index.js';
import { checkedSteps, guidedStep, guidedTurn, stepHints, stepOnRequest } from '../workedSteps.js';

const STEPS = [
  { line: '3(2x - 4) = 2x + 8', note: 'Die Gleichung' },
  { line: '6x - 12 = 2x + 8', note: 'Klammer auflösen' },
  { line: '4x - 12 = 8', note: 'Auf beiden Seiten 2x abziehen' },
  { line: '4x = 20', note: '12 addieren' },
  { line: 'x = 5', note: 'Durch 4 teilen' },
];

const item = {
  kind: 'numeric' as const,
  prompt: 'Löse die Gleichung 3(2x - 4) = 2x + 8.',
  answer: '5',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  tolerance: null,
  spelling: null,
  subject_kind: 'math',
  worked_steps: STEPS,
};

describe('a way code keeps', () => {
  it('keeps a proven way, and its middle steps are the ladder', () => {
    expect(checkedSteps(STEPS, item)).toEqual(STEPS);
    // The question printed with − and LaTeX, the way written with -: the same line.
    const printed = { ...item, prompt: 'Löse die Gleichung $3(2x − 4) = 2x + 8$.' };
    expect(checkedSteps(STEPS, printed)).toEqual(STEPS);
    expect(stepHints(STEPS)).toEqual([
      'Klammer auflösen: $6x - 12 = 2x + 8$',
      'Auf beiden Seiten 2x abziehen: $4x - 12 = 8$',
      '12 addieren: $4x = 20$',
    ]);
  });

  it('drops a way that breaks, starts elsewhere, ends off the key or shows the result early', () => {
    const broken = [...STEPS.slice(0, 2), { line: '4x - 12 = 10', note: 'x' }, STEPS[4]];
    expect(checkedSteps(broken, item)).toBeNull();
    expect(checkedSteps(STEPS.slice(2), item)).toBeNull();
    const offKey = [
      STEPS[0],
      STEPS[1],
      { line: '4x = 24', note: 'x' },
      { line: 'x = 6', note: 'y' },
    ];
    expect(checkedSteps(offKey, item)).toBeNull();
    const early = [STEPS[0], { line: 'x = 5', note: 'a' }, { line: '5 = x', note: 'b' }];
    expect(checkedSteps(early, item)).toBeNull();
    expect(checkedSteps(STEPS, { ...item, kind: 'multiple_choice' })).toBeNull();
    expect(checkedSteps(STEPS.slice(0, 2), item)).toBeNull();
  });
});

describe('her line after a shown step', () => {
  it('is no guided step before a step was shown, or without a kept way', () => {
    expect(guidedStep(item, 0, '4x = 20')).toBeNull();
    expect(guidedStep({ ...item, worked_steps: null }, 1, '4x = 20')).toBeNull();
    expect(guidedStep({ ...item, worked_steps: [{ line: 'x' }] }, 1, '4x = 20')).toBeNull();
  });

  it('reads a step of hers that follows, and leads on past a step of the way she wrote', () => {
    // A step of the way further on: „Tipp" goes on after it, never shows it to her again.
    expect(guidedStep(item, 1, '4x - 12 = 8')).toEqual({ kind: 'step', ladder: 2 });
    expect(guidedStep(item, 1, '4x=20')).toEqual({ kind: 'step', ladder: 3 });
    // A route of her own: the ladder stays where it is.
    expect(guidedStep(item, 1, '6x = 2x + 20')).toEqual({ kind: 'step', ladder: 1 });
  });

  it('calls a line that does not follow a miss, and the result in its own form right', () => {
    expect(guidedStep(item, 1, '4x = 4')).toEqual({ kind: 'wrong' });
    expect(guidedStep(item, 1, 'x = 5')).toEqual({ kind: 'solved' });
  });

  it('leaves the rules what is no step of hers', () => {
    expect(guidedStep(item, 1, '6x - 12 = 2x + 8')).toBeNull(); // shown, copied back
    expect(guidedStep(item, 2, '3(2x - 4) = 2x + 8')).toBeNull(); // the task
    expect(guidedStep(item, 1, '5')).toBeNull(); // the key: the rules say right
    expect(guidedStep(item, 1, '4x = 20\nx = 5')).toBeNull(); // a path
    expect(guidedStep(item, 1, 'zeig mir wie')).toBeNull(); // no line of maths
  });

  it('answers a step and a miss with the fixed lines', () => {
    expect(guidedTurn('de', { kind: 'step', ladder: 2 })).toEqual({
      verdict: 'not_an_attempt',
      reply: t('de', 'practice.step_ok'),
      revealed: false,
      ownStep: 2,
    });
    expect(guidedTurn('en', { kind: 'wrong' })).toEqual({
      verdict: 'incorrect',
      reply: t('en', 'practice.step_wrong'),
      revealed: false,
    });
  });
});

describe('„Zeig mir wie" in her words', () => {
  const next = 'Klammer auflösen: $6x - 12 = 2x + 8$';

  it('shows the next step of a kept way when the tutor read a request for help', () => {
    const shown = {
      verdict: 'not_an_attempt',
      evaluatedBy: 'model',
      reply: next,
      gaveHint: true,
      usedPrepared: true,
      revealed: false,
    };
    expect(stepOnRequest(item, 'help_request', next)).toEqual(shown);
    expect(stepOnRequest(item, 'no_answer', next)).toEqual(shown);
  });

  it('shows nothing for an answer, without a kept way or with no step left', () => {
    expect(stepOnRequest(item, 'answer', next)).toBeNull();
    expect(stepOnRequest(item, 'wants_to_stop', next)).toBeNull();
    expect(stepOnRequest({ worked_steps: null }, 'help_request', next)).toBeNull();
    expect(stepOnRequest(item, 'help_request', null)).toBeNull();
  });
});
