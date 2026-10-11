// The OS's Bold Text setting reaches the whole type scale (issue #133 position 13).
//
// Someone who turns it on is saying thin type is hard to read. The app's hierarchy is
// carried by weight — one bold headline, 600 for a title, 400 for body — so every style
// moves up one step and the scale stays intact rather than collapsing into one weight.

import { afterEach, describe, expect, it } from 'vitest';

import { applyBoldText, applyType, fontFace, TYPE } from '../type.js';
import { DEFAULT_THEME, paletteOf } from '../palettes.js';

const palette = paletteOf(DEFAULT_THEME);

afterEach(() => applyBoldText(false, palette));

describe('bold text', () => {
  it('lifts every style by one step, keeping the hierarchy', () => {
    const before = {
      title: TYPE.title.fontWeight,
      body: TYPE.body.fontWeight,
    };
    applyBoldText(true, palette);
    expect(TYPE.display.fontWeight).toBe('800');
    expect(TYPE.body.fontWeight).not.toBe(before.body);
    expect(TYPE.body.fontFamily).toBe('Figtree_600SemiBold');
    expect(TYPE.title.fontWeight).not.toBe(before.title);
    // Body grows heavier while the display stays at the heaviest loaded face.
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

it('uses the supplied Figtree scale and keeps aliases live across palettes', () => {
  expect(TYPE.body.fontFamily).toBe('Figtree_400Regular');
  expect(TYPE.display.fontSize).toBe(32);
  expect(TYPE.question.fontSize).toBe(22);
  expect(TYPE.header).toEqual(TYPE.title);
  expect(TYPE.prompt).toEqual(TYPE.question);
  expect(TYPE.small).toEqual(TYPE.meta);
  expect(TYPE.caption).toEqual(TYPE.meta);
  const held = TYPE.body;
  applyBoldText(true, paletteOf('pastellDark'));
  expect(held.color).toBe(paletteOf('pastellDark').ink);
  expect(held.fontFamily).toBe('Figtree_600SemiBold');
});

it('keeps a live Bold Text face through palette changes, including monospace code', () => {
  applyBoldText(true, palette);
  applyType(paletteOf('oceanDark'));
  expect(TYPE.body.fontFamily).toBe('Figtree_600SemiBold');
  expect(TYPE.code.fontWeight).toBe('600');
  expect(TYPE.code.fontFamily).not.toContain('Figtree');
  expect(fontFace('500').fontFamily).toBe('Figtree_700Bold');
  expect(TYPE.body.color).toBe(paletteOf('oceanDark').ink);
});
