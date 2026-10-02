// Two screens may not say the opposite about the same learner (issue #205). The parents'
// hand-over claimed "Push-Benachrichtigungen: aus" while the settings said "Ja – nie nach
// 20:00 Uhr", because the hand-over had the sentence hardwired and read nothing at all.
// Parents rely on exactly this statement (CLAUDE.md rule 6), so what both screens show now
// comes from one function — and these tests are what holds them together.

import { describe, expect, it } from 'vitest';

import { contactState, handoverContactKey } from '../state.js';

describe('one reading of the contact state', () => {
  it('is off only when it is off', () => {
    expect(contactState({ enabled: false, pausedUntil: null })).toBe('off');
    // A pause on a learner whose contact is off is still off: the pause changes nothing to
    // take back, and saying "paused" would read as "allowed, just resting".
    expect(contactState({ enabled: false, pausedUntil: '2026-10-05' })).toBe('off');
  });

  it('tells a pause apart from being switched off', () => {
    expect(contactState({ enabled: true, pausedUntil: '2026-10-05' })).toBe('paused');
    expect(contactState({ enabled: true, pausedUntil: null })).toBe('on');
  });
});

describe('the hand-over line', () => {
  it('never says off when the parents ticked the box', () => {
    // This is the bug, as an assertion.
    expect(handoverContactKey(true)).toBe('profile.handover_contact_on');
    expect(handoverContactKey(false)).toBe('profile.handover_contact_off');
  });

  it('agrees with the settings for every state a fresh profile can be in', () => {
    // A profile created seconds ago cannot be paused, so these are the only two cases — and
    // in both, the two screens must land on the same side.
    for (const enabled of [true, false]) {
      const saysOff = handoverContactKey(enabled) === 'profile.handover_contact_off';
      const settingsSayOff = contactState({ enabled, pausedUntil: null }) === 'off';
      expect(saysOff, `contact_enabled=${enabled}`).toBe(settingsSayOff);
    }
  });
});
