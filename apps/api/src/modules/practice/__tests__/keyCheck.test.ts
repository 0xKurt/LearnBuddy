// A key that contradicts its own question is not used (issue #157).
//
// The external audit put `8` on `6 + 4` and watched the right answer `10` be rejected by a
// rule check that sounds certain. What can be decided is decided before the question is
// ever asked; what cannot is left alone rather than guessed at (CLAUDE.md rule 5).

import { describe, expect, it } from 'vitest';

import { askedArithmetic, keyAgreesWithPrompt } from '../keyCheck.js';

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
