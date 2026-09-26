import { describe, expect, it } from 'vitest';

import { enforceTutorInvariants, type TutorDecision } from '../tutor.js';

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
});
