import { describe, expect, it } from 'vitest';

import {
  countBlanks,
  fillableAnswer,
  MAX_FILLED_LENGTH,
  parsePrompt,
  promptForSpeech,
} from '../prompt.js';

const kinds = (text: string, blanks = true) =>
  parsePrompt(text, { blanks }).map((r) =>
    r.type === 'plain'
      ? `${r.bold ? 'B:' : ''}${r.text}`
      : r.type === 'blank'
        ? `${r.bold ? 'B:' : ''}[${r.index}]`
        : `${r.bold ? 'B:' : ''}$`,
  );

describe('parsePrompt', () => {
  it('splits a blank out of the sentence', () => {
    expect(kinds('Ergänze: Ich helfe ___ Mutter.')).toEqual([
      'Ergänze: Ich helfe ',
      '[0]',
      ' Mutter.',
    ]);
  });
  it('reads three or more underscores as one blank, fewer as text', () => {
    expect(kinds('a ______ b __ c')).toEqual(['a ', '[0]', ' b __ c']);
  });
  it('numbers several blanks in order', () => {
    expect(kinds('___ und ___')).toEqual(['[0]', ' und ', '[1]']);
    expect(countBlanks('___ und ___')).toBe(2);
  });
  it('leaves "___" as text when blanks are off', () => {
    expect(kinds('a ___ b', false)).toEqual(['a ___ b']);
  });
  it('works next to math and never looks for blanks inside $…$', () => {
    expect(kinds('$\\frac{3}{4}$ = ___')).toEqual(['$', ' = ', '[0]']);
    expect(kinds('$x_{___}$ und ___')).toEqual(['$', ' und ', '[0]']);
    expect(countBlanks('$a___b$')).toBe(0);
  });
  it('keeps bold around, before and after a blank', () => {
    expect(kinds('**Ergänze:** Ich helfe ___ Mutter.')).toEqual([
      'B:Ergänze:',
      ' Ich helfe ',
      '[0]',
      ' Mutter.',
    ]);
    expect(kinds('Ich helfe **___** Mutter.')).toEqual(['Ich helfe ', 'B:[0]', ' Mutter.']);
    expect(kinds('**Ich helfe ___ Mutter.**')).toEqual(['B:Ich helfe ', 'B:[0]', 'B: Mutter.']);
  });
  it('bolds math inside ** and shows an escaped \\$ as $', () => {
    expect(kinds('**Kürze $\\frac{6}{8}$**')).toEqual(['B:Kürze ', 'B:$']);
    expect(kinds('Kostet 5\\$: ___')).toEqual(['Kostet 5$: ', '[0]']);
  });
  it('keeps plain text without markers as one run', () => {
    expect(kinds('Wie viel ist drei mal vier?')).toEqual(['Wie viel ist drei mal vier?']);
    expect(kinds('')).toEqual([]);
  });
});

describe('promptForSpeech', () => {
  it('reads every blank as the given word, without bold markers', () => {
    expect(
      promptForSpeech('**Ergänze:** Ich helfe ___ Mutter.', { blanks: true, blankWord: 'Lücke' }),
    ).toBe('Ergänze: Ich helfe Lücke Mutter.');
  });
  it('reads a filled blank with its answer', () => {
    expect(
      promptForSpeech('Ich helfe ___ Mutter.', {
        blanks: true,
        blankWord: 'Lücke',
        filledWord: 'Lücke: meiner',
      }),
    ).toBe('Ich helfe Lücke: meiner Mutter.');
  });
  it('keeps math as $…$ for the spoken-math step', () => {
    expect(promptForSpeech('$\\frac{3}{4}$ = ___', { blanks: true, blankWord: 'Lücke' })).toBe(
      '$\\frac{3}{4}$ = Lücke',
    );
  });
  it('leaves underscores alone when blanks are off', () => {
    expect(promptForSpeech('a ___ b', { blanks: false, blankWord: 'Lücke' })).toBe('a ___ b');
  });
});

describe('fillableAnswer', () => {
  it('fills the one blank with the trimmed answer', () => {
    expect(fillableAnswer('Ich helfe ___ Mutter.', '  meiner ')).toBe('meiner');
  });
  it('fills nothing without an answer, without a blank, or with several blanks', () => {
    expect(fillableAnswer('Ich helfe ___ Mutter.', '   ')).toBeNull();
    expect(fillableAnswer('Ich helfe ___ Mutter.', undefined)).toBeNull();
    expect(fillableAnswer('Wie heißt du?', 'Mia')).toBeNull();
    expect(fillableAnswer('___ und ___', 'a')).toBeNull();
  });
  it('fills nothing for long or multi-line answers', () => {
    expect(fillableAnswer('a ___ b', 'x'.repeat(MAX_FILLED_LENGTH + 1))).toBeNull();
    expect(fillableAnswer('a ___ b', 'x\ny')).toBeNull();
  });
});
