// Read-aloud retains its existing stable switch name and state.

import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useVoiceMode } from '../../../lib/speech/voiceMode.js';
import { renderInApp } from '../../../testing/render.js';
import { ReadAloudSwitch } from '../ReadAloudSwitch.js';

/** The state a screen reader announces: the native checkbox's own, or aria-checked. */
function isOn(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return el.checked;
  return el.getAttribute('aria-checked') === 'true';
}

describe('Vorlesen (issue #517)', () => {
  beforeEach(() => {
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
  });
});
