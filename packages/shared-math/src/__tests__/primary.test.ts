// Primary-school figures (issue #254): hands ↔ time, amounts from coins, counts, and what code
// refuses.

import { describe, expect, it } from 'vitest';

import {
  handAngles,
  parseClockAnswer,
  primaryKey,
  primaryProblem,
  sameTime,
  timeFromHands,
  type BaseTen,
  type Clock,
  type DotField,
  type Money,
} from '../primary.js';

const clock = (c: Clock['c'], ask: Clock['ask'] = 'time', h24 = false): Clock => ({
  type: 'clock',
  c,
  h24,
  ask,
});

describe('hands ↔ time', () => {
  it.each([
    [{ h: 3, m: 0 }, 90, 0],
    [{ h: 7, m: 30 }, 225, 180], // halb acht: the hour hand halfway between 7 and 8
    [{ h: 7, m: 45 }, 232.5, 270], // Viertel vor acht
    [{ h: 9, m: 15 }, 277.5, 90], // Viertel nach neun
    [{ h: 12, m: 0 }, 0, 0],
    [{ h: 19, m: 30 }, 225, 180], // 19:30 is the same position as 7:30
  ])('%o puts the hour hand at %d° and the minute hand at %d°', (t, hour, minute) => {
    expect(handAngles(t)).toEqual({ hour, minute });
  });

  it('reads every time of the dial back from its hands', () => {
    for (let h = 0; h < 12; h++) {
      for (let m = 0; m < 60; m++) {
        const { hour, minute } = handAngles({ h, m });
        expect(timeFromHands(hour, minute)).toEqual({ h, m });
      }
    }
  });

  it('refuses hands that contradict each other', () => {
    // The minute hand on 6 (half past) with the hour hand right on 7: no real clock shows that.
    expect(timeFromHands(210, 180)).toBeNull();
    // Within a finger's inaccuracy it is still half past seven.
    expect(timeFromHands(226, 181)).toEqual({ h: 7, m: 30 });
  });

  it('7:30 and 19:30 are one reading, unless the task asks for 24 hours', () => {
    expect(sameTime({ h: 7, m: 30 }, { h: 19, m: 30 }, false)).toBe(true);
    expect(sameTime({ h: 7, m: 30 }, { h: 19, m: 30 }, true)).toBe(false);
    expect(sameTime({ h: 0, m: 0 }, { h: 12, m: 0 }, false)).toBe(true);
    expect(sameTime({ h: 7, m: 30 }, { h: 7, m: 35 }, false)).toBe(false);
  });
});

describe('what a question reads off', () => {
  it('a time, a span forwards over 12, an amount, a count', () => {
    expect(primaryKey(clock([{ h: 7, m: 45 }]))).toEqual({
      kind: 'time',
      time: { h: 7, m: 45 },
      h24: false,
    });
    expect(
      primaryKey(
        clock(
          [
            { h: 7, m: 45 },
            { h: 8, m: 30 },
          ],
          'span',
        ),
      ),
    ).toEqual({
      kind: 'span',
      minutes: 45,
    });
    expect(
      primaryKey(
        clock(
          [
            { h: 11, m: 30 },
            { h: 1, m: 15 },
          ],
          'span',
        ),
      ),
    ).toEqual({
      kind: 'span',
      minutes: 105,
    });
    const money: Money = {
      type: 'money',
      p: [
        { d: '2€', n: 1 },
        { d: '1€', n: 1 },
        { d: '20ct', n: 2 },
        { d: '5ct', n: 1 },
      ],
      ask: 'sum',
    };
    expect(primaryKey(money)).toEqual({ kind: 'amount', cents: 345 });
    expect(primaryKey({ type: 'dot_field', field: 'twenty', n: [8, 6], ask: 'count' })).toEqual({
      kind: 'count',
      n: 14,
    });
    expect(primaryKey({ type: 'base_ten', h: 2, t: 13, o: 4, ask: 'count' })).toEqual({
      kind: 'count',
      n: 334,
    });
  });

  it('no key when the figure declares none', () => {
    expect(primaryKey(clock([{ h: 7, m: 45 }], 'none'))).toBeNull();
  });
});

describe('what code refuses', () => {
  it.each([
    [
      'a time read off two clocks',
      clock(
        [
          { h: 7, m: 0 },
          { h: 8, m: 0 },
        ],
        'time',
      ),
    ],
    ['a span with one clock', clock([{ h: 7, m: 0 }], 'span')],
    [
      'a span of nothing',
      clock(
        [
          { h: 7, m: 0 },
          { h: 19, m: 0 },
        ],
        'span',
      ),
    ],
    [
      'a piece twice',
      {
        type: 'money',
        p: [
          { d: '1€', n: 1 },
          { d: '1€', n: 2 },
        ],
        ask: 'sum',
      } satisfies Money,
    ],
    [
      'too many pieces for a phone',
      {
        type: 'money',
        p: [
          { d: '1ct', n: 9 },
          { d: '2ct', n: 9 },
        ],
        ask: 'sum',
      } satisfies Money,
    ],
    [
      'more dots than the field',
      { type: 'dot_field', field: 'twenty', n: [15, 6], ask: 'count' } satisfies DotField,
    ],
    [
      'an empty second colour',
      { type: 'dot_field', field: 'twenty', n: [7, 0], ask: 'count' } satisfies DotField,
    ],
    ['no blocks', { type: 'base_ten', h: 0, t: 0, o: 0, ask: 'count' } satisfies BaseTen],
  ])('%s', (_, figure) => {
    expect(primaryProblem(figure)).not.toBeNull();
    expect(primaryKey(figure)).toBeNull();
  });
});

describe('a written clock time', () => {
  it.each([
    ['7:45', { h: 7, m: 45 }],
    ['7.45', { h: 7, m: 45 }],
    [' 19:05 ', { h: 19, m: 5 }],
    ['7', { h: 7, m: 0 }],
  ])('%s is read', (text, time) => {
    expect(parseClockAnswer(text)).toEqual(time);
  });

  it.each(['halb acht', '7:60', '7:5', '25:00', '7,45', '7:45 Uhr'])('%s is not', (text) => {
    expect(parseClockAnswer(text)).toBeNull();
  });
});
