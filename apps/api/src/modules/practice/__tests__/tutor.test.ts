import { describe, expect, it } from 'vitest';

import {
  enforceTutorInvariants,
  formText,
  mentionsSolution,
  tutorContext,
  type TutorDecision,
} from '../tutor.js';

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

// ── A value code confirmed is never "wrong" (issue #227, finding 1; issue #235) ────────────
// The prompt asked for this since #227; until now nothing held it when the model did not follow.
describe('a value code has confirmed', () => {
  it('turns the model’s "wrong" into "partly right" — the form may be open, the value is not', () => {
    expect(enforceTutorInvariants(d({ verdict: 'incorrect' }), 'other_form').verdict).toBe(
      'partially_correct',
    );
    expect(enforceTutorInvariants(d({ verdict: 'incorrect' }), 'not_transformed').verdict).toBe(
      'partially_correct',
    );
    // A model that said "not an attempt" to a real answer: the same.
    expect(enforceTutorInvariants(d({ verdict: 'not_an_attempt' }), 'other_form').verdict).toBe(
      'partially_correct',
    );
  });

  it('still lets the model decide the form either way', () => {
    expect(enforceTutorInvariants(d({ verdict: 'correct' }), 'other_form').verdict).toBe('correct');
    expect(enforceTutorInvariants(d({ verdict: 'partially_correct' }), 'other_form').verdict).toBe(
      'partially_correct',
    );
    // The task typed back is never fully right.
    expect(enforceTutorInvariants(d({ verdict: 'correct' }), 'not_transformed').verdict).toBe(
      'partially_correct',
    );
  });

  it('never counts a revealed answer as right, and never calls the value wrong for it', () => {
    expect(
      enforceTutorInvariants(d({ verdict: 'correct', revealed_answer: true }), 'other_form')
        .verdict,
    ).toBe('partially_correct');
  });

  it('does not stretch to a help request or to a rule-certain wrong answer', () => {
    expect(
      enforceTutorInvariants(d({ intent: 'help_request', verdict: 'incorrect' }), 'other_form')
        .verdict,
    ).toBe('not_an_attempt');
    expect(enforceTutorInvariants(d({ verdict: 'correct' }), 'incorrect').verdict).toBe(
      'incorrect',
    );
  });
});

describe('what the tutor is told about the form (#235)', () => {
  const base = {
    item: {
      kind: 'formula',
      prompt: 'Faktorisiere $x^2+2x$.',
      answer: 'x(x+2)',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: null,
      lang: null,
      prompt_lang: null,
    },
    hintsGiven: 0,
    attempts: 0,
    ruleVerdict: 'other_form' as const,
    mode: 'practice' as const,
    learnerLevel: 'school grade 8',
    learnerAge: 13,
    language: 'de',
    material: null,
    preferences: [],
  };

  it('names the two shapes code read, and only when there is a note', () => {
    const note = { kind: 'shape', key: 'product', answer: 'sum' } as const;
    expect(tutorContext({ ...base, formNote: note })).toContain(
      `FORM CHECK (read by code, not judged): ${formText(note)}`,
    );
    expect(formText(note)).toContain('the key is factored (a product with a bracket)');
    expect(tutorContext(base)).not.toContain('FORM CHECK');
  });
});

describe('a solution given away in another order (#227 B7)', () => {
  it('counts the same summands as the solution, but not a step on the way', () => {
    const task = 'Multipliziere aus: $2(x+3)$';
    expect(mentionsSolution('Schau: $6 + 2x$', '2x+6', task)).toBe(true);
    expect(mentionsSolution('Rechne $2 \\cdot x + 2 \\cdot 3$ aus.', '2x+6', task)).toBe(false);
    // The task's own term is no give-away.
    expect(mentionsSolution('Was heißt $2(x+3)$?', '2(x+3)', task)).toBe(false);
  });
});
