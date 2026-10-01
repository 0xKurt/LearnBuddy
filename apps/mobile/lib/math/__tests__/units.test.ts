// Powers and units as a person reads them (issue #175, owner 01.10.: "das mit der
// aussprache sollte generell immer passen nicht nur bei bruechen"). The words come from
// the real locale files, so what is checked here is what the app says out loud.

import { describe, expect, it } from 'vitest';

import { speakMathText } from '../speak.js';
import { wordsOf } from './words.js';

const say = (text: string, lang: 'de' | 'en' | 'fr' | 'es' | 'it' = 'de') =>
  speakMathText(text, wordsOf(lang));

describe('powers', () => {
  it('reads a power as a power, not as a noun', () => {
    // "5 Quadrat" is not something anyone says; a teacher says "fünf hoch zwei".
    expect(say('$5^{2}$')).toBe('5 hoch 2');
    expect(say('$x^{2}$')).toBe('x hoch 2');
    expect(say('$5^{3}$')).toBe('5 hoch 3');
    expect(say('$2^{5}$')).toBe('2 hoch 5');
  });

  it('reads it idiomatically in the other four', () => {
    expect(say('$5^{2}$', 'en')).toBe('5 to the power of 2');
    expect(say('$5^{2}$', 'fr')).toBe('5 au carré');
    expect(say('$5^{3}$', 'es')).toBe('5 al cubo');
    expect(say('$5^{2}$', 'it')).toBe('5 al quadrato');
  });
});

describe('units', () => {
  it('says the unit instead of spelling its symbol', () => {
    expect(say('$1{,}5 \\text{m}$')).toBe('1,5 Meter');
    expect(say('$250 \\text{ml}$')).toBe('250 Milliliter');
    expect(say('$3 \\text{kg}$')).toBe('3 Kilogramm');
  });

  it('keeps the number and the unit apart', () => {
    // "$3\text{cm}$" used to come out "3cm", which a voice reads as one word.
    expect(say('$3\\text{cm}$')).toBe('3 Zentimeter');
  });

  it('makes a squared unit one word, not a power', () => {
    expect(say('$3 \\text{cm}^2$')).toBe('3 Quadratzentimeter');
    expect(say('$12 \\text{m}^{2}$')).toBe('12 Quadratmeter');
    expect(say('$5 \\text{cm}^{3}$')).toBe('5 Kubikzentimeter');
    expect(say('$3 \\text{cm}^2$', 'en')).toBe('3 square centimetres');
    expect(say('$3 \\text{cm}^2$', 'fr')).toBe('3 centimètres carrés');
    expect(say('$3 \\text{cm}^2$', 'es')).toBe('3 centímetros cuadrados');
    expect(say('$3 \\text{cm}^2$', 'it')).toBe('3 centimetri quadrati');
  });

  it('reads a temperature, not a degree sign and a letter', () => {
    expect(say('$15°C$')).toBe('15 Grad Celsius');
    expect(say('$15°C$', 'en')).toBe('15 degrees Celsius');
    // A plain degree is still a plain degree.
    expect(say('$90°$')).toBe('90 Grad');
  });

  it('leaves a symbol the language does not name alone', () => {
    // Clumsy, but true — never an invented word (rule 5).
    expect(say('$4 \\text{ha}$')).toBe('4 ha');
    expect(say('$4 \\text{ha}^2$')).toBe('4 ha hoch 2');
  });
});
