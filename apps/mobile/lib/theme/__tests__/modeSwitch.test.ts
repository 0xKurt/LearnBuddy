// "Wie das Handy" was the default and a one-way street: the switch sets light or dark, and once
// touched there was no way back short of setting the device up again (issue #222).

import { describe, expect, it } from 'vitest';

import { modeSwitch } from '../modeSwitch.js';

describe('what the light/dark switch offers', () => {
  it('offers nothing to undo while the app still follows the phone', () => {
    expect(modeSwitch('system')).toEqual({
      pinned: false,
      hint: 'look.mode_hint',
      backAction: null,
    });
  });

  it('offers the way back on both pinned sides', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(modeSwitch(mode), mode).toEqual({
        pinned: true,
        hint: 'look.mode_hint_pinned',
        backAction: 'follow-system',
      });
    }
  });

  it('announces it twice, because a long press is invisible', () => {
    // The hint says it for someone reading the screen; the named action is what a screen
    // reader's rotor can find. One without the other is a gesture only its author knows.
    const pinned = modeSwitch('dark');
    expect(pinned.hint).toBe('look.mode_hint_pinned');
    expect(pinned.backAction).not.toBeNull();
  });
});
