import type { Figure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { boardCap, visualCaps, visualGrows } from '../practice/visuals.js';

describe('the figure table (issue #310, step 5)', () => {
  it('lets every drawing grow but a note line, which only gives (#275)', () => {
    expect(visualGrows({ type: 'staff' } as Figure)).toBe(false);
    expect(visualGrows({ type: 'geometry' } as Figure)).toBe(true);
    expect(visualGrows(null)).toBe(true);
  });

  it('caps a drawing at 14 % and a photo at 20 % (≤ 180 pt) of what she sees', () => {
    expect(visualCaps(740, 0)).toEqual({ figure: 104, image: 148 });
    expect(visualCaps(1000, 0)).toEqual({ figure: 140, image: 180 });
  });

  it('takes what the card gives back off both caps, never adds its growth', () => {
    expect(visualCaps(740, -30)).toEqual({ figure: 74, image: 118 });
    expect(visualCaps(740, 200)).toEqual({ figure: 104, image: 148 });
  });
});

describe('a figure she answers in (#251)', () => {
  it('stands at most 45 % of what she sees: 333 pt on 360 × 740, the room maps are checked in', () => {
    expect(boardCap(740)).toBe(333);
    expect(boardCap(844)).toBe(380);
  });
});
