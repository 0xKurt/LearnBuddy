import { describe, expect, it } from 'vitest';

import { hasMath, parseMath, plainText, splitMath, type MathAtom } from '../parse.js';
import { speakMathText, type SpokenWords } from '../speak.js';

const T = ' ';

describe('splitMath', () => {
  it('keeps text without $ as one plain run', () => {
    expect(splitMath('Wie viel ist drei mal vier?')).toEqual([
      { type: 'plain', text: 'Wie viel ist drei mal vier?' },
    ]);
    expect(hasMath('Wie viel?')).toBe(false);
  });

  it('splits plain runs and math segments', () => {
    const s = splitMath('Kürze $\\frac{6}{8}$ bitte.');
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual({ type: 'plain', text: 'Kürze ' });
    expect(s[1]?.type).toBe('math');
    expect(s[2]).toEqual({ type: 'plain', text: ' bitte.' });
    expect(hasMath('Kürze $\\frac{6}{8}$')).toBe(true);
  });

  it('treats an unmatched $ as plain text', () => {
    expect(splitMath('Das kostet 5 $ und mehr')).toEqual([
      { type: 'plain', text: 'Das kostet 5 $ und mehr' },
    ]);
  });

  it('keeps an escaped \\$ literal and an empty $$ plain', () => {
    expect(splitMath('Preis: \\$5')).toEqual([{ type: 'plain', text: 'Preis: $5' }]);
    expect(plainText(splitMath('a $ $ b'))).toBe('a $ $ b');
  });

  it('reads $$…$$ as math', () => {
    const s = splitMath('$$x^2$$');
    expect(s).toHaveLength(1);
    expect(s[0]?.type).toBe('math');
  });

  it('handles several math segments', () => {
    const s = splitMath('$a$ und $b$');
    expect(s.map((x) => x.type)).toEqual(['math', 'plain', 'math']);
  });
});

describe('parseMath', () => {
  it('parses a fraction', () => {
    expect(parseMath('\\frac{3}{4}')).toEqual([
      { type: 'frac', num: [{ type: 'chars', text: '3' }], den: [{ type: 'chars', text: '4' }] },
    ]);
  });

  it('parses nested fractions', () => {
    const [f] = parseMath('\\frac{1}{\\frac{2}{3}}');
    expect(f?.type).toBe('frac');
    if (f?.type !== 'frac') return;
    expect(f.den[0]?.type).toBe('frac');
  });

  it('accepts \\frac with single-character arguments', () => {
    const [f] = parseMath('\\frac34');
    expect(f).toEqual({
      type: 'frac',
      num: [{ type: 'chars', text: '3' }],
      den: [{ type: 'chars', text: '4' }],
    });
  });

  it('parses powers with and without braces', () => {
    expect(parseMath('x^{2}')).toEqual([
      { type: 'chars', text: 'x' },
      { type: 'sup', body: [{ type: 'chars', text: '2' }] },
    ]);
    expect(parseMath('x^2')).toEqual(parseMath('x^{2}'));
    expect(parseMath('10^12')).toEqual([
      { type: 'chars', text: '10' },
      { type: 'sup', body: [{ type: 'chars', text: '12' }] },
    ]);
  });

  it('parses indices', () => {
    expect(parseMath('x_{1}')).toEqual([
      { type: 'chars', text: 'x' },
      { type: 'sub', body: [{ type: 'chars', text: '1' }] },
    ]);
  });

  it('parses square and nth roots', () => {
    expect(parseMath('\\sqrt{16}')).toEqual([
      { type: 'sqrt', index: null, body: [{ type: 'chars', text: '16' }] },
    ]);
    expect(parseMath('\\sqrt[3]{27}')).toEqual([
      {
        type: 'sqrt',
        index: [{ type: 'chars', text: '3' }],
        body: [{ type: 'chars', text: '27' }],
      },
    ]);
  });

  it('spaces binary operators and keeps a leading minus as a sign', () => {
    const atoms = parseMath('x^{2} - 4x + 3 = 0');
    expect(atoms).toEqual([
      { type: 'chars', text: 'x' },
      { type: 'sup', body: [{ type: 'chars', text: '2' }] },
      { type: 'chars', text: `${T}−${T}4x${T}+${T}3${T}=${T}0` },
    ]);
    expect(parseMath('-3 + (-2)')).toEqual([{ type: 'chars', text: `−3${T}+${T}(−2)` }]);
  });

  it('turns symbol commands into characters', () => {
    const atoms = parseMath('2 \\cdot \\pi \\le 7');
    const shown = atoms
      .map((a: MathAtom) => (a.type === 'chars' ? a.text : a.type === 'symbol' ? a.char : ''))
      .join('');
    expect(shown).toBe(`2${T}·${T}π${T}≤${T}7`);
  });

  it('shows ^\\circ and \\degree as a degree sign', () => {
    expect(plainText(splitMath('$90^\\circ$'))).toBe('90°');
    expect(plainText(splitMath('$45\\degree$'))).toBe('45°');
  });

  it('keeps \\left( \\right) as parentheses and \\text as words', () => {
    expect(plainText(splitMath('$\\left(x+1\\right)$'))).toBe(`(x${T}+${T}1)`);
    expect(plainText(splitMath('$5\\text{ cm}$'))).toBe('5 cm');
  });

  it('never throws on broken input', () => {
    for (const bad of ['\\frac{1', '}{', '^', 'x^', '\\sqrt[', '\\', '\\unknown{x}', '{{{']) {
      expect(() => parseMath(bad)).not.toThrow();
    }
    expect(plainText(splitMath('$\\foo$'))).toBe('foo');
  });
});

const DE: SpokenWords = {
  frac: '{{num}} durch {{den}}',
  frac_long: 'Bruch: {{num}}, durch {{den}}',
  power: 'hoch {{exp}}',
  squared: 'Quadrat',
  cubed: 'hoch 3',
  sub: 'Index {{sub}}',
  sqrt: 'Wurzel aus {{body}}',
  root: '{{index}}. Wurzel aus {{body}}',
  cbrt: 'dritte Wurzel aus {{body}}',
  symbols: { '+': 'plus', '−': 'minus', '=': 'gleich', '·': 'mal', π: 'pi', '≤': 'kleiner gleich' },
};

describe('speakMathText', () => {
  it('reads a simple fraction', () => {
    expect(speakMathText('$\\frac{3}{4}$', DE)).toBe('3 durch 4');
  });
  it('reads a sum of fractions inside a sentence', () => {
    expect(speakMathText('Rechne $\\frac{2}{3} + \\frac{1}{6}$.', DE)).toBe(
      'Rechne 2 durch 3 plus 1 durch 6.',
    );
  });
  it('reads powers, roots and indices', () => {
    expect(speakMathText('$x^{2} - 4x + 3 = 0$', DE)).toBe('x Quadrat minus 4x plus 3 gleich 0');
    expect(speakMathText('$\\sqrt{16}$', DE)).toBe('Wurzel aus 16');
    expect(speakMathText('$\\sqrt[3]{27}$', DE)).toBe('dritte Wurzel aus 27');
    expect(speakMathText('$\\sqrt[4]{16}$', DE)).toBe('4. Wurzel aus 16');
    expect(speakMathText('$x_{1}$', DE)).toBe('x Index 1');
    expect(speakMathText('$2^{5}$', DE)).toBe('2 hoch 5');
  });
  it('reads a longer fraction with the long form', () => {
    expect(speakMathText('$\\frac{x+1}{2}$', DE)).toBe('Bruch: x plus 1, durch 2');
  });
  it('leaves plain text alone', () => {
    expect(speakMathText('Wie viel ist 5 $?', DE)).toBe('Wie viel ist 5 $?');
  });
});
