// "Tipp" after two misses (issue #388, report „Hilfe und Fragen beim Üben" §5.5): one quiet offer on
// the chip she already has — the soft skin instead of the ghost one. Nothing else appears, and the
// chip keeps its name, so a screen reader hears the same button.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { HelpChips } from '../HelpChips.js';

/** Find the painted face inside the press target; wrappers remain transparent. */
const fillOf = (): string => {
  const button = screen.getByRole('button', { name: 'Einen Tipp bekommen' });
  const transparent = ['', 'transparent', 'rgba(0, 0, 0, 0)'];
  return (
    Array.from(button.querySelectorAll('*'))
      .map((element) => styleOf(element).backgroundColor)
      .find((color) => !transparent.includes(color)) ?? 'transparent'
  );
};

const asRgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('HelpChips', () => {
  it('keeps offered help disabled while an answer is in flight', () => {
    const hint = vi.fn();
    renderInApp(<HelpChips onHint={hint} hintOffered disabled />);
    const button = screen.getByRole('button', { name: 'Einen Tipp bekommen' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(hint).not.toHaveBeenCalled();
  });

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
