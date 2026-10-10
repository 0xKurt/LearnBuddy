// Buddy's voice, chosen like a ringtone (issue #526): a tap on a row chooses and plays nothing; a
// tap on its sound button plays and chooses nothing, and the same button stops it. The chosen
// voice carries the tick and is the checked radio.
// requires live verification in Claude Code session (the sound itself and the request are replaced here; that six samples sound different is heard on a phone, #176)

import type { BuddySettingsView } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type End = (why: 'done' | 'stopped' | 'error') => void;

const spoken: Array<{ voice: string | undefined; onEnd: End | undefined }> = [];
let stops = 0;
vi.mock('../../../lib/speech/listen.js', () => ({
  speak: (_text: string, _lang: string, opts: { voice?: string; onEnd?: End }) => {
    spoken.push({ voice: opts.voice, onEnd: opts.onEnd });
    return Promise.resolve();
  },
  stop: () => {
    stops += 1;
    spoken.at(-1)?.onEnd?.('stopped');
  },
}));

const saved: Array<{ voice?: string; version: number }> = [];
vi.mock('../../../lib/api/endpoints.js', () => ({
  updateSettings: (body: { voice?: string; version: number }) => {
    saved.push(body);
    return Promise.resolve({ ...SETTINGS, voice: body.voice, version: body.version + 1 });
  },
}));

import { renderInApp } from '../../../testing/render.js';
import { VoicePicker } from '../VoicePicker.js';

const SETTINGS: BuddySettingsView = {
  contact_enabled: false,
  quiet_start: '20:00',
  quiet_end: '07:00',
  preferred_start: '15:00',
  preferred_end: '19:00',
  avoid_weekdays: [],
  paused_until: null,
  only_important: false,
  timezone: 'Europe/Berlin',
  voice: 'warm',
  natural_voice: true,
  version: 3,
  can_loosen: false,
};

beforeEach(() => {
  spoken.length = 0;
  saved.length = 0;
  stops = 0;
});

describe('listening and choosing are two things (issue #526)', () => {
  it('chooses with a tap on the row, and plays nothing', async () => {
    renderInApp(<VoicePicker settings={SETTINGS} />);
    expect(screen.getByRole('radio', { name: 'Warm' }).getAttribute('aria-checked')).toBe('true');
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Klar' }));
    });
    expect(saved).toEqual([{ voice: 'clear', version: 3 }]);
    expect(spoken).toEqual([]);
    expect(screen.getByRole('radio', { name: 'Klar' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Warm' }).getAttribute('aria-checked')).toBe('false');
  });

  it('plays a sample with the sound button, and chooses nothing; the same button stops it', () => {
    renderInApp(<VoicePicker settings={SETTINGS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hörprobe: Tief' }));
    expect(spoken.map((s) => s.voice)).toEqual(['deep']);
    expect(saved).toEqual([]);
    expect(screen.getByRole('radio', { name: 'Warm' }).getAttribute('aria-checked')).toBe('true');
    // While it plays, its button is the way to stop it.
    fireEvent.click(screen.getByRole('button', { name: 'Hörprobe anhalten' }));
    expect(stops).toBe(1);
    expect(screen.getByRole('button', { name: 'Hörprobe: Tief' })).toBeDefined();
  });

  it('goes back to "play" when the sample ends by itself', () => {
    renderInApp(<VoicePicker settings={SETTINGS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hörprobe: Sanft' }));
    expect(screen.queryByRole('button', { name: 'Hörprobe: Sanft' })).toBeNull();
    act(() => spoken[0]!.onEnd?.('done'));
    expect(screen.getByRole('button', { name: 'Hörprobe: Sanft' })).toBeDefined();
  });

  it('says how each voice sounds, so the names are no guessing game', () => {
    renderInApp(<VoicePicker settings={SETTINGS} />);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByText('Höher, fröhlich und munter')).toBeDefined();
    // "Hell" is the look's word, not a voice's (issue #526).
    expect(screen.queryByRole('radio', { name: 'Hell' })).toBeNull();
  });
});
