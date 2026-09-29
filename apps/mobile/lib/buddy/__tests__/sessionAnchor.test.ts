import { describe, expect, it } from 'vitest';

import {
  dayPart,
  greetingRoom,
  greetingVariant,
  SESSION_GAP_MS,
  startsNewSession,
} from '../sessionAnchor.js';

const at = (iso: string) => new Date(iso);

describe('startsNewSession', () => {
  it('is a new page after a long break', () => {
    expect(
      startsNewSession({
        lastMessageAt: at('2026-09-28T08:00:00Z'),
        now: at('2026-09-28T13:00:00Z'),
        coldStart: false,
      }),
    ).toBe(true);
  });

  it('keeps the same page while she is still in it', () => {
    expect(
      startsNewSession({
        lastMessageAt: at('2026-09-28T12:30:00Z'),
        now: at('2026-09-28T13:00:00Z'),
        coldStart: false,
      }),
    ).toBe(false);
    // Exactly at the gap it starts — one rule, no grey zone.
    const last = at('2026-09-28T09:00:00Z');
    expect(
      startsNewSession({
        lastMessageAt: last,
        now: new Date(last.getTime() + SESSION_GAP_MS),
        coldStart: false,
      }),
    ).toBe(true);
  });

  it('says no for an empty conversation (the first visit has its own screen)', () => {
    expect(
      startsNewSession({ lastMessageAt: null, now: at('2026-09-28T13:00:00Z'), coldStart: true }),
    ).toBe(false);
  });

  it('starts a session on the app’s own start, whatever the clock says (issue #104)', () => {
    // She closed the app and opened it again a minute later: a new session all the same.
    expect(
      startsNewSession({
        lastMessageAt: at('2026-09-28T12:59:00Z'),
        now: at('2026-09-28T13:00:00Z'),
        coldStart: true,
      }),
    ).toBe(true);
  });

  it('does not start one for a look at the phone (back from the background)', () => {
    // Same minute, same running app: no greeting — that would come with every glance.
    expect(
      startsNewSession({
        lastMessageAt: at('2026-09-28T12:59:00Z'),
        now: at('2026-09-28T13:00:00Z'),
        coldStart: false,
      }),
    ).toBe(false);
  });
});

describe('greetingRoom', () => {
  it('gives the greeting the view, less what the list adds under it', () => {
    // 740 tall view, 8 of bottom padding: the block that puts the greeting on top is 732.
    expect(greetingRoom(740, 8)).toBe(732);
  });

  it('asks for nothing before the view is measured', () => {
    expect(greetingRoom(0, 8)).toBe(0);
  });

  it('never asks for a negative height', () => {
    expect(greetingRoom(4, 8)).toBe(0);
  });
});

describe('dayPart', () => {
  it('splits the day the way people talk about it', () => {
    expect([5, 8, 10].map(dayPart)).toEqual(['morning', 'morning', 'morning']);
    expect([11, 14, 16].map(dayPart)).toEqual(['day', 'day', 'day']);
    expect([17, 20, 21].map(dayPart)).toEqual(['evening', 'evening', 'evening']);
    expect([22, 0, 4].map(dayPart)).toEqual(['night', 'night', 'night']);
  });
});

describe('greetingVariant', () => {
  it('rotates and never leaves the range', () => {
    expect([0, 1, 2, 3, 4].map(greetingVariant)).toEqual([0, 1, 2, 0, 1]);
    expect(greetingVariant(-1)).toBe(2);
  });
});
