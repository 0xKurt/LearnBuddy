// The race between the reading and the stored reply (issues #40/#41): the loop listens
// again once both are there, whichever came last — deciding on only one of the two left
// the talk stuck in "Buddy spricht" with the mic off when a short reply was read out
// before the server had stored it.

import { describe, expect, it } from 'vitest';

import { afterReply } from '../talkTurn.js';

describe('afterReply', () => {
  it('waits while the reading still runs', () => {
    expect(afterReply(null, true, true)).toBe('wait');
  });

  it('waits while the reply is not stored yet — a short reply can be read out first', () => {
    expect(afterReply('done', false, true)).toBe('wait');
  });

  it('listens once both are there, in either order', () => {
    // Reading ended first, then the store returned — and the other way round.
    expect(afterReply('done', true, true)).toBe('listen');
  });

  it('pauses when she interrupted, or the reading failed', () => {
    expect(afterReply('stopped', true, true)).toBe('pause');
    expect(afterReply('error', true, true)).toBe('pause');
  });

  it('pauses with a screen reader on: an open mic would record it', () => {
    expect(afterReply('done', true, false)).toBe('pause');
  });
});
