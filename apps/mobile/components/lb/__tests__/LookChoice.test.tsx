import type * as ReactNative from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { applyBoldText, TYPE } from '../../../lib/theme/type.js';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { readItem, writeItem } from '../../../lib/api/outboxStorage.js';
import { FamilyChoice, ModeChoice } from '../LookChoice.js';

// Device storage is the boundary; real ThemeProvider and controls retain their lifecycle.
const kept = vi.hoisted(() => new Map<string, string>());
vi.mock('../../../lib/api/outboxStorage.js', () => ({
  readItem: async (key: string) => kept.get(key) ?? null,
  writeItem: async (key: string, value: string | null) =>
    value === null ? kept.delete(key) : kept.set(key, value),
}));

const os = vi.hoisted(() => ({
  scheme: 'light' as 'light' | 'dark',
  listeners: new Set<() => void>(),
}));
vi.mock('react-native', async (original) => {
  const actual = await original<typeof ReactNative>();
  const { useSyncExternalStore } = await import('react');
  return {
    ...actual,
    useColorScheme: () =>
      useSyncExternalStore(
        (listener) => {
          os.listeners.add(listener);
          return () => os.listeners.delete(listener);
        },
        () => os.scheme,
      ),
  };
});
function AppliedTheme() {
  return <output data-testid="applied-theme">{useTheme().name}</output>;
}
function changeSystem(scheme: 'light' | 'dark') {
  act(() => {
    os.scheme = scheme;
    os.listeners.forEach((listener) => listener());
  });
}

function State() {
  const { family, mode } = useTheme();
  return (
    <output data-testid="look-state">
      {family}:{mode}
    </output>
  );
}

beforeEach(async () => {
  kept.clear();
  os.scheme = 'light';
  await writeItem('lb.theme', 'pastell');
  await writeItem('lb.themeMode', 'system');
});

afterEach(() => applyBoldText(false, paletteOf('pastell')));

it('pins either mode explicitly and can return to system without a hidden gesture', async () => {
  renderInApp(
    <>
      <ModeChoice />
      <State />
    </>,
  );
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true'),
  );
  for (const [label, value] of [
    ['Dunkel', 'dark'],
    ['Hell', 'light'],
    ['System', 'system'],
  ] as const) {
    fireEvent.click(screen.getByRole('radio', { name: label }));
    await waitFor(() =>
      expect(screen.getByTestId('look-state').textContent).toContain(`:${value}`),
    );
    expect(screen.getByRole('radio', { name: label }).getAttribute('aria-checked')).toBe('true');
    expect(styleOf(screen.getByRole('radio', { name: label })).minHeight).toBe('44px');
  }
});

it('selects the actual family with the onboarding tile and retains it through a mode change', async () => {
  renderInApp(
    <>
      <FamilyChoice variant="onboarding" />
      <ModeChoice />
      <State />
    </>,
  );
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true'),
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Meer' }));
  await waitFor(() => expect(screen.getByTestId('look-state').textContent).toContain('ocean:'));
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'Meer' }).getAttribute('aria-checked')).toBe('true'),
  );
  expect(styleOf(screen.getByRole('radio', { name: 'Meer' })).minHeight).toBe('84px');
  fireEvent.click(screen.getByRole('radio', { name: 'Dunkel' }));
  await waitFor(() => expect(screen.getByTestId('look-state').textContent).toBe('ocean:dark'));
  const swatch = document.createElement('span');
  swatch.style.backgroundColor = paletteOf('oceanDark').primaryLt;
  document.body.append(swatch);
  expect(
    styleOf(screen.getByRole('radio', { name: 'Meer' }).firstElementChild!).backgroundColor,
  ).toBe(styleOf(swatch).backgroundColor);
  swatch.remove();
});

it('restores the picked family and pinned mode after remount and persists system again', async () => {
  const view = renderInApp(
    <>
      <FamilyChoice />
      <ModeChoice />
      <State />
    </>,
  );
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true'),
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Wald' }));
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'Wald' }).getAttribute('aria-checked')).toBe('true'),
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Dunkel' }));
  await waitFor(async () => expect(await readItem('lb.themeMode')).toBe('dark'));
  expect(await readItem('lb.theme')).toBe('forest');
  view.unmount();
  renderInApp(
    <>
      <FamilyChoice />
      <ModeChoice />
      <State />
    </>,
  );
  await waitFor(() => expect(screen.getByTestId('look-state').textContent).toBe('forest:dark'));
  fireEvent.click(screen.getByRole('radio', { name: 'System' }));
  await waitFor(async () => expect(await readItem('lb.themeMode')).toBe('system'));
  expect(screen.getByRole('radio', { name: 'Wald' }).getAttribute('aria-checked')).toBe('true');
});

it('follows live OS changes only in System and keeps pinned light while the OS changes', async () => {
  renderInApp(
    <>
      <ModeChoice />
      <AppliedTheme />
    </>,
  );
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true'),
  );
  changeSystem('dark');
  await waitFor(() => expect(screen.getByTestId('applied-theme').textContent).toBe('pastellDark'));
  fireEvent.click(screen.getByRole('radio', { name: 'Hell' }));
  await waitFor(() => expect(screen.getByTestId('applied-theme').textContent).toBe('pastell'));
  changeSystem('light');
  changeSystem('dark');
  expect(screen.getByTestId('applied-theme').textContent).toBe('pastell');
  fireEvent.click(screen.getByRole('radio', { name: 'System' }));
  await waitFor(() => expect(screen.getByTestId('applied-theme').textContent).toBe('pastellDark'));
});

it('keeps the look-label face aligned with live Bold Text and palette changes', () => {
  act(() => applyBoldText(false, paletteOf('pastell')));
  expect(TYPE.headerMeta.fontWeight).toBe('600');
  act(() => applyBoldText(true, paletteOf('oceanDark')));
  expect(TYPE.headerMeta.fontWeight).toBe('800');
  expect(TYPE.headerMeta.fontFamily).toBe('Figtree_800ExtraBold');
  expect(TYPE.headerMeta.color).toBe(paletteOf('oceanDark').ink2);
});
