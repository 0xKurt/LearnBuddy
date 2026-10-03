// When a question may be read aloud by its "Vorlesen" button (issue #238), in both directions:
// what must be read (a word problem, a fraction, a chemistry formula, a vocabulary prompt) and
// what must not (a spelling task, a vocabulary prompt that already holds its answer).

import { describe, expect, it } from 'vitest';

import { readAloudAllowed, type ReadAloudItem } from '../readAloud.js';

function item(over: Partial<ReadAloudItem>): ReadAloudItem {
  return {
    kind: 'short',
    prompt: 'Wie viele Äpfel bleiben übrig?',
    answer: '3',
    accepted_answers: [],
    spelling: null,
    ...over,
  };
}

describe('readAloudAllowed', () => {
  it('reads a word problem, a fraction, a formula and a choice question', () => {
    expect(readAloudAllowed(item({}))).toBe(true);
    expect(
      readAloudAllowed(
        item({ kind: 'numeric', prompt: 'Was ist $\\frac{3}{4}$ von 12?', answer: '9' }),
      ),
    ).toBe(true);
    expect(
      readAloudAllowed(item({ prompt: 'Wie heißt $\\mathrm{H_2O}$?', answer: 'Wasser' })),
    ).toBe(true);
    // The answer standing in the prompt is fine outside vocabulary: hearing "Hund oder Katze"
    // says nothing about which one barks.
    expect(
      readAloudAllowed(
        item({ kind: 'multiple_choice', prompt: 'Wer bellt: Hund oder Katze?', answer: 'Hund' }),
      ),
    ).toBe(true);
    expect(readAloudAllowed(item({ spelling: 'gentle' }))).toBe(true);
  });

  it('reads a vocabulary prompt in either direction when it does not hold the answer', () => {
    expect(readAloudAllowed(item({ kind: 'vocab', prompt: 'le chien', answer: 'der Hund' }))).toBe(
      true,
    );
    expect(readAloudAllowed(item({ kind: 'vocab', prompt: 'der Hund', answer: 'le chien' }))).toBe(
      true,
    );
  });

  it('never reads a task that practises spelling', () => {
    expect(
      readAloudAllowed(
        item({ prompt: 'Schreib richtig: fahrad', answer: 'Fahrrad', spelling: 'strict' }),
      ),
    ).toBe(false);
    expect(
      readAloudAllowed(
        item({ kind: 'vocab', prompt: 'le chien', answer: 'der Hund', spelling: 'strict' }),
      ),
    ).toBe(false);
  });

  it('never reads a vocabulary prompt that already holds its answer', () => {
    expect(
      readAloudAllowed(
        item({ kind: 'vocab', prompt: 'le taxi', answer: 'das Taxi', accepted_answers: ['Taxi'] }),
      ),
    ).toBe(false);
    expect(
      readAloudAllowed(
        item({ kind: 'vocab', prompt: 'the hotel (das Hotel)', answer: 'das Hotel' }),
      ),
    ).toBe(false);
    // Case, punctuation and ß do not hide it.
    expect(
      readAloudAllowed(item({ kind: 'vocab', prompt: 'la rue – STRASSE', answer: 'Straße' })),
    ).toBe(false);
  });

  it('matches whole words only', () => {
    // "Hund" inside "Hundehütte" is not the answer standing in the prompt.
    expect(
      readAloudAllowed(item({ kind: 'vocab', prompt: 'la niche (Hundehütte?)', answer: 'Hund' })),
    ).toBe(true);
  });
});
