// A choice of one in a sheet (the language, a time, the Bundesland). Its chosen row is the board's
// picked piece (`Tile`, #599: a board state is no variant of `<Btn>`), and it kept what it had as a
// button: the same measures, the same sign, the same words for a screen reader.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { RADIUS } from '../../../lib/theme/radius.js';
import { CONTROL, TOUCH } from '../../../lib/theme/space.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { ChoiceOptions } from '../ChoiceOptions.js';

const p = paletteOf('pastell');
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const face = (el: Element) => styleOf(el.firstElementChild!);
const options = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

describe('the chosen row of a choice in a sheet', () => {
  it('is the picked piece: light primary, two points of primary, the list’s corners, a tick', () => {
    renderInApp(
      <ChoiceOptions options={options} value="de" label="Sprache" onChange={() => undefined} />,
    );
    const chosen = screen.getByRole('radio', { name: 'Deutsch' });
    expect(chosen.getAttribute('aria-checked')).toBe('true');
    expect(face(chosen).backgroundColor).toBe(rgb(p.primaryLt));
    expect(face(chosen).borderTopColor).toBe(rgb(p.primary));
    expect(face(chosen).borderTopWidth).toBe('2px');
    expect(face(chosen).borderTopLeftRadius).toBe(`${RADIUS.md}px`);
    // As tall as the buttons it stands among, and as wide as the list.
    expect(face(chosen).minHeight).toBe(`${CONTROL.md}px`);
    expect(styleOf(chosen).alignSelf).toBe('stretch');
    // Chosen is never colour alone: the tick stands before the word.
    expect(chosen.querySelectorAll('svg')).toHaveLength(1);
    // The others stay the quiet buttons they were, and say that they are not chosen.
    const other = screen.getByRole('radio', { name: 'English' });
    expect(other.getAttribute('aria-checked')).toBe('false');
    expect(face(other).backgroundColor).toBe(rgb(p.canvas));
    expect(other.querySelectorAll('svg')).toHaveLength(0);
  });

  it('is one touch target tall in the small list, and picks on a tap like every row', () => {
    const onChange = vi.fn();
    renderInApp(
      <ChoiceOptions size="sm" options={options} value="de" label="Sprache" onChange={onChange} />,
    );
    const chosen = screen.getByRole('radio', { name: 'Deutsch' });
    expect(face(chosen).minHeight).toBe(`${TOUCH}px`);
    fireEvent.click(chosen);
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(onChange.mock.calls).toEqual([['de'], ['en']]);
  });

  it('is disabled with its list', () => {
    renderInApp(
      <ChoiceOptions
        options={options}
        value="de"
        label="Sprache"
        disabled
        onChange={() => undefined}
      />,
    );
    for (const name of ['Deutsch', 'English'])
      expect(screen.getByRole('radio', { name }).getAttribute('aria-disabled')).toBe('true');
  });

  it('is the primary button where the list stands for a form’s field, without a tick', () => {
    renderInApp(
      <ChoiceOptions
        chosenAs="primary"
        unselectedVariant="secondary"
        showCheck={false}
        options={options}
        value="de"
        label="Sprache"
        onChange={() => undefined}
      />,
    );
    const chosen = screen.getByRole('radio', { name: 'Deutsch' });
    expect(chosen.getAttribute('aria-checked')).toBe('true');
    expect(face(chosen).backgroundColor).toBe(rgb(p.primary));
    expect(chosen.querySelectorAll('svg')).toHaveLength(0);
    const other = screen.getByRole('radio', { name: 'English' });
    expect(face(other).backgroundColor).toBe(rgb(p.paper));
    expect(face(other).borderTopWidth).toBe('1px');
  });
});
