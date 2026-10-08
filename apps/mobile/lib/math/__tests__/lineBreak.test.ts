// Where MathText may break a line that holds math (issue #467): the groups it draws as one
// piece each. A number and its unit are one group, wherever the number stands.

import { describe, expect, it } from 'vitest';

import { breakGroups, type Piece } from '../lineBreak.js';
import { THIN } from '../parse.js';
import { parsePrompt } from '../prompt.js';
import { NO_BREAK } from '../quantity.js';

const piece = (p: Piece): string =>
  p.kind === 'plain'
    ? p.text
    : p.kind === 'blank'
      ? '___'
      : p.atom.type === 'chars'
        ? p.atom.text
        : `[${p.atom.type}]`;
/** Each group as text: a no-break space shows as ~, a thin space as ^. */
const groups = (text: string) =>
  breakGroups(parsePrompt(text, { blanks: true })).map((g) =>
    g.map(piece).join('').trim().replaceAll(NO_BREAK, '~').replaceAll(THIN, '^'),
  );

describe('breakGroups', () => {
  it('breaks at the spaces of the text, between words', () => {
    expect(groups('Kürze $\\frac{6}{8}$ bitte')).toEqual(['Kürze', '[frac]', 'bitte']);
  });

  it('keeps a number in math and the unit after it in one group', () => {
    expect(groups('Er fährt $15$ km/h und $\\frac{1}{2}$ Kinder.')).toEqual([
      'Er',
      'fährt',
      '15~km/h',
      'und',
      '[frac]',
      'Kinder.',
    ]);
  });

  it('keeps a number and its unit in one group next to math', () => {
    expect(groups('$x$ ist 3,5 m² oder 20 %')).toEqual(['x', 'ist', '3,5~m²', 'oder', '20~%']);
  });

  it('still breaks after a spaced operator inside math', () => {
    // A thin space on each side of the operator; the break comes after the second one.
    expect(groups('$x^{2} - 4x + 3$')).toEqual(['x[sup]^−', '4x^+', '3']);
  });
});
