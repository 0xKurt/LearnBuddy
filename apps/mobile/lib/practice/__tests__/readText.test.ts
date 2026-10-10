// The question and the verdict as Buddy reads them in a practice (lib/practice/readText.ts).

import { describe, expect, it } from 'vitest';

// The real German words (locales/de/math.json), not a copy — see lib/math/__tests__/words.ts.
import { DE as WORDS } from '../../math/__tests__/words.js';
import { choiceLetter, endSentence, feedbackReadText, questionReadText } from '../readText.js';

describe('endSentence', () => {
  it('adds a full stop only when the sentence has no ending', () => {
    expect(endSentence('Wie viel ist das')).toBe('Wie viel ist das.');
    expect(endSentence('Wie viel ist das?')).toBe('Wie viel ist das?');
    expect(endSentence('  ')).toBe('');
  });
});

describe('questionReadText', () => {
  it('reads a question without choices as it is', () => {
    expect(questionReadText('Was ist $3 + 4$?', null, WORDS)).toBe('Was ist 3 plus 4?');
  });

  it('reads a quantity as written: the no-break space MathText draws is not spoken (#467)', () => {
    expect(questionReadText('Er fährt $15$ km/h und 3,5 m², 20 % bei 90 °C.', null, WORDS)).toBe(
      'Er fährt 15 km/h und 3,5 m², 20 % bei 90 °C.',
    );
  });

  it('reads the choices as "A: …, B: …" after the question', () => {
    expect(
      questionReadText(
        'Welcher Bruch ist größer?',
        ['$\\frac{1}{2}$', '$\\frac{3}{4}$', 'beide gleich'],
        WORDS,
      ),
    ).toBe('Welcher Bruch ist größer? A: ein Halb, B: 3 Viertel, C: beide gleich.');
  });

  it('ends a question without punctuation before the choices', () => {
    expect(questionReadText('Wähle das Verb', ['laufen', 'Haus'], WORDS)).toBe(
      'Wähle das Verb. A: laufen, B: Haus.',
    );
  });

  it('reads a fill-in gap as the gap word, not as underscores', () => {
    expect(questionReadText('Ich helfe ___ Mutter.', null, WORDS)).toBe('Ich helfe Lücke Mutter.');
    expect(questionReadText('**_____** ist ein Verb', null, WORDS)).toBe('Lücke ist ein Verb.');
  });

  it('skips empty choices without shifting the others', () => {
    expect(questionReadText('Welche?', ['eins', ' ', 'drei'], WORDS)).toBe(
      'Welche? A: eins, C: drei.',
    );
  });
});

describe('choiceLetter', () => {
  it('counts A to Z, then numbers', () => {
    expect(choiceLetter(0)).toBe('A');
    expect(choiceLetter(25)).toBe('Z');
    expect(choiceLetter(26)).toBe('27');
  });
});

describe('feedbackReadText', () => {
  it('puts the verdict word before the reply', () => {
    expect(feedbackReadText('Richtig', 'Genau, **28 cm²**.', WORDS)).toBe(
      'Richtig. Genau, 28 cm².',
    );
  });

  it('does not say the word twice when the reply starts with it', () => {
    expect(feedbackReadText('Richtig', 'Richtig! Gut gemacht.', WORDS)).toBe(
      'Richtig! Gut gemacht.',
    );
  });

  it('reads only the reply without a verdict word', () => {
    expect(feedbackReadText(null, 'Was weißt du über Rechtecke?', WORDS)).toBe(
      'Was weißt du über Rechtecke?',
    );
  });
});
