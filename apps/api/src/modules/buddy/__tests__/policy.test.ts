import { describe, expect, it } from 'vitest';

import { localParts } from '../../../lib/time.js';
import {
  decideContact,
  type ContactSettings,
  type OutreachProposal,
  type PastContact,
} from '../policy.js';

const base: ContactSettings = {
  contact_enabled: true,
  timezone: 'Europe/Berlin',
  quiet_start: '20:00',
  quiet_end: '07:00',
  preferred_start: '15:00',
  preferred_end: '18:30',
  avoid_weekdays: [],
  max_per_day: 1,
  max_per_week: 4,
  paused_until: null,
};

// Wednesday 2026-09-23, 10:00 in Berlin (UTC+2).
const WED_10 = new Date('2026-09-23T08:00:00Z');
const hours = (h: number) => h * 3_600_000;

function idea(overrides: Partial<OutreachProposal> = {}): OutreachProposal {
  return {
    origin: 'buddy',
    topicKey: 'exam:math:prep',
    relevance: 0.8,
    earliest: WED_10,
    expiresAt: new Date(WED_10.getTime() + hours(48)),
    ...overrides,
  };
}

function local(d: Date, tz = 'Europe/Berlin'): string {
  const p = localParts(d, tz);
  return `${p.date} ${p.time}`;
}

describe('decideContact — Buddy initiatives', () => {
  it('stays silent when contact is not enabled (opt-in)', () => {
    expect(decideContact({ ...base, contact_enabled: false }, idea(), [], WED_10)).toEqual({
      kind: 'suppress',
      reason: 'contact_disabled',
    });
  });

  it('stays silent while paused', () => {
    const paused = { ...base, paused_until: new Date(WED_10.getTime() + hours(24)) };
    expect(decideContact(paused, idea(), [], WED_10)).toEqual({
      kind: 'suppress',
      reason: 'paused',
    });
  });

  it('requires enough relevance; silence is a valid outcome', () => {
    expect(decideContact(base, idea({ relevance: 0.4 }), [], WED_10)).toEqual({
      kind: 'suppress',
      reason: 'low_relevance',
    });
    expect(decideContact(base, idea({ relevance: null }), [], WED_10).kind).toBe('suppress');
  });

  it('lands at the start of the preferred window the same day', () => {
    const d = decideContact(base, idea(), [], WED_10);
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-23 15:00');
  });

  it('moves to the next day when the window has passed', () => {
    const at1900 = new Date('2026-09-23T17:00:00Z');
    const d = decideContact(
      base,
      idea({ earliest: at1900, expiresAt: new Date(at1900.getTime() + hours(48)) }),
      [],
      at1900,
    );
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-24 15:00');
  });

  it('never sends during quiet hours', () => {
    const at2130 = new Date('2026-09-23T19:30:00Z');
    const d = decideContact(
      base,
      idea({ earliest: at2130, expiresAt: new Date(at2130.getTime() + hours(24)) }),
      [],
      at2130,
    );
    // Preferred window tomorrow is within the expiry.
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-24 15:00');
  });

  it('falls back to any non-quiet time when the preferred window is gone before expiry', () => {
    const at2130 = new Date('2026-09-23T19:30:00Z');
    const d = decideContact(
      base,
      idea({ earliest: at2130, expiresAt: new Date('2026-09-24T09:00:00Z') }),
      [],
      at2130,
    );
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-24 07:00');
  });

  it('respects the daily cap across all contact kinds', () => {
    const history: PastContact[] = [
      {
        at: new Date('2026-09-23T06:30:00Z'),
        topicKey: 'reminder:x',
        origin: 'agreed',
        answered: true,
      },
    ];
    const d = decideContact(base, idea(), history, WED_10);
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-24 15:00');
  });

  it('respects the weekly cap and reports caps when nothing fits before expiry', () => {
    const history: PastContact[] = ['2026-09-21', '2026-09-22'].map((day, i) => ({
      at: new Date(`${day}T13:00:00Z`),
      topicKey: `t${i}`,
      origin: 'buddy' as const,
      answered: true,
    }));
    const tight = { ...base, max_per_week: 2 };
    expect(decideContact(tight, idea(), history, WED_10)).toEqual({
      kind: 'suppress',
      reason: 'caps',
    });
  });

  it('skips avoided weekdays ("donnerstags hab ich Fußball")', () => {
    const thu = new Date('2026-09-24T08:00:00Z');
    const d = decideContact(
      { ...base, avoid_weekdays: [4] },
      idea({ earliest: thu, expiresAt: new Date(thu.getTime() + hours(48)) }),
      [],
      thu,
    );
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-25 15:00');
  });

  it('does not repeat a topic within 72 hours', () => {
    const history: PastContact[] = [
      {
        at: new Date('2026-09-21T13:00:00Z'),
        topicKey: 'exam:math:prep',
        origin: 'buddy',
        answered: true,
      },
    ];
    expect(decideContact(base, idea(), history, WED_10)).toEqual({
      kind: 'suppress',
      reason: 'duplicate_topic',
    });
  });

  it('does not follow up while the last initiative is unanswered', () => {
    const history: PastContact[] = [
      { at: new Date('2026-09-22T13:00:00Z'), topicKey: 'other', origin: 'buddy', answered: false },
    ];
    expect(decideContact(base, idea(), history, WED_10)).toEqual({
      kind: 'suppress',
      reason: 'previous_unanswered',
    });
    history[0]!.answered = true;
    expect(decideContact(base, idea(), history, WED_10).kind).toBe('schedule');
  });

  it('treats a zero cap as "no initiatives"', () => {
    expect(decideContact({ ...base, max_per_week: 0 }, idea(), [], WED_10)).toEqual({
      kind: 'suppress',
      reason: 'caps',
    });
  });

  it('evaluates windows in the learner time zone', () => {
    const ny = { ...base, timezone: 'America/New_York' };
    // 14:00 UTC = 10:00 New York.
    const now = new Date('2026-09-23T14:00:00Z');
    const d = decideContact(
      ny,
      idea({ earliest: now, expiresAt: new Date(now.getTime() + hours(24)) }),
      [],
      now,
    );
    expect(d.kind === 'schedule' && d.sendAt.toISOString()).toBe('2026-09-23T19:00:00.000Z');
  });

  it('keeps the preferred window on a DST switch day', () => {
    // Sunday 2026-10-25, Berlin falls back at 03:00. 10:00 local = 09:00 UTC.
    const sunday = new Date('2026-10-25T09:00:00Z');
    const d = decideContact(
      base,
      idea({ earliest: sunday, expiresAt: new Date(sunday.getTime() + hours(24)) }),
      [],
      sunday,
    );
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-10-25 15:00');
    expect(d.kind === 'schedule' && d.sendAt.toISOString()).toBe('2026-10-25T14:00:00.000Z');
  });
});

describe('decideContact — agreed reminders', () => {
  const agreed = (at: Date, hoursValid = 12): OutreachProposal => ({
    origin: 'agreed',
    topicKey: 'step:1',
    relevance: null,
    earliest: at,
    expiresAt: new Date(at.getTime() + hours(hoursValid)),
  });

  it('is sent at the agreed time even when caps are used up', () => {
    const at17 = new Date('2026-09-23T15:00:00Z');
    const full: PastContact[] = [
      { at: new Date('2026-09-23T13:00:00Z'), topicKey: 'x', origin: 'buddy', answered: false },
    ];
    const d = decideContact(base, agreed(at17), full, WED_10);
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-23 17:00');
  });

  it('is sent on an avoided weekday because the learner asked for it', () => {
    const thu17 = new Date('2026-09-24T15:00:00Z');
    const d = decideContact({ ...base, avoid_weekdays: [4] }, agreed(thu17), [], WED_10);
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-24 17:00');
  });

  it('still respects quiet hours and pause', () => {
    const at21 = new Date('2026-09-23T19:00:00Z');
    const d = decideContact(base, agreed(at21, 14), [], WED_10);
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-24 07:00');
    const paused = { ...base, paused_until: new Date('2026-09-30T00:00:00Z') };
    expect(decideContact(paused, agreed(at21), [], WED_10)).toEqual({
      kind: 'suppress',
      reason: 'paused',
    });
  });

  it('expires instead of arriving late', () => {
    const at21 = new Date('2026-09-23T19:00:00Z');
    expect(decideContact(base, agreed(at21, 2), [], WED_10)).toEqual({
      kind: 'suppress',
      reason: 'no_slot',
    });
  });
});
