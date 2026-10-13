// A refused microphone is said once (#599 correction): a refused dictation left its note above
// the Composer, and a later refusal on a rehearsal card showed the same sentence a second time.

import { describe, expect, it } from 'vitest';

import { micRefusal } from '../micRefusal.js';

describe('whose note of the refused microphone stands', () => {
  it('is the place that was refused last — every earlier one falls silent', () => {
    const composer = {};
    const card = {};
    expect(micRefusal.owns(composer)).toBe(false);
    micRefusal.claim(composer);
    expect(micRefusal.owns(composer)).toBe(true);
    micRefusal.claim(card);
    expect([micRefusal.owns(composer), micRefusal.owns(card)]).toEqual([false, true]);
    // She taps the Composer's microphone again and is refused again: the note is back there.
    micRefusal.claim(composer);
    expect([micRefusal.owns(composer), micRefusal.owns(card)]).toEqual([true, false]);
  });
});
