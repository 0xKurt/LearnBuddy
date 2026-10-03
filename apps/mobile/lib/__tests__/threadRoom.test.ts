import { describe, expect, it } from 'vitest';

import { boardKeeps, threadRoom, type RoomInput } from '../practice/threadRoom.js';

// One reply of 120 pt under one earlier turn: the conversation needs 260, the newest turn 120.
const base: RoomInput = {
  room: 60,
  threadNeed: 260,
  tops: [0, 128],
  quiet: false,
  boardGives: false,
  boardSpare: Infinity,
  cardNatural: 0,
  cardDelta: 0,
  visual: false,
  growable: true,
  viewHeight: 740,
};
const newest = 260 - (12 + 128) + 8;

describe('threadRoom (issues #286, #232)', () => {
  it('cuts the newest turn to the room when nothing below can give way', () => {
    const r = threadRoom(base);
    expect(r.threadCap).toBe(60);
    expect(r.threadFloor).toBe(0);
    expect(r.threadClipped).toBe(true);
  });

  it('keeps the newest turn whole where a board gives way and has room to spare', () => {
    const r = threadRoom({ ...base, boardGives: true, boardSpare: 400 });
    expect(r.threadCap).toBe(newest);
    expect(r.threadFloor).toBe(newest);
  });

  it('never takes more of a board than it can spare above its parts and its bar (#232)', () => {
    // The cloze with the keyboard up: the board can give only 20 pt more.
    const r = threadRoom({ ...base, boardGives: true, boardSpare: 20 });
    expect(r.threadCap).toBe(80);
    expect(r.threadFloor).toBe(80);
    expect(r.threadClipped).toBe(true);
    expect(r.threadHolds).toBe(true);
  });

  it('shows everything when everything fits, and a quiet thread gives way whole', () => {
    expect(threadRoom({ ...base, room: 300 }).threadCap).toBe(260);
    expect(threadRoom({ ...base, quiet: true, tops: [], threadNeed: 40, room: 0 }).threadCap).toBe(
      0,
    );
  });

  it('keeps two lines of parts and the bar', () => {
    expect(boardKeeps(0)).toBeGreaterThan(2 * 44 + 48);
  });
});
