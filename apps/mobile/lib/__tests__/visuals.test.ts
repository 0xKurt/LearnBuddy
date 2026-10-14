import type { Figure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { boardCap, roomCap, standsAlone, visualCaps, visualGrows } from '../practice/visuals.js';

describe('the figure table (issue #310, step 5)', () => {
  it('lets every drawing grow but a note line, which only gives (#275)', () => {
    expect(visualGrows({ type: 'staff' } as Figure)).toBe(false);
    // A program is text: the card grew around it and left an empty band (#262, #387).
    expect(visualGrows({ type: 'code' } as Figure)).toBe(false);
    expect(visualGrows({ type: 'geometry' } as Figure)).toBe(true);
    expect(visualGrows(null)).toBe(true);
  });

  it('a labelled picture that is an image stands alone under the card; the circuit we draw does not', () => {
    const picture = (d: string) => ({ type: 'schematic', d, n: ['a', 'b'], ask: 1 }) as Figure;
    expect(standsAlone(picture('bicycle'))).toBe(true);
    expect(standsAlone(picture('skeleton'))).toBe(true);
    expect(standsAlone(picture('circuit'))).toBe(false);
    expect(standsAlone({ type: 'geometry' } as Figure)).toBe(false);
    expect(standsAlone(null)).toBe(false);
    // It is not in the card: the card has nothing to grow around.
    expect(visualGrows(picture('bicycle'))).toBe(false);
    expect(visualGrows(picture('circuit'))).toBe(true);
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

describe('a picture that gives way to the measured room (#599)', () => {
  it('gives what runs past, shared by the rows above each other', () => {
    // Four pictures as options, two rows at 89 pt: the bar ran 30 pt past 360 × 740.
    expect(roomCap(89, -30, 2, 89, 36)).toBe(74);
    // A skeleton under a two-line question, one picture: the body ran 13 pt past.
    expect(roomCap(333, -13, 1, 333, 133)).toBe(320);
  });

  it('takes free room back up to its share, and never shrinks below its least', () => {
    expect(roomCap(74, 40, 2, 89, 36)).toBe(89);
    expect(roomCap(74, 9, 2, 89, 36)).toBe(78);
    expect(roomCap(40, -200, 2, 89, 36)).toBe(36);
    // A rounding pixel to spare over two rows moves nothing.
    expect(roomCap(74, 1, 2, 89, 36)).toBe(74);
  });
});
