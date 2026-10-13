// The rehearsal card while it records (#599; design components/practice/Modes.jsx:40–50
// `RehearseLive`): the running time large, the length she was given beside "ich höre zu", and
// "Fertig" as the one button. Nothing on the card moves by itself.
//
// requires live verification in Claude Code session — the recorder (the outside world) is
// replaced here; the real one is walked in tests/web/gallery.spec.ts.

import { fireEvent, screen } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { RehearseCard } from '../RehearseCard.js';

const recorder = vi.hoisted(() => ({
  phase: 'recording' as 'idle' | 'starting' | 'recording' | 'stopping',
  elapsedMs: 134_000,
  denied: false,
  start: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('../../../lib/speech/record.js', () => ({ useRecording: () => recorder }));

afterEach(() => {
  recorder.phase = 'recording';
  vi.clearAllMocks();
});

const offer = (minutes: number | null, kind: 'talk' | 'read_aloud' = 'talk') => ({
  tool: 'offer_rehearsal' as const,
  kind,
  title: 'Die Fotosynthese',
  text: kind === 'read_aloud' ? 'Der kleine Fuchs lief durch den Wald.' : null,
  minutes,
  goal_id: null,
});
const show = (minutes: number | null, kind: 'talk' | 'read_aloud' = 'talk') =>
  renderInApp(
    <RehearseCard actionId="11111111-1111-4111-8111-111111111111" offer={offer(minutes, kind)} />,
  );

describe('while it records', () => {
  it('shows the running time large and the length she was given', () => {
    const loop = vi.spyOn(Animated, 'loop');
    show(5);
    const time = screen.getByText('2:14');
    expect((time as HTMLElement).style.fontSize).toBe('44px');
    expect(screen.getByText('Ziel 5:00 · ich höre zu')).toBeTruthy();
    // A screen reader hears that a recording runs, and how long it may.
    expect(screen.getByLabelText('Aufnahme läuft, 2:14 von 10:00')).toBeTruthy();
    // What to do stood there before she started; now the card says what is happening.
    expect(screen.queryByText(/Vorgesehen sind 5 Minuten/)).toBeNull();
    expect(loop).not.toHaveBeenCalled();
  });

  it('names the longest it may be when no length was given', () => {
    show(null);
    expect(screen.getByText('Ich höre zu · höchstens 10:00')).toBeTruthy();
  });

  it('ends with "Fertig", the one button', () => {
    show(5);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it('keeps the passage in sight: she reads it from the card', () => {
    show(null, 'read_aloud');
    expect(screen.getByTestId('rehearse-text').textContent).toBe(
      'Der kleine Fuchs lief durch den Wald.',
    );
    expect(screen.getByText('Ich höre zu · höchstens 2:00')).toBeTruthy();
  });
});

describe('before it records', () => {
  it('claims no listening and shows no time', () => {
    recorder.phase = 'idle';
    show(5);
    expect(screen.queryByTestId('rehearse-live')).toBeNull();
    expect(screen.queryByText(/ich höre zu/i)).toBeNull();
    expect(screen.getByText('Probevortrag')).toBeTruthy();
    expect(screen.getByText('Die Fotosynthese')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aufnahme starten' }));
    expect(recorder.start).toHaveBeenCalledTimes(1);
  });
});
