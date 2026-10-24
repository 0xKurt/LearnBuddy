import { fireEvent } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import type { VoiceInput } from '../useVoiceInput.js';
import { MicButton } from '../MicButton.js';
import { RecordingStatus } from '../RecordingStatus.js';

const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../lib/theme/motion.js', () => ({
  useMotionReduced: () => preference.reduced,
  DURATION: { voicePulse: 1200 },
}));
vi.mock('../../../lib/theme/composer.js', () => ({ COMPOSER: { slot: 40 } }));

afterEach(() => {
  preference.reduced = false;
  vi.restoreAllMocks();
});

it.each([false, true])(
  'shows a running recording with a dot that stands still (reduced motion: %s)',
  (reduced) => {
    // Only the orb moves by itself (HANDOFF §4, #599): no loop of the dot's own, with or
    // without reduced motion, on mount or when the preference changes.
    preference.reduced = reduced;
    const loop = vi.spyOn(Animated, 'loop');
    const timing = vi.spyOn(Animated, 'timing');
    const view = renderInApp(<RecordingStatus elapsedMs={1000} maxMs={30000} />);
    preference.reduced = !reduced;
    view.rerender(<RecordingStatus elapsedMs={2000} maxMs={30000} />);
    expect(loop).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
    expect(view.getByTestId('recording-dot').style.opacity).toBe('');
    // The time is what shows that it runs.
    expect(view.getByText('Ich höre zu … 0:02 / 0:30')).toBeTruthy();
  },
);

it('keeps recording microphone static and stoppable across preference changes', () => {
  const loop = vi.spyOn(Animated, 'loop');
  const voice = {
    state: 'recording',
    elapsedMs: 1000,
    maxMs: null,
    toggle: vi.fn(),
  } as unknown as VoiceInput;
  const view = renderInApp(<MicButton voice={voice} label="Nachricht" disabled />);
  preference.reduced = true;
  view.rerender(<MicButton voice={voice} label="Nachricht" disabled />);
  const control = view.getByRole('button', { name: 'Aufnahme stoppen' });
  expect(control.getAttribute('aria-disabled')).not.toBe('true');
  fireEvent.click(control);
  expect(voice.toggle).toHaveBeenCalledTimes(1);
  expect(loop).not.toHaveBeenCalled();
});
