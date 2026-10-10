import { describe, expect, it } from 'vitest';

import { growsWithText } from '../../../lib/growsWithText.js';

describe('a multiline field grows with her text, not with its placeholder (#188, #387)', () => {
  it('sizes to the content once she has typed', () => {
    expect(growsWithText('12,5')).toEqual({ fieldSizing: 'content' });
  });

  it('keeps its one row while empty: a wrapped placeholder never makes the bar taller', () => {
    // Clipped, not sized to the placeholder — and no scroll box holding its hidden second line.
    expect(growsWithText('')).toEqual({ overflow: 'hidden' });
  });
});
