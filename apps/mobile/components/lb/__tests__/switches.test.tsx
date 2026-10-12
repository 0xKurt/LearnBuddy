import type * as Listen from '../../../lib/speech/listen.js';
// Read-aloud retains its existing stable switch name and state.

import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVoiceMode } from '../../../lib/speech/voiceMode.js';
import { renderInApp } from '../../../testing/render.js';
import { ReadAloudSwitch } from '../ReadAloudSwitch.js';

// requires live verification in Claude Code session — current speech output is an outside-world seam.
const speech = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock('../../../lib/speech/listen.js', async (load) => ({
  ...(await load<typeof Listen>()),
  stop: speech.stop,
}));

/** The state a screen reader announces: the native checkbox's own, or aria-checked. */
function isOn(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return el.checked;
  return el.getAttribute('aria-checked') === 'true';
}

describe('Vorlesen (issue #517)', () => {
  beforeEach(() => {
    speech.stop.mockClear();
    useVoiceMode.getState().setReadAloud(false);
  });

  it('keeps one name, on or off — the state is the switch’s, not the label’s', () => {
    renderInApp(<ReadAloudSwitch />);
    const sw = screen.getByRole('switch', { name: 'Vorlesen' });
    expect(isOn(sw)).toBe(false);
    act(() => {
      fireEvent.click(sw);
    });
    const after = screen.getByRole('switch', { name: 'Vorlesen' });
    expect(isOn(after)).toBe(true);
    expect(speech.stop).not.toHaveBeenCalled();
    fireEvent.click(after);
    expect(isOn(screen.getByRole('switch', { name: 'Vorlesen' }))).toBe(false);
    expect(speech.stop).toHaveBeenCalledTimes(1);
  });
});
