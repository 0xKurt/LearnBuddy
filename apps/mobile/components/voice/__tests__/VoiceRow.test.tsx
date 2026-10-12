import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp, styleOf } from '../../../testing/render.js';
import type { VoiceInput } from '../useVoiceInput.js';
import { Btn } from '../../lb/Btn.js';
import { VoiceRow } from '../VoiceRow.js';
import { Animated } from 'react-native';
import { watchReducedMotion } from '../../../lib/theme/motion.js';

vi.mock('react-native', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: vi.fn() }),
  },
}));

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
const left = { icon: 'keyboard' as const, label: 'Tastatur', onPress: vi.fn() };
const right = { icon: 'camera' as const, label: 'Foto', onPress: vi.fn() };

describe('Talk voice controls presentation', () => {
  it('keeps default practice geometry and controls available', () => {
    renderInApp(
      <VoiceRow
        left={left}
        right={right}
        size="md"
        mic={{ voice: voice('idle'), label: 'Antwort sagen', disabled: false }}
      />,
    );
    expect(styleOf(screen.getByRole('button', { name: 'Antwort sagen' })).width).toBe('56px');
    expect(screen.getByText('Tastatur')).toBeTruthy();
  });
  it('uses the existing handlers on the Talk pill and quiet side targets', () => {
    const press = vi.fn();
    renderInApp(
      <VoiceRow
        presentation="talk"
        left={left}
        right={right}
        size="lg"
        mic={{ voice: voice('idle'), label: 'Sprechen', disabled: false, onPress: press }}
      />,
    );
    const mic = screen.getByRole('button', { name: 'Sprechen' });
    expect(styleOf(mic).height).toBe('64px');
    expect(styleOf(screen.getByRole('button', { name: 'Foto' })).minWidth).toBe('52px');
    fireEvent.click(mic);
    expect(press).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Tastatur')).toBeNull();
  });
  it('keeps the full interrupt action accessible while displaying its short label', () => {
    const interrupt = vi.fn();
    renderInApp(
      <VoiceRow
        presentation="talk"
        left={left}
        right={right}
        size="lg"
        mic={{
          voice: voice('idle'),
          label: 'Unterbrechen und sprechen',
          visibleLabel: 'Unterbrechen',
          disabled: false,
          onPress: interrupt,
        }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Unterbrechen und sprechen' });
    expect(screen.getByText('Unterbrechen')).toBeTruthy();
    expect(screen.queryByText('Unterbrechen und sprechen')).toBeNull();
    fireEvent.click(button);
    expect(interrupt).toHaveBeenCalledTimes(1);
  });
  it('keeps recording stoppable even when the ordinary action is disabled', () => {
    const press = vi.fn();
    renderInApp(
      <VoiceRow
        presentation="talk"
        left={left}
        right={right}
        size="lg"
        mic={{ voice: voice('recording'), label: 'Fertig', disabled: true, onPress: press }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aufnahme stoppen' }));
    expect(press).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Fertig')).toBeTruthy();
  });
  it('keeps circle recording static while preserving its stop action', async () => {
    const stop = watchReducedMotion();
    const loop = vi.spyOn(Animated, 'loop');
    const recording = voice('recording');
    try {
      await act(async () => {});
      renderInApp(
        <VoiceRow
          left={left}
          right={right}
          size="md"
          mic={{ voice: recording, label: 'Antwort sagen', disabled: true }}
        />,
      );
      const control = screen.getByRole('button', { name: 'Aufnahme stoppen' });
      expect(control.getAttribute('aria-disabled')).not.toBe('true');
      fireEvent.click(control);
      expect(recording.toggle).toHaveBeenCalledTimes(1);
      expect(loop).not.toHaveBeenCalled();
    } finally {
      loop.mockRestore();
      stop();
    }
  });
  it('preserves the practice Check slot and independent quiet microphone', () => {
    const input = voice('idle');
    const check = vi.fn();
    renderInApp(
      <VoiceRow
        left={left}
        right={right}
        size="md"
        mic={{ voice: input, label: 'Antwort sagen', disabled: false }}
        centerAction={<Btn onPress={check}>Prüfen</Btn>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(check).toHaveBeenCalledTimes(1);
    expect(input.toggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Antwort sagen' }));
    expect(input.toggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Tastatur' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Foto' })).toBeDefined();
  });
  it('keeps a working recording action unavailable', () => {
    const press = vi.fn();
    renderInApp(
      <VoiceRow
        presentation="talk"
        left={left}
        right={right}
        size="lg"
        mic={{ voice: voice('transcribing'), label: 'Sprechen', disabled: false, onPress: press }}
      />,
    );
    const mic = screen.getByRole('button', { name: 'Sprechen' });
    expect(mic.getAttribute('aria-disabled')).toBe('true');
    expect(mic.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(mic);
    expect(press).not.toHaveBeenCalled();
  });
});
