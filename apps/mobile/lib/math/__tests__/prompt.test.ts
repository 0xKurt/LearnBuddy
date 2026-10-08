import { describe, expect, it } from 'vitest';

import {
  countBlanks,
  fillableAnswer,
  MAX_FILLED_LENGTH,
  parsePrompt,
  promptForSpeech,
} from '../prompt.js';
import { NO_BREAK } from '../quantity.js';

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
  it('works next to math and counts a blank inside $…$ as one of the blanks', () => {
    expect(kinds('$\\frac{3}{4}$ = ___')).toEqual(['$', ' = ', '[0]']);
    // The math blank is blank 0 (drawn by MathText), the plain one after it blank 1.
    expect(kinds('$x_{___}$ und ___')).toEqual(['$', ' und ', '[1]']);
    expect(countBlanks('$a___b$')).toBe(1);
    // Audit M-41: the most common fraction exercise.
    expect(countBlanks('Erweitere: $\\frac{3}{4} = \\frac{___}{8}$')).toBe(1);
    expect(countBlanks('$3 + \\square = 7$')).toBe(1);
    expect(countBlanks('$a__b$')).toBe(0);
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
  it('reads a blank inside math as the blank word, filled or not', () => {
    const text = 'Erweitere: $\\frac{3}{4} = \\frac{___}{8}$';
    expect(promptForSpeech(text, { blanks: true, blankWord: 'Lücke' })).toBe(
      'Erweitere: $\\frac{3}{4} = \\frac{\\text{Lücke}}{8}$',
    );
    expect(
      promptForSpeech(text, { blanks: true, blankWord: 'Lücke', filledWord: 'Lücke, darin: 6' }),
    ).toBe('Erweitere: $\\frac{3}{4} = \\frac{\\text{Lücke, darin: 6}}{8}$');
    expect(fillableAnswer(text, '6')).toBe('6');
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
  it('fills a blank with an answer far wider than the gap (issue #62)', () => {
    // The owner's sentence, 28.09.: "have lived" is several times the width of an empty gap
    // and still belongs in it whole — the gap grows, the answer is never shortened to fit.
    const text = 'They ___ (live) in Berlin since 2015.';
    expect(fillableAnswer(text, 'have lived')).toBe('have lived');
    expect(
      promptForSpeech(text, {
        blanks: true,
        blankWord: 'Lücke',
        filledWord: 'Lücke, darin: have lived',
      }),
    ).toBe('They Lücke, darin: have lived (live) in Berlin since 2015.');
    // Right up to the limit the whole answer stands there; only past it the sentence
    // would break apart, and then nothing is filled in at all (next test).
    expect(fillableAnswer('a ___ b', 'x'.repeat(MAX_FILLED_LENGTH))).toHaveLength(
      MAX_FILLED_LENGTH,
    );
  });
  it('fills nothing for long or multi-line answers', () => {
    expect(fillableAnswer('a ___ b', 'x'.repeat(MAX_FILLED_LENGTH + 1))).toBeNull();
    expect(fillableAnswer('a ___ b', 'x\ny')).toBeNull();
  });
});

describe('parsePrompt: a number and its unit stay together (issue #467)', () => {
  const plain = (text: string) =>
    parsePrompt(text, { blanks: true }).map((r) =>
      r.type === 'plain' ? r.text.replaceAll(NO_BREAK, '~') : r.type,
    );
  it('binds them in plain text, and after a number in math or in bold', () => {
    expect(plain('Er fährt 15 km/h, 15 Kinder warten.')).toEqual([
      'Er fährt 15~km/h, 15 Kinder warten.',
    ]);
    expect(plain('Er fährt $15$ km/h.')).toEqual(['Er fährt ', 'math', '~km/h.']);
    expect(plain('Er fährt **15** km/h.')).toEqual(['Er fährt ', '15', '~km/h.']);
    expect(plain('$\\frac{1}{2}$ Kinder')).toEqual(['math', ' Kinder']);
  });
  it('leaves the spoken form exactly as written', () => {
    expect(
      promptForSpeech('Er fährt $15$ km/h und 3,5 m², 20 %.', { blanks: true, blankWord: 'Lücke' }),
    ).toBe('Er fährt $15$ km/h und 3,5 m², 20 %.');
  });
});

describe('parsePrompt italic', () => {
  const slant = (text: string) =>
    parsePrompt(text, { blanks: true }).map((r) =>
      r.type === 'plain' ? `${r.bold ? 'B' : ''}${r.italic ? 'I' : ''}:${r.text}` : r.type,
    );
  it('reads *italic* and _italic_, alone and inside bold', () => {
    expect(slant('Das ist *wichtig* und _so_.')).toEqual([
      ':Das ist ',
      'I:wichtig',
      ': und ',
      'I:so',
      ':.',
    ]);
    expect(slant('**ganz *sehr* fett**')).toEqual(['B:ganz ', 'BI:sehr', 'B: fett']);
  });
  it('leaves products, indices and blanks as they are', () => {
    expect(slant('2 * 3 * 4 und 2*3*4')).toEqual([':2 * 3 * 4 und 2*3*4']);
    expect(slant('x_1 und ___ hier')).toEqual([':x_1 und ', 'blank', ': hier']);
  });
  it('does not add an italic flag to runs without it', () => {
    expect(parsePrompt('a', { blanks: false })).toEqual([
      { type: 'plain', text: 'a', bold: false },
    ]);
  });
  it('reads italic text without its markers', () => {
    expect(promptForSpeech('Das ist *wichtig*.', { blanks: false, blankWord: 'Lücke' })).toBe(
      'Das ist wichtig.',
    );
  });
});
