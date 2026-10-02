import { describe, expect, it } from 'vitest';

import { enforceTutorInvariants, mentionsSolution, type TutorDecision } from '../tutor.js';

const d = (over: Partial<TutorDecision>): TutorDecision => ({
  intent: 'answer',
  verdict: 'incorrect',
  reply: 'Fast!',
  gave_hint: true,
  revealed_answer: false,
  ...over,
});

describe('tutor invariants', () => {
  it('counts an answer the rules call wrong as a wrong attempt, whatever the model thought', () => {
    // Live: a model took "5" (hexagon sides) for "no answer".
    const v = enforceTutorInvariants(
      d({ intent: 'no_answer', verdict: 'not_an_attempt' }),
      'incorrect',
    );
    expect(v.verdict).toBe('incorrect');
    expect(enforceTutorInvariants(d({ verdict: 'correct' }), 'incorrect').verdict).toBe(
      'incorrect',
    );
  });

  it('never grades what is not an attempt, and never counts a revealed answer as right', () => {
    expect(
      enforceTutorInvariants(d({ intent: 'help_request', verdict: 'correct' }), 'unknown').verdict,
    ).toBe('not_an_attempt');
    expect(
      enforceTutorInvariants(d({ verdict: 'correct', revealed_answer: true }), 'unknown').verdict,
    ).toBe('incorrect');
    expect(enforceTutorInvariants(d({ verdict: 'correct' }), 'close').verdict).toBe(
      'partially_correct',
    );
  });

  it('lets the model call one near miss right: a vocabulary word missing its article (#146)', () => {
    // Without the flag the rule stands, whatever the model says.
    expect(enforceTutorInvariants(d({ verdict: 'correct' }), 'missing_word').verdict).toBe(
      'partially_correct',
    );
    expect(enforceTutorInvariants(d({ verdict: 'correct' }), 'missing_word', true).verdict).toBe(
      'correct',
    );
    // The flag opens exactly that one door — accents stay a near miss even with it set.
    expect(enforceTutorInvariants(d({ verdict: 'correct' }), 'close', true).verdict).toBe(
      'partially_correct',
    );
    // ...and it never turns a wrong answer into a right one.
    expect(enforceTutorInvariants(d({ verdict: 'correct' }), 'incorrect', true).verdict).toBe(
      'incorrect',
    );
  });

  it('will not call an answer wrong where no Bundesland rule applies (#214)', () => {
    // At one of the twelve places where the states disagree, with no rule for her state, a
    // "wrong" is a claim nobody can back: what she wrote may be exactly what her own school
    // asks for, in another state's wording.
    expect(
      enforceTutorInvariants(d({ verdict: 'incorrect' }), 'unknown', false, true).verdict,
    ).toBe('partially_correct');
    // With a rule for her state the model's judgement stands: it was told what counts.
    expect(
      enforceTutorInvariants(d({ verdict: 'incorrect' }), 'unknown', false, false).verdict,
    ).toBe('incorrect');
    // A state does not change what a number is: a rule-checked wrong answer stays wrong.
    expect(
      enforceTutorInvariants(d({ verdict: 'incorrect' }), 'incorrect', false, true).verdict,
    ).toBe('incorrect');
    // And it never lifts anything above "partly": a revealed answer is still not right.
    expect(
      enforceTutorInvariants(
        d({ verdict: 'incorrect', revealed_answer: true }),
        'unknown',
        false,
        true,
      ).verdict,
    ).toBe('incorrect');
    // Nothing changes for a question at none of the twelve places (the normal case).
    expect(enforceTutorInvariants(d({ verdict: 'incorrect' }), 'unknown').verdict).toBe(
      'incorrect',
    );
  });
});

describe('mentionsSolution', () => {
  it('catches the result in another form, but not the numbers of the task', () => {
    const task = 'Berechne $\\frac{3}{4} + \\frac{4}{5}$.';
    expect(
      mentionsSolution('$\\frac{15}{20} + \\frac{16}{20} = \\frac{31}{20}$', '1 11/20', task),
    ).toBe(true);
    expect(mentionsSolution('Der Hauptnenner von 4 und 5 ist 20.', '1 11/20', task)).toBe(false);
    expect(mentionsSolution('Schau auf $\\frac{3}{4}$.', '0,75', 'Kürze $\\frac{6}{8}$.')).toBe(
      false,
    );
  });
});
