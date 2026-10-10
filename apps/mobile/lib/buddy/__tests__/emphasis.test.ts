import { describe, expect, it } from 'vitest';

import { splitEmphasis, withoutEmphasis } from '../emphasis.js';

describe('splitEmphasis', () => {
  it('turns **x** into bold runs and keeps the rest', () => {
    expect(splitEmphasis('Länge **mal** Breite')).toEqual([
      { text: 'Länge ', bold: false },
      { text: 'mal', bold: true },
      { text: ' Breite', bold: false },
    ]);
    expect(withoutEmphasis('**Tipp:** rechne')).toBe('Tipp: rechne');
  });

  it('leaves lone asterisks alone', () => {
    expect(splitEmphasis('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6', bold: false }]);
  });
});
