// The one rule for what a screen keeps free at its bottom edge (issue #142).

import { describe, expect, it } from 'vitest';

import { bottomRoom, CARD_PAD, GUTTER, GUTTER_APP, GUTTER_OUTER, RHYTHM, SPACE } from '../space.js';

describe('the spacing scale of the design (tokens/space.css, #599)', () => {
  it('has the seven steps 4 · 8 · 12 · 16 · 20 · 24 · 32', () => {
    expect(SPACE).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24, xxl: 32 });
  });

  it('keeps 16 inside the app and 20 before it', () => {
    expect(GUTTER_APP).toBe(16);
    expect(GUTTER_OUTER).toBe(20);
  });

  it('pads a content card with --card-pad and a card in the conversation with --space-lg', () => {
    expect(CARD_PAD.card).toBe(20);
    expect(CARD_PAD.thread).toBe(16);
    // No card of the design is padded wider than --card-pad.
    expect(Math.max(...Object.values(CARD_PAD))).toBe(20);
  });

  it('keeps the old names alive until their callers moved (owner rule 6)', () => {
    expect(GUTTER).toBe(GUTTER_APP);
    expect(CARD_PAD.snug).toBe(SPACE.md);
    expect(CARD_PAD.base).toBe(SPACE.lg);
    expect(CARD_PAD.roomy).toBe(CARD_PAD.card);
    expect(RHYTHM).toEqual({ parts: SPACE.sm, stack: SPACE.md, sections: SPACE.xl });
  });
});

describe('the room at the bottom edge', () => {
  it('is the design gap where the system takes nothing (web, older phones)', () => {
    expect(bottomRoom(0)).toBe(SPACE.lg);
    expect(bottomRoom(0, SPACE.md)).toBe(SPACE.md);
  });

  it('adds the gap on top of the system inset, never swallows it', () => {
    // The old Math.max(insets.bottom, 16) answered 48 here — the bar ON the nav bar.
    expect(bottomRoom(48)).toBe(48 + SPACE.lg);
    expect(bottomRoom(34, SPACE.md)).toBe(34 + SPACE.md);
  });

  it('grows with the inset, so a gesture bar and a button bar both get their gap', () => {
    expect(bottomRoom(34)).toBeGreaterThan(bottomRoom(16));
  });
});
