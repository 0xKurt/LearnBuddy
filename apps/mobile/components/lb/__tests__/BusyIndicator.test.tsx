import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as ReactNative from 'react-native';
import { renderInApp } from '../../../testing/render.js';
import { watchReducedMotion } from '../../../lib/theme/motion.js';
import { BusyIndicator } from '../BusyIndicator.js';
import { Btn } from '../Btn.js';
import { IconBtn } from '../IconBtn.js';
const preference = vi.hoisted(() => ({
  platform: 'web',
  listeners: new Set<(value: boolean) => void>(),
  change(value: boolean) {
    for (const listener of this.listeners) listener(value);
  },
}));
vi.mock('react-native', async (original) => ({
  ...(await original<typeof ReactNative>()),
  Platform: {
    ...(await original<typeof ReactNative>()).Platform,
    get OS() {
      return preference.platform;
    },
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: (_event: string, change: (value: boolean) => void) => {
      preference.listeners.add(change);
      return {
        remove: () => {
          preference.listeners.delete(change);
        },
      };
    },
  },
  ActivityIndicator: ({
    animating = true,
    hidesWhenStopped = true,
    'aria-hidden': hidden,
  }: {
    animating?: boolean;
    hidesWhenStopped?: boolean;
    'aria-hidden'?: boolean;
  }) => (
    <div
      role="progressbar"
      aria-hidden={hidden}
      data-testid="busy-mark"
      data-animating={String(animating)}
      data-hides={String(hidesWhenStopped)}
      style={{ visibility: preference.platform === 'android' && !animating ? 'hidden' : 'visible' }}
    />
  ),
}));
describe('live busy reduction', () => {
  it('keeps an Android busy mark visible through live reduction and resumes the native spinner', async () => {
    preference.platform = 'android';
    const stop = watchReducedMotion();
    try {
      await act(async () => {});
      renderInApp(
        <Btn busy onPress={vi.fn()}>
          Weiter
        </Btn>,
      );
      expect(screen.getByTestId('busy-mark').style.visibility).toBe('visible');
      act(() => preference.change(true));
      expect(screen.queryByTestId('busy-mark')).toBeNull();
      const control = screen.getByRole('button', { name: 'Weiter' });
      const mark = control.querySelector('svg');
      expect(mark).not.toBeNull();
      expect(mark?.closest('[aria-hidden]')?.getAttribute('aria-hidden')).toBe('true');
      expect(control.getAttribute('aria-busy')).toBe('true');
      expect(control.getAttribute('aria-disabled')).toBe('true');
      act(() => preference.change(false));
      expect(control.querySelector('svg')).toBeNull();
      expect(screen.getByTestId('busy-mark').style.visibility).toBe('visible');
    } finally {
      stop();
      preference.platform = 'web';
    }
  });
  it('settles an already mounted busy mark without hiding it and resumes on preference change', async () => {
    const stop = watchReducedMotion();
    try {
      await act(async () => {});
      renderInApp(<BusyIndicator />);
      expect(screen.getByTestId('busy-mark').dataset.animating).toBe('true');
      act(() => preference.change(true));
      expect(screen.getByTestId('busy-mark').dataset.animating).toBe('false');
      expect(screen.getByTestId('busy-mark').dataset.hides).toBe('false');
      expect(screen.queryByRole('progressbar')).toBeNull();
      act(() => preference.change(false));
      expect(screen.getByTestId('busy-mark').dataset.animating).toBe('true');
    } finally {
      stop();
    }
  });
  it.each([
    ['small', 20],
    ['large', 36],
    [28, 28],
  ] as const)(
    'preserves caller color, size %s, and layout on reduced Android',
    async (size, dimension) => {
      preference.platform = 'android';
      const stop = watchReducedMotion();
      try {
        await act(async () => {});
        act(() => preference.change(true));
        renderInApp(
          <BusyIndicator testID="caller-mark" size={size} color="#123456" style={{ margin: 7 }} />,
        );
        const mark = screen.getByTestId('caller-mark');
        expect(mark.style.margin).toBe('7px');
        const glyph = mark.querySelector('svg');
        expect(glyph?.getAttribute('width')).toBe(String(dimension));
        expect(glyph?.getAttribute('height')).toBe(String(dimension));
        expect(glyph?.querySelector('[stroke]')?.getAttribute('stroke')).toBe('#123456');
      } finally {
        stop();
        preference.platform = 'web';
      }
    },
  );
  it('keeps busy button semantics and prevents another submission during live reduction', async () => {
    const submit = vi.fn();
    const stop = watchReducedMotion();
    try {
      await act(async () => {});
      renderInApp(
        <>
          <Btn busy onPress={submit}>
            Weiter
          </Btn>
          <IconBtn busy icon="send" accessibilityLabel="Senden" onPress={submit} />
        </>,
      );
      act(() => preference.change(true));
      for (const mark of screen.getAllByTestId('busy-mark')) {
        expect(mark.dataset.animating).toBe('false');
        expect(mark.dataset.hides).toBe('false');
      }
      for (const name of ['Weiter', 'Senden']) {
        const control = screen.getByRole('button', { name });
        expect(control.getAttribute('aria-busy')).toBe('true');
        expect(control.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(control);
      }
      expect(submit).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
