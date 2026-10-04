// A key that contradicts its own question is not used (issue #157).
//
// The external audit put `8` on `6 + 4` and watched the right answer `10` be rejected by a
// rule check that sounds certain. What can be decided is decided before the question is
// ever asked; what cannot is left alone rather than guessed at (CLAUDE.md rule 5).

import { describe, expect, it } from 'vitest';

import { askedArithmetic, keyAgreesWithPrompt, markedArithmetic } from '../keyCheck.js';

const item = (over: Partial<Parameters<typeof keyAgreesWithPrompt>[0]>) =>
  keyAgreesWithPrompt({ kind: 'numeric', prompt: '6 + 4', answer: '10', unit: null, ...over });

describe('reading the arithmetic a question asks for', () => {
  it('reads a bare expression, with or without the worksheet question mark', () => {
    expect(askedArithmetic('6 + 4')).toBe(10);
    expect(askedArithmetic('6 + 4 = ?')).toBe(10);
    expect(askedArithmetic('17 · 23 =')).toBe(391);
  });

  it('reads one written in LaTeX, like a sheet writes it', () => {
    expect(askedArithmetic('$\\frac{1}{2} + \\frac{1}{4}$')).toBeCloseTo(0.75, 10);
  });

  it('refuses a sentence rather than guessing at it', () => {
    // Guessing here would invent exactly the certainty this module exists to withhold.
    expect(askedArithmetic('Wie viel sind 20 % von 80?')).toBeNull();
    expect(askedArithmetic('Berechne den Umfang eines Rechtecks mit a = 3 und b = 4.')).toBeNull();
  });

  it('refuses something that is not a calculation at all', () => {
    expect(askedArithmetic('42')).toBeNull();
    expect(askedArithmetic('')).toBeNull();
  });
});

describe('whether the key may be trusted', () => {
  it('rejects a key its own question contradicts', () => {
    expect(item({ prompt: '6 + 4', answer: '8' })).toBe(false);
  });

  it('keeps one that agrees, however it is written', () => {
    expect(item({ prompt: '6 + 4', answer: '10' })).toBe(true);
    expect(item({ prompt: '$\\frac{1}{2} + \\frac{1}{4}$', answer: '3/4' })).toBe(true);
    expect(item({ prompt: '1 : 2', answer: '0,5' })).toBe(true);
  });

  it('says nothing about a question it cannot read', () => {
    // "No proof against it" is not "proven right" — and it is all this may claim.
    expect(item({ prompt: 'Wie viel sind 20 % von 80?', answer: '16' })).toBe(true);
    expect(item({ prompt: 'Wie viel sind 20 % von 80?', answer: 'völlig falsch' })).toBe(true);
  });

  it('leaves a question with a unit alone: it asked for more than the arithmetic', () => {
    expect(item({ prompt: '6 + 4', answer: '10', unit: 'cm' })).toBe(true);
  });

  it('never judges vocabulary or a choice by arithmetic', () => {
    expect(item({ kind: 'vocab', prompt: '2 + 2', answer: 'vier' })).toBe(true);
    expect(item({ kind: 'multiple_choice', prompt: '6 + 4', answer: '8' })).toBe(true);
  });
});

// ── Keys the question itself proves wrong (issues #235, #263, #227 B4–B6, B10) ─────────────
describe('a key its own maths proves wrong', () => {
  const formula = (prompt: string, answer: string, over: Record<string, unknown> = {}) =>
    keyAgreesWithPrompt({ kind: 'formula', prompt, answer, unit: null, ...over });

  it('solves a printed system and a printed equation', () => {
    const lgs = 'Löse: $x + y = 5$ und $x - y = 1$.';
    expect(formula(lgs, 'x = 3, y = 2')).toBe(true);
    expect(formula(lgs, 'x = 2, y = 3')).toBe(false);
    expect(formula('$2x + y = 7$; $4x + 2y = 14$', 'x = 2, y = 3')).toBe(false);
    expect(formula('Löse $3x - 4 = 11$.', 'x = 5')).toBe(true);
    expect(formula('Löse $3x - 4 = 11$.', 'x = 7')).toBe(false);
  });

  it('checks a derivative and an antiderivative against the function the question defines', () => {
    const f = 'Gegeben ist $f(x) = x^3 - 2x$.';
    expect(formula(f, "f'(x) = 3x^2 - 2")).toBe(true);
    expect(formula(f, "f'(x) = 3x^2 - 2x")).toBe(false);
    expect(formula(f, 'F(x) = x^4/4 - x^2 + C')).toBe(true);
    expect(formula(f, 'F(x) = x^4 - x^2 + C')).toBe(false);
    // An accepted answer is a key too.
    expect(formula(f, "f'(x) = 3x^2 - 2", { accepted_answers: ["f'(x) = 3x^2"] })).toBe(false);
    // Without "+ C", F may be any function the task calls F: nothing is claimed.
    expect(formula(f, 'F(x) = x^4')).toBe(true);
    // A function with a kink is only compared where the slope can be computed.
    expect(formula('$f(x) = abs(x)$', "f'(x) = 1")).toBe(true);
  });

  it('rejects a reaction or nuclear key that does not balance', () => {
    expect(formula('Stelle die Gleichung auf.', '2 H2 + O2 → 2 H2O')).toBe(true);
    expect(formula('Stelle die Gleichung auf.', 'H2 + O2 → H2O')).toBe(false);
    expect(formula('Alpha-Zerfall von U-238', '²³⁸₉₂U → ²³⁴₉₀Th + ⁴₂He')).toBe(true);
    expect(formula('Alpha-Zerfall von U-238', '²³⁸₉₂U → ²³⁴₉₀Th + ³₂He')).toBe(false);
  });

  it('rejects a number key whose accepted answers or unit say another value', () => {
    expect(item({ prompt: 'Runde 1/3.', answer: '1/3', accepted_answers: ['0.33'] })).toBe(true);
    expect(item({ prompt: 'Wie viel?', answer: '12', accepted_answers: ['13'] })).toBe(false);
    expect(item({ prompt: 'Wie lang?', answer: '12 cm', unit: 'cm' })).toBe(true);
    expect(item({ prompt: 'Wie lang?', answer: '12 mm', unit: 'cm' })).toBe(false);
  });
});

// ── A calculation inside a sentence, marked by the model (issue #227, finding 4) ─────────────
describe('the calculation the model marked in a sentence', () => {
  const sentence = 'Berechne $6 + 4$.';

  it('drops the #157 key on a sentence once the calculation is marked', () => {
    // Without the marker, a sentence is not read at all — finding 4 showed why guessing fails.
    expect(item({ prompt: sentence, answer: '8' })).toBe(true);
    expect(item({ prompt: sentence, answer: '8', computes: '6 + 4' })).toBe(false);
    expect(item({ prompt: sentence, answer: '10', computes: '6+4' })).toBe(true);
    // The option the index points at is the key a choice is judged by (#227 Nr. 2).
    const choice = { kind: 'multiple_choice', prompt: sentence, answer: '8', choices: ['8', '10'] };
    expect(item({ ...choice, correct_choice: 0, computes: '6 + 4' })).toBe(false);
    expect(item({ ...choice, correct_choice: 1, computes: '6 + 4' })).toBe(true);
  });

  it('computes only a marker that really stands in the question', () => {
    expect(markedArithmetic('Wie viel ist $17 \\cdot 23$?', '17 · 23')).toBe(391);
    expect(markedArithmetic('$\\frac{1}{2} + \\frac{1}{4}$ ergibt?', '1/2 + 1/4')).toBeCloseTo(
      0.75,
    );
    // Not in the question: no proof against the key, and nothing is claimed.
    expect(markedArithmetic(sentence, '6 + 5')).toBeNull();
    // Only as a calculation of its own: not the tail of a number, not half of a longer term.
    expect(markedArithmetic('Berechne $16 + 4$.', '6 + 4')).toBeNull();
    expect(markedArithmetic('Berechne $6 + 4 \\cdot 2$.', '6 + 4')).toBeNull();
    expect(markedArithmetic('Berechne $6 + 4 = $ ?', '6 + 4')).toBe(10);
    expect(item({ prompt: sentence, answer: '8', computes: '6 + 5' })).toBe(true);
    // A marker that is no calculation computes nothing.
    expect(markedArithmetic('Erweitere den Bruch mit 3.', '3')).toBeNull();
    expect(markedArithmetic(sentence, null)).toBeNull();
  });
});
