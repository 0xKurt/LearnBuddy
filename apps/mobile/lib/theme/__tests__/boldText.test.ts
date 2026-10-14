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

  it('replaces the style objects, so a component rendering again repaints (#631)', () => {
    // The same rule frozen-colors.test.ts keeps for colours: nothing remounts any more, and React
    // Native only repaints a style it gets as a new object.
    const before = TYPE.body;
    applyBoldText(true, palette);
    expect(TYPE.body).not.toBe(before);
    expect(TYPE.body.fontFamily).toBe('Figtree_600SemiBold');
  });

  it('goes back when the setting goes back', () => {
    const plain = TYPE.title.fontWeight;
    applyBoldText(true, palette);
    applyBoldText(false, palette);
    expect(TYPE.title.fontWeight).toBe(plain);
  });
});

it('uses the supplied Figtree scale and keeps aliases current across palettes', () => {
  expect(TYPE.body.fontFamily).toBe('Figtree_400Regular');
  expect(TYPE.display.fontSize).toBe(32);
  expect(TYPE.question.fontSize).toBe(22);
  expect(TYPE.header).toEqual(TYPE.title);
  expect(TYPE.prompt).toEqual(TYPE.question);
  expect(TYPE.small).toEqual(TYPE.meta);
  expect(TYPE.caption).toEqual(TYPE.meta);
  applyBoldText(true, paletteOf('pastellDark'));
  expect(TYPE.body.color).toBe(paletteOf('pastellDark').ink);
  expect(TYPE.body.fontFamily).toBe('Figtree_600SemiBold');
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

it('keeps semantic control roles current through Bold Text and palette updates', () => {
  expect(TYPE.action).toMatchObject({
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: -0.1,
  });
  expect(TYPE.cell).toMatchObject({ fontSize: 16, lineHeight: 23, fontWeight: '600' });
  expect(TYPE.metaStrong).toMatchObject({ fontSize: 14, lineHeight: 20, fontWeight: '700' });
  applyBoldText(true, palette);
  applyType(paletteOf('oceanDark'));
  for (const key of ['action', 'cell', 'metaStrong', 'chip'] as const) {
    expect(TYPE[key].fontWeight).toBe('800');
    expect(TYPE[key].fontFamily).toBe('Figtree_800ExtraBold');
  }
  expect(TYPE.action.color).toBe(paletteOf('oceanDark').ink);
  expect(TYPE.metaStrong.color).toBe(paletteOf('oceanDark').ink2);
  applyBoldText(false, palette);
  expect(TYPE.action.fontWeight).toBe('700');
  expect(TYPE.cell.fontWeight).toBe('600');
});

it('keeps header and recording roles current through Bold Text and palette changes', () => {
  expect(TYPE.brand).toMatchObject({
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  });
  expect(TYPE.headerMeta).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: '600' });
  expect(TYPE.voiceStatus).toMatchObject({
    fontSize: TYPE.body.fontSize,
    lineHeight: TYPE.body.lineHeight,
    fontWeight: '600',
  });
  applyBoldText(true, paletteOf('pastellDark'));
  expect(TYPE.headerMeta.fontFamily).toBe('Figtree_800ExtraBold');
  expect(TYPE.voiceStatus.fontFamily).toBe('Figtree_800ExtraBold');
  expect(TYPE.voiceStatus.color).toBe(paletteOf('pastellDark').ink);
  applyType(paletteOf('oceanDark'));
  expect(TYPE.headerMeta.color).toBe(paletteOf('oceanDark').ink2);
  expect(TYPE.voiceStatus.fontFamily).toBe('Figtree_800ExtraBold');
});

it('keeps semibold metadata face current under Bold Text', () => {
  applyBoldText(false, palette);
  expect(TYPE.metaSemibold.fontFamily).toBe('Figtree_600SemiBold');
  applyBoldText(true, palette);
  expect(TYPE.metaSemibold.fontFamily).toBe('Figtree_800ExtraBold');
});
