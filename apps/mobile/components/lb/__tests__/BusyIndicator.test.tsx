import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as ReactNative from 'react-native';
import { renderInApp } from '../../../testing/render.js';
import { watchReducedMotion } from '../../../lib/theme/motion.js';
import { BusyIndicator } from '../BusyIndicator.js';
import { Btn } from '../Btn.js';
import { IconBtn } from '../IconBtn.js';
const preference = vi.hoisted(() => ({
  listeners: new Set<(value: boolean) => void>(),
  change(value: boolean) {
    for (const listener of this.listeners) listener(value);
  },
}));
vi.mock('react-native', async (original) => ({
  ...(await original<typeof ReactNative>()),
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
    />
  ),
}));
describe('live busy reduction', () => {
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
