import { describe, expect, it } from 'vitest';

import {
  addDays,
  daysBetween,
  inWindow,
  isLocalDate,
  isValidTimeZone,
  localParts,
  minutesOf,
  resolveDay,
  resolveLocalDateTime,
  resolveUntil,
  startOfLocalDay,
  startOfLocalWeek,
  weekdayOf,
  zonedToInstant,
} from '../time.js';

const BERLIN = 'Europe/Berlin';
const NY = 'America/New_York';

describe('localParts / zonedToInstant', () => {
  it('round-trips ordinary wall times in several zones', () => {
    for (const tz of [BERLIN, NY, 'Asia/Tokyo', 'Asia/Kathmandu', 'Australia/Lord_Howe', 'UTC']) {
      for (const [date, time] of [
        ['2026-01-15', '08:30'],
        ['2026-07-01', '23:59'],
        ['2026-12-31', '00:00'],
        ['2028-02-29', '12:00'],
      ] as const) {
        const instant = zonedToInstant(date, time, tz);
        const back = localParts(instant, tz);
        expect(back.date, `${tz} ${date}`).toBe(date);
        expect(back.time, `${tz} ${date}`).toBe(time);
      }
    }
  });

  it('knows the weekday of a local date', () => {
    expect(weekdayOf('2026-09-25')).toBe(5); // Friday
    expect(weekdayOf('2026-09-27')).toBe(7); // Sunday
    expect(localParts(new Date('2026-09-27T22:30:00Z'), BERLIN).weekday).toBe(1); // Mon 00:30 local
  });

  it('computes the local day across midnight for zones far from UTC', () => {
    const instant = new Date('2026-09-25T23:30:00Z');
    expect(localParts(instant, 'Asia/Tokyo').date).toBe('2026-09-26');
    expect(localParts(instant, NY).date).toBe('2026-09-25');
  });
});

describe('DST handling', () => {
  it('rejects a wall time inside the spring-forward gap (Berlin 2026-03-29 02:30)', () => {
    expect(resolveLocalDateTime('2026-03-29', '02:30', BERLIN, 'reject')).toEqual({
      ok: false,
      error: 'nonexistent_time',
    });
  });

  it('moves a gap time forward in compatible mode', () => {
    const r = resolveLocalDateTime('2026-03-29', '02:30', BERLIN, 'compatible');
    expect(r.ok).toBe(true);
    if (r.ok) expect(localParts(r.instant, BERLIN).time).toBe('03:30');
  });

  it('rejects an ambiguous fall-back wall time (Berlin 2026-10-25 02:30)', () => {
    expect(resolveLocalDateTime('2026-10-25', '02:30', BERLIN, 'reject')).toEqual({
      ok: false,
      error: 'ambiguous_time',
    });
  });

  it('takes the earlier instant for an ambiguous time in compatible mode', () => {
    const r = resolveLocalDateTime('2026-10-25', '02:30', BERLIN, 'compatible');
    expect(r.ok && r.instant.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('handles New York transitions on different dates than Europe', () => {
    expect(resolveLocalDateTime('2026-03-08', '02:15', NY, 'reject')).toEqual({
      ok: false,
      error: 'nonexistent_time',
    });
    // Same wall time is fine in Berlin that day.
    expect(resolveLocalDateTime('2026-03-08', '02:15', BERLIN, 'reject').ok).toBe(true);
  });

  it('handles the half-hour DST of Lord Howe Island', () => {
    // Lord Howe moves +10:30 → +11:00 on 2026-10-04 at 02:00 local.
    expect(resolveLocalDateTime('2026-10-04', '02:15', 'Australia/Lord_Howe', 'reject')).toEqual({
      ok: false,
      error: 'nonexistent_time',
    });
  });

  it('computes local day and week starts on DST days', () => {
    const inDay = new Date('2026-03-29T10:00:00Z');
    expect(startOfLocalDay(inDay, BERLIN).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(startOfLocalWeek(inDay, BERLIN).toISOString()).toBe('2026-03-22T23:00:00.000Z');
  });
});

describe('calendar helpers', () => {
  it('adds days across month and year boundaries and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-09-25', '2026-10-02')).toBe(7);
  });

  it('validates dates strictly', () => {
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-2-3')).toBe(false);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(() => minutesOf('24:00')).toThrow();
  });

  it('evaluates windows that wrap over midnight', () => {
    expect(inWindow(minutesOf('21:00'), '20:00', '07:00')).toBe(true);
    expect(inWindow(minutesOf('06:59'), '20:00', '07:00')).toBe(true);
    expect(inWindow(minutesOf('07:00'), '20:00', '07:00')).toBe(false);
    expect(inWindow(minutesOf('12:30'), '12:00', '13:00')).toBe(true);
  });

  it('accepts only real IANA zones', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Europe/Berlin; drop table')).toBe(false);
  });
});

describe('resolveDay (model never computes dates)', () => {
  // Wednesday 2026-09-23 16:00 in Berlin.
  const wed = new Date('2026-09-23T14:00:00Z');

  it('resolves "am Freitag" to the coming Friday', () => {
    expect(resolveDay({ kind: 'weekday', weekday: 5, weeks_ahead: 0 }, wed, BERLIN)).toEqual({
      ok: true,
      date: '2026-09-25',
    });
  });

  it('resolves the same weekday as today to next week, never today', () => {
    expect(resolveDay({ kind: 'weekday', weekday: 3, weeks_ahead: 0 }, wed, BERLIN)).toEqual({
      ok: true,
      date: '2026-09-30',
    });
  });

  it('anchors at the learner-local date, not UTC', () => {
    // 23:30 UTC on Wednesday is already Thursday in Tokyo.
    const lateWed = new Date('2026-09-23T23:30:00Z');
    expect(resolveDay({ kind: 'in_days', days: 1 }, lateWed, 'Asia/Tokyo')).toEqual({
      ok: true,
      date: '2026-09-25',
    });
    expect(resolveDay({ kind: 'in_days', days: 1 }, lateWed, BERLIN)).toEqual({
      ok: true,
      date: '2026-09-25',
    });
    expect(resolveDay({ kind: 'in_days', days: 1 }, lateWed, NY)).toEqual({
      ok: true,
      date: '2026-09-24',
    });
  });

  it('refuses unknown and out-of-range specs instead of guessing', () => {
    expect(resolveDay({ kind: 'unknown' }, wed, BERLIN)).toEqual({
      ok: false,
      error: 'unresolved_time',
    });
    expect(resolveDay({ kind: 'in_days', days: 400 }, wed, BERLIN).ok).toBe(false);
    expect(resolveDay({ kind: 'date', date: '2026-13-01' }, wed, BERLIN).ok).toBe(false);
    expect(resolveDay({ kind: 'weekday', weekday: 0, weeks_ahead: 0 }, wed, BERLIN).ok).toBe(false);
  });
});

describe('resolveUntil (temporary conditions always end)', () => {
  const wed = new Date('2026-09-23T14:00:00Z');

  it('"diese Woche" ends at the local Monday midnight after this week', () => {
    const r = resolveUntil({ kind: 'end_of_week', weeks_ahead: 0 }, wed, BERLIN);
    expect(r.ok && r.until.toISOString()).toBe('2026-09-27T22:00:00.000Z');
  });

  it('"heute" ends at local midnight', () => {
    const r = resolveUntil({ kind: 'end_of_day', days: 0 }, wed, NY);
    expect(r.ok && localParts(r.until, NY)).toMatchObject({ date: '2026-09-24', time: '00:00' });
  });

  it('"bis Freitag" ends after Friday', () => {
    const r = resolveUntil(
      { kind: 'through', day: { kind: 'weekday', weekday: 5, weeks_ahead: 0 } },
      wed,
      BERLIN,
    );
    expect(r.ok && localParts(r.until, BERLIN)).toMatchObject({
      date: '2026-09-26',
      time: '00:00',
    });
  });

  it('refuses unknown and past ends', () => {
    expect(resolveUntil({ kind: 'unknown' }, wed, BERLIN).ok).toBe(false);
    expect(
      resolveUntil({ kind: 'through', day: { kind: 'date', date: '2026-09-01' } }, wed, BERLIN).ok,
    ).toBe(false);
  });
});
