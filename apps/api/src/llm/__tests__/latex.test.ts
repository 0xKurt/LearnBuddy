import { describe, expect, it } from 'vitest';

import { repairJsonStrings, repairLatexEscapes } from '../latex.js';

describe('LaTeX escapes lost in model JSON', () => {
  it('turns control characters from single backslashes back into commands', () => {
    // Live: the tutor wrote "7 \times 4", JSON made it TAB + "imes".
    expect(repairLatexEscapes('Rechne $7 \times 4$.')).toBe('Rechne $7 \\times 4$.');
    expect(repairLatexEscapes('$\frac{3}{4}$')).toBe('$\\frac{3}{4}$');
    expect(repairLatexEscapes('$\beta$')).toBe('$\\beta$');
    expect(repairLatexEscapes('$a \neq b$ und $\right)$')).toBe('$a \\neq b$ und $\\right)$');
  });

  it('keeps real line breaks in prose and leaves correct text alone', () => {
    expect(repairLatexEscapes('Zeile eins\nneue Zeile')).toBe('Zeile eins\nneue Zeile');
    expect(repairLatexEscapes('$\\frac{1}{2}$')).toBe('$\\frac{1}{2}$');
    expect(repairLatexEscapes('ohne Mathe')).toBe('ohne Mathe');
  });

  it('repairs every string of a parsed answer', () => {
    expect(
      repairJsonStrings({ reply: '$2 \times 3$', items: [{ a: '$\frac{1}{2}$' }], n: 3 }),
    ).toEqual({
      reply: '$2 \\times 3$',
      items: [{ a: '$\\frac{1}{2}$' }],
      n: 3,
    });
  });
});
