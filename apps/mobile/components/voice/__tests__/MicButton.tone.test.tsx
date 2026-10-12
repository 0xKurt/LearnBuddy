import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { watchReducedMotion } from '../../../lib/theme/motion.js';
import { InputBar } from '../../lb/InputBar.js';
import { IconBtn } from '../../lb/IconBtn.js';
import { MicButton } from '../MicButton.js';
import type { VoiceInput } from '../useVoiceInput.js';

const preference = vi.hoisted(() => ({ changed: (_value: boolean) => {} }));
vi.mock('react-native', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    isBoldTextEnabled: () => Promise.resolve(false),
    addEventListener: (event: string, changed: (value: boolean) => void) => {
      if (event === 'reduceMotionChanged') preference.changed = changed;
      return { remove: vi.fn() };
    },
  },
  ActivityIndicator: ({ animating, color }: { animating: boolean; color: string }) => (
    <div data-testid="busy-mark" data-animating={String(animating)} data-color={color} />
  ),
}));
beforeEach(() => localStorage.clear());
const voice = (state: VoiceInput['state']): VoiceInput => ({
  state,
  onDevice: false,
  endsByItself: false,
  elapsedMs: 1000,
  maxMs: null,
  level: 0,
  live: '',
  hint: null,
  denied: null,
  toggle: vi.fn(),
  cancel: vi.fn(),
});
function cssColor(color: string) {
  const element = document.createElement('div');
  element.style.backgroundColor = color;
  return element.style.backgroundColor;
}
function face(control: HTMLElement) {
  const inner = control.firstElementChild;
  if (!(inner instanceof HTMLElement)) throw new Error('Expected painted control face');
  return inner;
}
function ThemeControl() {
  const { name, choose } = useTheme();
  return (
    <button
      data-testid="theme-control"
      data-theme={name}
      onClick={() => choose({ family: 'ocean', mode: 'dark' })}
    >
      Change theme
    </button>
  );
}

it.each(['idle', 'recording', 'starting', 'transcribing'] as const)(
  'keeps Composer dictation quiet alongside its one primary while %s',
  async (state) => {
    const input = voice(state);
    renderInApp(
      <>
        <InputBar
          maxLength={100}
          value=""
          accessibilityLabel="Nachricht"
          voice={input}
          micLabel="Diktieren"
          disabled={state === 'recording'}
          after={<IconBtn icon="voice" filled accessibilityLabel="Gespräch" onPress={vi.fn()} />}
        />
        <ThemeControl />
      </>,
    );
    await act(async () => {});
    const label = state === 'recording' ? 'Aufnahme stoppen' : 'Diktieren';
    const secondary = screen.getByRole('button', { name: label });
    const paint = face(secondary);
    expect(styleOf(secondary).width).toBe('44px');
    expect(styleOf(paint).width).toBe('40px');
    expect(styleOf(paint).backgroundColor).toBe(cssColor(paletteOf('pastell').canvas));
    expect(styleOf(paint).borderWidth).toBe('0px');
    const primary = screen.getByRole('button', { name: 'Gespräch' });
    expect(screen.getByTestId('composer-primary').contains(primary)).toBe(true);
    expect(styleOf(face(primary)).backgroundColor).toBe(cssColor(paletteOf('pastell').primary));
    fireEvent.click(screen.getByRole('button', { name: 'Change theme' }));
    await act(async () => {});
    const dark = face(screen.getByRole('button', { name: label }));
    expect(styleOf(dark).backgroundColor).toBe(cssColor(paletteOf('oceanDark').canvas));
    if (state === 'starting' || state === 'transcribing') {
      expect(screen.getByTestId('busy-mark').getAttribute('data-color')).toBe(
        paletteOf('oceanDark').ink,
      );
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(input.toggle).not.toHaveBeenCalled();
    } else {
      expect(dark.querySelector('[stroke]')?.getAttribute('stroke')).toBe(
        paletteOf('oceanDark').ink,
      );
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(input.toggle).toHaveBeenCalledTimes(1);
    }
  },
);
it('keeps quiet transcribing busy/disabled while the live preference stops and resumes its mark', async () => {
  const stop = watchReducedMotion();
  const input = voice('transcribing');
  try {
    await act(async () => {});
    renderInApp(
      <InputBar
        maxLength={100}
        value=""
        accessibilityLabel="Nachricht"
        voice={input}
        micLabel="Diktieren"
      />,
    );
    expect(screen.getByTestId('busy-mark').getAttribute('data-animating')).toBe('true');
    act(() => preference.changed(true));
    expect(screen.getByTestId('busy-mark').getAttribute('data-animating')).toBe('false');
    const control = screen.getByRole('button', { name: 'Diktieren' });
    expect(control.getAttribute('aria-busy')).toBe('true');
    expect(control.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(control);
    expect(input.toggle).not.toHaveBeenCalled();
    act(() => preference.changed(false));
    expect(screen.getByTestId('busy-mark').getAttribute('data-animating')).toBe('true');
  } finally {
    stop();
  }
});

it('preserves omitted/default skin and explicit primary ownership', async () => {
  renderInApp(
    <>
      <MicButton voice={voice('idle')} label="Default microphone" />
      <MicButton voice={voice('idle')} size="sm" tone="primary" label="Primary microphone" />
    </>,
  );
  await act(async () => {});
  const normal = face(screen.getByRole('button', { name: 'Default microphone' }));
  expect(styleOf(normal).backgroundColor).toBe(cssColor(paletteOf('pastell').paper));
  expect(styleOf(normal).borderTopWidth).toBe('1px');
  const primary = face(screen.getByRole('button', { name: 'Primary microphone' }));
  expect(styleOf(primary).backgroundColor).toBe(cssColor(paletteOf('pastell').primary));
  expect(primary.querySelector('[stroke]')?.getAttribute('stroke')).toBe(
    paletteOf('pastell').onPrimary,
  );
});

it.each([undefined, 'quiet'] as const)(
  'keeps disabled, enabled, working and stoppable recording semantics for tone=%s',
  async (tone) => {
    const input = voice('idle');
    const view = renderInApp(<MicButton voice={input} tone={tone} label="Mikrofon" disabled />);
    await act(async () => {});
    const control = screen.getByRole('button', { name: 'Mikrofon' });
    expect(styleOf(control).opacity).toBe('0.45');
    expect(control.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(control);
    expect(input.toggle).not.toHaveBeenCalled();
    view.rerender(<MicButton voice={input} tone={tone} label="Mikrofon" />);
    await act(async () => {});
    expect(styleOf(control).opacity).toBe('1');
    fireEvent.click(control);
    expect(input.toggle).toHaveBeenCalledTimes(1);
    view.rerender(
      <MicButton voice={{ ...input, state: 'transcribing' }} tone={tone} label="Mikrofon" />,
    );
    await act(async () => {});
    expect(styleOf(control).opacity).toBe('1');
    expect(control.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(control);
    expect(input.toggle).toHaveBeenCalledTimes(1);
    view.rerender(
      <MicButton voice={{ ...input, state: 'recording' }} tone={tone} label="Mikrofon" disabled />,
    );
    await act(async () => {});
    const stop = screen.getByRole('button', { name: 'Aufnahme stoppen' });
    expect(styleOf(stop).opacity).toBe('1');
    expect(stop.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(stop);
    expect(input.toggle).toHaveBeenCalledTimes(2);
  },
);
