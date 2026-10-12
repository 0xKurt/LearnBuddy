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
  DURATION: { recordingPulse: 700, voicePulse: 1200 },
}));
vi.mock('../../../lib/theme/composer.js', () => ({ COMPOSER: { slot: 40 } }));

afterEach(() => {
  preference.reduced = false;
  vi.restoreAllMocks();
});

it('stops an already mounted recording pulse when reduced motion changes and resumes when allowed', () => {
  const start = vi.fn();
  const stop = vi.fn();
  vi.spyOn(Animated, 'loop').mockReturnValue({ start, stop, reset: vi.fn() } as never);
  const view = renderInApp(<RecordingStatus elapsedMs={1000} maxMs={30000} />);
  expect(start).toHaveBeenCalledTimes(1);
  preference.reduced = true;
  view.rerender(<RecordingStatus elapsedMs={2000} maxMs={30000} />);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
  preference.reduced = false;
  view.rerender(<RecordingStatus elapsedMs={3000} maxMs={30000} />);
  expect(start).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});

it('never starts a recording pulse when reduced motion is enabled on mount', () => {
  preference.reduced = true;
  const loop = vi.spyOn(Animated, 'loop');
  renderInApp(<RecordingStatus elapsedMs={1000} maxMs={30000} />);
  expect(loop).not.toHaveBeenCalled();
});

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
