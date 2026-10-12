import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { readItem } from '../../../lib/api/outboxStorage.js';
import { FAMILIES, themeNameOf, type ThemeName } from '../../../lib/theme/palettes.js';
import { PaletteScope, useTheme, useAppliedPalette } from '../../../lib/theme/ThemeProvider.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { Btn } from '../Btn.js';

it('paints a local dark control across all eight app looks without changing saved appearance', async () => {
  let choose: ReturnType<typeof useTheme>['choose'];
  let applied: ReturnType<typeof useAppliedPalette>;
  const onClose = vi.fn();
  let inside: ReturnType<typeof useTheme>;
  function ScopedControl() {
    inside = useTheme();
    return (
      <Btn variant="secondary" full onPress={onClose}>
        Schließen
      </Btn>
    );
  }
  function Sample({
    scoped,
    localName = 'pastellDark',
  }: {
    scoped: boolean;
    localName?: ThemeName;
  }) {
    const theme = useTheme();
    applied = useAppliedPalette();
    choose = theme.choose;
    const button = <ScopedControl />;
    return (
      <>
        <Text testID="parent-look">{theme.name}</Text>
        {scoped ? <PaletteScope name={localName}>{button}</PaletteScope> : button}
      </>
    );
  }
  const view = renderInApp(<Sample scoped={false} />);
  await act(async () => undefined);
  for (const family of FAMILIES) {
    for (const mode of ['light', 'dark'] as const) {
      const name = themeNameOf(family, mode === 'dark');
      await act(async () => choose({ family, mode }));
      await waitFor(() => expect(screen.getByTestId('parent-look').textContent).toBe(name));
      const stored = [await readItem('lb.theme'), await readItem('lb.themeMode')];
      const beforePalette = applied!;
      view.rerender(<Sample scoped />);
      const button = screen.getByRole('button', { name: 'Schließen' });
      // Actual shared Btn skin, rather than an independently recreated local button.
      expect(styleOf(button.firstElementChild!).backgroundColor).toBe('rgb(35, 32, 54)');
      expect(styleOf(screen.getByText('Schließen')).color).toBe('rgb(243, 240, 251)');
      fireEvent.click(button);
      expect(screen.getByTestId('parent-look').textContent).toBe(name);
      expect(applied!).toBe(beforePalette);
      expect([await readItem('lb.theme'), await readItem('lb.themeMode')]).toEqual(stored);
      view.rerender(<Sample scoped localName="forestDark" />);
      expect(inside!.name).toBe('forestDark');
      expect(inside!.choose).toBe(choose!);
      expect(screen.getByTestId('parent-look').textContent).toBe(name);
      expect(applied!).toBe(beforePalette);
      expect([await readItem('lb.theme'), await readItem('lb.themeMode')]).toEqual(stored);
      view.rerender(<Sample scoped={false} />);
      expect(applied!).toBe(beforePalette);
    }
  }
  expect(onClose).toHaveBeenCalledTimes(FAMILIES.length * 2);
});
