// "Anhören" for tones the app makes (issue #445): the same pill and the same hook as for words —
// one tap plays the two notes of the interval, a second tap stops them, and a player that could
// not sound says so instead of leaving her in silence.
// requires live verification in Claude Code session (the sound itself: expo-audio is replaced here)

import type { HeardTones } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type End = (why: 'done' | 'stopped' | 'error') => void;
const lines: Array<{ bars: unknown; tempo: number; onEnd: End | undefined }> = [];
let stops = 0;

// The app's own seam (`lib/music/play.ts`); under it is expo-audio, which the test tree has not.
vi.mock('../../../lib/music/play.js', () => ({
  playPitch: () => ({ stop: () => undefined }),
  playLine: (bars: unknown, tempo: number, onEnd?: End) => {
    lines.push({ bars, tempo, onEnd });
    return { stop: () => undefined };
  },
  stopNotes: () => {
    stops += 1;
  },
}));

// What she is told; the toast's own rendering is the toast's test.
const told: string[] = [];
vi.mock('../../lb/Toast.js', () => ({
  toast: { show: (text: string) => told.push(text), dismiss: () => undefined },
}));

const { ListenButton } = await import('../ListenButton.js');
const { renderInApp } = await import('../../../testing/render.js');

const THIRD: HeardTones = {
  bars: [
    [
      { el: 'note', pitch: { name: 'E', octave: 4 }, value: 'half', dotted: false },
      { el: 'note', pitch: { name: 'G', octave: 4 }, value: 'half', dotted: false },
    ],
  ],
  tempo: 80,
};

describe('ListenButton with tones (#445)', () => {
  beforeEach(() => {
    lines.length = 0;
    told.length = 0;
    stops = 0;
  });

  it('plays exactly the tones it was given, through the note player', () => {
    renderInApp(<ListenButton tones={THIRD} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anhören' }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ bars: THIRD.bars, tempo: 80 });
    // The state is in the words, never the colour alone.
    expect(screen.getByRole('button', { name: 'Anhalten' })).toBeTruthy();
  });

  it('stops on the second tap and is "Anhören" again at once', () => {
    renderInApp(<ListenButton tones={THIRD} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anhören' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anhalten' }));
    expect(stops).toBe(1);
    expect(screen.getByRole('button', { name: 'Anhören' })).toBeTruthy();
  });

  it('is free again when the tones have sounded, and says it when none came out', () => {
    renderInApp(<ListenButton tones={THIRD} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anhören' }));
    act(() => lines[0]?.onEnd?.('done'));
    expect(screen.getByRole('button', { name: 'Anhören' })).toBeTruthy();
    expect(told).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Anhören' }));
    act(() => lines[1]?.onEnd?.('error'));
    expect(told).toEqual(['Hier kommt gerade kein Ton heraus.']);
    expect(screen.getByRole('button', { name: 'Anhören' })).toBeTruthy();
  });

  it('stops what it plays when the question goes away', () => {
    const view = renderInApp(<ListenButton tones={THIRD} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anhören' }));
    view.unmount();
    expect(stops).toBe(1);
  });
});
