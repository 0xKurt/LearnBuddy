// "Tipp" after two misses (issue #388, report „Hilfe und Fragen beim Üben" §5.5): one quiet offer on
// the chip she already has — the soft skin instead of the ghost one. Nothing else appears, and the
// chip keeps its name, so a screen reader hears the same button.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { HelpChips } from '../HelpChips.js';

/** The fill sits on the Btn's inner View, never on the Pressable (CLAUDE.md rule 13). */
const fillOf = (): string => {
  const inner = screen.getByRole('button', { name: 'Einen Tipp bekommen' }).firstElementChild;
  expect(inner).not.toBeNull();
  return styleOf(inner as Element).backgroundColor;
};

const asRgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('HelpChips', () => {
  it('keeps "Tipp" quiet until it is offered', () => {
    renderInApp(<HelpChips onHint={() => undefined} onReveal={() => undefined} />);
    expect(['', 'transparent', 'rgba(0, 0, 0, 0)']).toContain(fillOf());
  });

  it('lets "Tipp" stand out once offered — the same chip, nothing added', () => {
    renderInApp(<HelpChips onHint={() => undefined} hintOffered onReveal={() => undefined} />);
    expect(fillOf()).toBe(asRgb(paletteOf('pastell').primaryLt));
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
