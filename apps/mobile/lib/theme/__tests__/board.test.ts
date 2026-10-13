// The answer board's one state set, held to the design's numbers (components/practice/Tasks.jsx
// `T`, `Tile`, `WordBank`, `Cloze`, `FillTable`; components/core/PinPad.jsx; #599). The colours are
// asserted against the palette roles the design tokens name (tokens/colors.css: `--correct-bg` is
// `--mint`, `--wrong-bg` is `--blush`, `--border-control` is `--hairline-strong`), in every look.

import { describe, expect, it } from 'vitest';

import { BOARD, TILE_STATES, tileBadge, tileSkin } from '../board.js';
import { PALETTES, type ThemeName } from '../palettes.js';
import { PIN, PIN_PAD_WIDTH, pinDigit } from '../pin.js';
import { optionLook } from '../practice.js';
import { RADIUS } from '../radius.js';
import { TOUCH } from '../space.js';

const LOOKS = Object.keys(PALETTES) as ThemeName[];

describe('the board states (Tasks.jsx `T`)', () => {
  it('is the design’s six, in its order', () => {
    expect(TILE_STATES).toEqual(['tile', 'picked', 'placed', 'slot', 'correct', 'wrong']);
  });

  it.each(LOOKS)('skins every state as the design draws it: %s', (look) => {
    const p = PALETTES[look];
    expect(tileSkin(p, 'tile')).toEqual({
      bg: p.paper,
      color: p.ink,
      borderColor: p.hairlineStrong,
      borderWidth: 1,
      borderStyle: 'solid',
    });
    expect(tileSkin(p, 'picked')).toEqual({
      bg: p.primaryLt,
      color: p.ink,
      borderColor: p.primary,
      borderWidth: 2,
      borderStyle: 'solid',
    });
    expect(tileSkin(p, 'placed')).toEqual({
      bg: p.primaryLt,
      color: p.ink,
      borderColor: p.primaryLt,
      borderWidth: 1,
      borderStyle: 'solid',
    });
    expect(tileSkin(p, 'slot')).toMatchObject({
      bg: p.canvas,
      borderColor: p.hairlineStrong,
      borderWidth: 1.5,
      borderStyle: 'dashed',
    });
    expect(tileSkin(p, 'correct')).toEqual({
      bg: p.mint,
      color: p.successText,
      borderColor: p.success,
      borderWidth: 2,
      borderStyle: 'solid',
    });
    expect(tileSkin(p, 'wrong')).toEqual({
      bg: p.blush,
      color: p.danger,
      borderColor: p.danger,
      borderWidth: 2,
      borderStyle: 'solid',
    });
  });

  it.each(LOOKS)('is the same as an Option where Option has the state: %s', (look) => {
    const p = PALETTES[look];
    for (const [state, option] of [
      ['tile', 'idle'],
      ['picked', 'selected'],
      ['correct', 'correct'],
      ['wrong', 'wrong'],
    ] as const) {
      const skin = tileSkin(p, state);
      const o = optionLook(p, option);
      expect([skin.bg, skin.borderColor, skin.borderWidth], state).toEqual([
        o.backgroundColor,
        o.borderColor,
        o.borderWidth,
      ]);
    }
  });

  it('colours the badge by state: canvas while free, the state’s colour once it counts', () => {
    const p = PALETTES.pastell;
    expect(tileBadge(p, 'tile')).toEqual({ bg: p.canvas, color: p.primaryDk });
    expect(tileBadge(p, 'picked')).toEqual({ bg: p.primary, color: p.onPrimary });
    expect(tileBadge(p, 'placed')).toEqual({ bg: p.primary, color: p.onPrimary });
    expect(tileBadge(p, 'correct')).toEqual({ bg: p.success, color: p.paper });
    expect(tileBadge(p, 'wrong')).toEqual({ bg: p.danger, color: p.paper });
  });
});

describe('the board’s measures', () => {
  it('gives a step Option’s height, padding and badge (Tasks.jsx `Tile`)', () => {
    expect(BOARD.step).toMatchObject({
      minHeight: 56,
      padStart: 10,
      padEnd: 14,
      padY: 8,
      gap: 12,
      badge: 32,
      mark: 16,
    });
    // A side of a pair is at least 64 (Tasks.jsx `Pairs`).
    expect(BOARD.step.tall).toBe(64);
    expect(RADIUS.md).toBe(16);
  });

  it('gives a word a 40 pt pill with 14 at its sides and keeps the target at 44', () => {
    expect(BOARD.word).toMatchObject({ height: 40, pad: 14 });
    expect(BOARD.word.height + 2 * BOARD.word.reach).toBe(TOUCH);
  });

  it('spaces pieces by 8 and blocks by 12', () => {
    expect([BOARD.gap, BOARD.blockGap]).toEqual([8, 12]);
  });

  it('draws a gap 36 high and at least 72 wide, a table row 52 with 6 around a cell', () => {
    expect(BOARD.slot).toEqual({ height: 36, minWidth: 72, pad: 10 });
    expect(BOARD.table).toEqual({ headPadY: 10, headPadX: 8, row: 52, cellPad: 6 });
  });

  it('marks a word with a 6 pt corner and a 2 pt line (Answers.jsx MarkText)', () => {
    expect(BOARD.mark).toEqual({ radius: 6, underline: 2 });
  });
});

describe('the PIN pad’s measures (components/core/PinPad.jsx)', () => {
  it('has dots of 14, 16 apart, with 1.5 of edge', () => {
    expect([PIN.dot, PIN.dotGap, PIN.dotEdge]).toEqual([14, 16, 1.5]);
  });

  it('has keys of 76 × 56, three to a row, 20 and 10 apart', () => {
    expect(PIN.key).toEqual({ width: 76, height: 56 });
    expect([PIN.columns, PIN.columnGap, PIN.rowGap]).toEqual([3, 20, 10]);
    expect(PIN_PAD_WIDTH).toBe(3 * 76 + 2 * 20);
    expect(PIN.key.height).toBeGreaterThanOrEqual(TOUCH);
  });

  it('sets a digit 600 24 in the app’s face and the delete sign at 24', () => {
    expect(pinDigit()).toMatchObject({ fontSize: 24, fontWeight: '600' });
    expect(String(pinDigit().fontFamily)).toMatch(/Figtree/);
    expect(PIN.deleteIcon).toBe(24);
  });

  it('puts the keys a full step under the dots', () => {
    expect(PIN.gap).toBe(24);
  });
});
