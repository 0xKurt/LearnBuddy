// The notation the model is told it may write is the notation the app draws and reads out
// (issue #239). Both directions, mechanically: every command the contract lists is handled by
// the parser, and every entry of the prompt list is drawn and spoken in all five languages.

import {
  MATH_COMMANDS,
  MATH_NOTATION_RULE,
  MATH_PROMPTED,
  MATH_SYMBOLS,
  unsupportedMath,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { parseMath, type MathAtom } from '../parse.js';
import { SYMBOL_KEYS, speakMathText } from '../speak.js';
import { DE, wordsOf } from './words.js';

/** Every atom of a tree, depth first. */
function walk(atoms: MathAtom[]): MathAtom[] {
  return atoms.flatMap((a): MathAtom[] => {
    switch (a.type) {
      case 'frac':
        return [a, ...walk(a.num), ...walk(a.den)];
      case 'sup':
      case 'sub':
      case 'overline':
      case 'vec':
        return [a, ...walk(a.body)];
      case 'sqrt':
        return [a, ...walk(a.index ?? []), ...walk(a.body)];
      case 'limits':
        return [a, ...walk(a.lower ?? []), ...walk(a.upper ?? [])];
      case 'binom':
        return [a, ...walk(a.top), ...walk(a.bottom)];
      case 'matrix':
        return [a, ...a.rows.flat().flatMap(walk)];
      case 'arrow':
        return [a, ...walk(a.above)];
      default:
        return [a];
    }
  });
}

/** The parser's fallback for a command it does not know: its bare name as text. */
function fellThrough(atoms: MathAtom[], name: string): boolean {
  return walk(atoms).some((a) => a.type === 'text' && a.text === ` ${name} `);
}

describe('the notation contract (issue #239)', () => {
  it('every command the contract lists is handled by the parser, none falls through', () => {
    for (const name of MATH_COMMANDS) {
      const src =
        name === 'begin'
          ? '\\begin{pmatrix} a \\\\ b \\end{pmatrix}'
          : name === 'end'
            ? 'a \\end{pmatrix}'
            : `\\${name}{a}{b}`;
      expect(fellThrough(parseMath(src), name), name).toBe(false);
    }
  });

  it('every symbol is drawn as its character', () => {
    for (const [name, char] of Object.entries(MATH_SYMBOLS)) {
      const atoms = walk(parseMath(`\\${name}`));
      expect(
        atoms.some((a) => a.type === 'symbol' && a.char.trim() === char),
        name,
      ).toBe(true);
    }
  });

  for (const lang of ['de', 'en', 'fr', 'es', 'it'] as const) {
    it(`every entry the model is told about is drawn and spoken (${lang})`, () => {
      const words = wordsOf(lang);
      for (const { latex } of MATH_PROMPTED) {
        expect(unsupportedMath(latex), latex).toEqual([]);
        const atoms = parseMath(latex);
        expect(atoms.length, latex).toBeGreaterThan(0);
        const said = speakMathText(`$${latex}$`, words);
        // No LaTeX reaches the voice, and no symbol is left for the voice to guess at.
        expect(said, latex).not.toMatch(/\\|[{}]/);
        for (const ch of Object.values(MATH_SYMBOLS))
          if (said.includes(ch)) expect(SYMBOL_KEYS[ch], `${latex} → "${said}"`).toBeDefined();
        expect(said, latex).not.toMatch(/[∑∏∫⟶⇌ℕℤℚℝ]/);
      }
    });
  }

  it('the rule the model reads names exactly the prompted list', () => {
    for (const { latex } of MATH_PROMPTED) expect(MATH_NOTATION_RULE).toContain(latex);
  });
});

describe('the new notation, drawn and spoken', () => {
  it('reads a reaction and an equilibrium as chemistry, not as "geht nach"', () => {
    // The number under an element is said the chemistry teacher's way, "H zwei" (issue #238).
    expect(speakMathText('$2H_{2} + O_{2} \\longrightarrow 2H_{2}O$', DE)).toBe(
      '2H 2 plus O 2 reagiert zu 2H 2 O',
    );
    expect(speakMathText('$N_{2} + 3H_{2} \\rightleftharpoons 2NH_{3}$', DE)).toContain(
      'steht im Gleichgewicht mit',
    );
  });

  it('keeps the limits with their operator', () => {
    const [sum] = parseMath('\\sum_{i=1}^{n} i');
    expect(sum).toMatchObject({ type: 'limits', name: 'sum', op: '∑' });
    expect(speakMathText('$\\int_{0}^{1} x \\, dx$', DE)).toBe('Integral von 0 bis 1 x dx');
    expect(speakMathText('$\\sum_{i=1}^{n} i$', DE)).toBe('Summe von i gleich 1 bis n i');
    expect(speakMathText('$\\lim_{x \\to 0}$', DE)).toBe('Grenzwert für x geht nach 0');
  });

  it('reads a binomial coefficient, a column vector and a labelled arrow', () => {
    expect(speakMathText('$\\binom{5}{2}$', DE)).toBe('5 über 2');
    expect(speakMathText('$\\binom{5}{2}$', wordsOf('fr'))).toBe('2 parmi 5');
    expect(parseMath('\\begin{pmatrix} 1 \\\\ -2 \\end{pmatrix}')).toEqual([
      {
        type: 'matrix',
        rows: [[[{ type: 'chars', text: '1' }]], [[{ type: 'chars', text: '−2' }]]],
      },
    ]);
    expect(speakMathText('$\\begin{pmatrix} 1 \\\\ 2 \\end{pmatrix}$', DE)).toBe(
      'Spaltenvektor 1, 2',
    );
    expect(speakMathText('$\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}$', DE)).toBe(
      'Matrix mit den Zeilen 1, 0; 0, 1',
    );
    expect(speakMathText('$CaCO_{3} \\xrightarrow{\\text{Hitze}} CaO + CO_{2}$', DE)).toBe(
      'CaCO 3 reagiert zu, Bedingung: Hitze CaO plus CO 2',
    );
  });
});

describe('unsupportedMath', () => {
  it('finds what the app cannot draw, and nothing else', () => {
    expect(unsupportedMath('Kürze $\\frac{6}{8}$ und rechne $3 \\cdot 4$.')).toEqual([]);
    expect(unsupportedMath('kostet \\$5')).toEqual([]);
    expect(unsupportedMath('$\\overbrace{x}$ und $\\iint f$')).toEqual(['\\overbrace', '\\iint']);
    expect(unsupportedMath('$\\begin{bmatrix} 1 \\end{bmatrix}$')).toEqual([
      '\\begin{bmatrix}',
      '\\end{bmatrix}',
    ]);
  });
});
