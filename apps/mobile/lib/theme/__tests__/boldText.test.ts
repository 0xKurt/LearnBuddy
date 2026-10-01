// The OS's Bold Text setting reaches the whole type scale (issue #133 position 13).
//
// Someone who turns it on is saying thin type is hard to read. The app's hierarchy is
// carried by weight — one bold headline, 600 for a title, 400 for body — so every style
// moves up one step and the scale stays intact rather than collapsing into one weight.

import { afterEach, describe, expect, it } from 'vitest';

import { applyBoldText, TYPE } from '../type.js';
import { DEFAULT_THEME, paletteOf } from '../palettes.js';

const palette = paletteOf(DEFAULT_THEME);

afterEach(() => applyBoldText(false, palette));

describe('bold text', () => {
  it('lifts every style by one step, keeping the hierarchy', () => {
    const before = {
      display: TYPE.display.fontWeight,
      title: TYPE.title.fontWeight,
      body: TYPE.body.fontWeight,
    };
    applyBoldText(true, palette);
    expect(TYPE.display.fontWeight).not.toBe(before.display);
    expect(TYPE.title.fontWeight).not.toBe(before.title);
    // Body has no weight of its own; bold gives it one.
    expect(TYPE.body.fontWeight).toBeTruthy();
    // The headline stays heavier than the title, and the title heavier than the body.
    const n = (w: unknown) => Number(w ?? 400);
    expect(n(TYPE.display.fontWeight)).toBeGreaterThanOrEqual(n(TYPE.title.fontWeight));
    expect(n(TYPE.title.fontWeight)).toBeGreaterThan(n(TYPE.body.fontWeight));
  });

  it('refills the style objects in place, so a held reference follows', () => {
    // The same guard frozen-colors.test.ts keeps for colours (issue #84): a component that
    // read TYPE.body once must see the change.
    const held = TYPE.body;
    applyBoldText(true, palette);
    expect(held).toBe(TYPE.body);
    expect(held.fontWeight).toBeTruthy();
  });

  it('goes back when the setting goes back', () => {
    const plain = TYPE.title.fontWeight;
    applyBoldText(true, palette);
    applyBoldText(false, palette);
    expect(TYPE.title.fontWeight).toBe(plain);
  });
});
