// A switch's name says what it does; its state says on or off (issue #517). The owner read "Hell"
// next to an off switch as "Hell: aus" — exactly the wrong way round — and a screen reader said
// "Vorlesen ist an, Schalter, an". Both switches are pinned here: the name stays the same when
// the switch flips, and the state is the switch's own, never a second word.

import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useVoiceMode } from '../../../lib/speech/voiceMode.js';
import { renderInApp } from '../../../testing/render.js';
import { ModeChoice } from '../LookChoice.js';
import { ReadAloudSwitch } from '../ReadAloudSwitch.js';

/** The state a screen reader announces: the native checkbox's own, or aria-checked. */
function isOn(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return el.checked;
  return el.getAttribute('aria-checked') === 'true';
}

describe('Dunkelmodus (issue #517)', () => {
  it('is named for what it does, off while light, and keeps its name when switched on', () => {
    renderInApp(<ModeChoice />);
    const sw = screen.getByRole('switch', { name: 'Dunkelmodus' });
    expect(isOn(sw)).toBe(false);
    // No state word beside it: the old row said "Hell", then "Dunkel".
    expect(screen.queryByText('Hell')).toBeNull();
    act(() => {
      fireEvent.click(sw);
    });
    const after = screen.getByRole('switch', { name: 'Dunkelmodus' });
    expect(isOn(after)).toBe(true);
    expect(screen.queryByText('Dunkel')).toBeNull();
  });
});

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
