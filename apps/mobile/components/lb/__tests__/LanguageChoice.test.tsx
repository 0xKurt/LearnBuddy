import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FAMILIES, paletteOf, themeNameOf, type Family } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { LanguageChoice } from '../LanguageChoice.js';

// Keep the sheet portal seam; exercise the actual shared button face and radio semantics.
vi.mock('../Sheet.js', () => ({
  Sheet: ({
    visible,
    children,
    onClose,
    closeLabel,
  }: {
    visible: boolean;
    children: ReactNode;
    onClose: () => void;
    closeLabel: string;
  }) =>
    visible ? (
      <div role="dialog">
        {children}
        <button onClick={onClose}>{closeLabel}</button>
      </div>
    ) : null,
}));

const options = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

describe('current-language pill', () => {
  it('shows the selected language and delegates selection before closing its sheet', () => {
    const onChange = vi.fn();
    renderInApp(
      <LanguageChoice
        value="de"
        options={options}
        onChange={onChange}
        label="Sprache"
        closeLabel="Schließen"
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sprache: Deutsch' }));
    expect(screen.getByRole('radio', { name: 'Deutsch' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    const selected = screen.getByRole('radio', { name: 'Deutsch' });
    const palette = paletteOf('pastell');
    const swatch = document.createElement('span');
    swatch.style.color = palette.primaryLt;
    document.body.append(swatch);
    const selectedFill = styleOf(swatch).color;
    swatch.remove();
    expect(
      [selected, ...Array.from(selected.querySelectorAll('*'))].some(
        (element) => styleOf(element).backgroundColor === selectedFill,
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('en');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has a visible dismissal action that does not change the locale', () => {
    const onChange = vi.fn();
    renderInApp(
      <LanguageChoice
        value="de"
        options={options}
        onChange={onChange}
        label="Sprache"
        closeLabel="Schließen"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sprache: Deutsch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

function ChooseLook({ family, dark }: { family: Family; dark: boolean }) {
  const { choose } = useTheme();
  return <button onClick={() => choose({ family, mode: dark ? 'dark' : 'light' })}>Look</button>;
}

for (const family of FAMILIES) {
  for (const dark of [false, true]) {
    it(`paints the selected language with live selection colors in ${family} ${dark ? 'dark' : 'light'}`, () => {
      renderInApp(
        <>
          <ChooseLook family={family} dark={dark} />
          <LanguageChoice
            value="de"
            options={options}
            onChange={() => undefined}
            label="Sprache"
            closeLabel="Schließen"
          />
        </>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Look' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sprache: Deutsch' }));
      const selected = screen.getByRole('radio', { name: 'Deutsch' });
      const palette = paletteOf(themeNameOf(family, dark));
      const swatch = document.createElement('span');
      swatch.style.color = palette.primaryLt;
      document.body.append(swatch);
      const expected = styleOf(swatch).color;
      swatch.remove();
      expect(
        [selected, ...Array.from(selected.querySelectorAll('*'))].some(
          (element) => styleOf(element).backgroundColor === expected,
        ),
      ).toBe(true);
      expect(selected.getAttribute('aria-checked')).toBe('true');
    });
  }
}
