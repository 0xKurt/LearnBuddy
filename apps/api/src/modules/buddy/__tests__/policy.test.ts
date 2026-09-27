import { describe, expect, it } from 'vitest';

import { localParts } from '../../../lib/time.js';
import {
  decideContact,
  IN_APP_REASONS,
  loosens,
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
  paused_until: null,
  phone_only_important: false,
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
  it('sends nothing to the phone when contact is not enabled (opt-in) — it waits in the app', () => {
    const d = decideContact({ ...base, contact_enabled: false }, idea(), [], WED_10);
    expect(d).toEqual({ kind: 'suppress', reason: 'contact_disabled' });
    expect(d.kind === 'suppress' && IN_APP_REASONS.includes(d.reason)).toBe(true);
  });

  it('does not repeat a topic in the app either, with contact off', () => {
    const history: PastContact[] = [
      { at: new Date('2026-09-22T13:00:00Z'), topicKey: 'exam:math:prep' },
    ];
    const d = decideContact({ ...base, contact_enabled: false }, idea(), history, WED_10);
    expect(d).toEqual({ kind: 'suppress', reason: 'duplicate_topic' });
    expect(IN_APP_REASONS).not.toContain('duplicate_topic');
  });

  it('sends nothing to the phone while paused', () => {
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

  it('after "Seltener schreiben" only important initiatives go to the phone; the rest waits in the app', () => {
    const fewer = { ...base, phone_only_important: true };
    const d = decideContact(fewer, idea({ relevance: 0.8 }), [], WED_10);
    expect(d).toEqual({ kind: 'suppress', reason: 'only_important' });
    expect(d.kind === 'suppress' && IN_APP_REASONS.includes(d.reason)).toBe(true);
    expect(decideContact(fewer, idea({ relevance: 0.9 }), [], WED_10).kind).toBe('schedule');
    // Her agreed reminders and answers to her own actions are not affected.
    expect(decideContact(fewer, idea({ origin: 'agreed', relevance: null }), [], WED_10).kind).toBe(
      'schedule',
    );
    expect(
      decideContact(fewer, idea({ origin: 'learner', relevance: null }), [], WED_10).kind,
    ).toBe('schedule');
  });

  it('turning "Seltener schreiben" off again loosens contact (the PIN under 16)', () => {
    const fewer = { ...base, phone_only_important: true };
    expect(loosens(fewer, base, WED_10)).toBe(true);
    expect(loosens(base, fewer, WED_10)).toBe(false);
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

  it('writes several times a day: no daily limit (ADR 0006)', () => {
    const history: PastContact[] = [
      { at: new Date('2026-09-23T06:30:00Z'), topicKey: 'reminder:x' },
      { at: new Date('2026-09-23T07:00:00Z'), topicKey: 'exam:german:prep' },
      { at: new Date('2026-09-23T07:30:00Z'), topicKey: 'material:1' },
    ];
    const d = decideContact(base, idea(), history, WED_10);
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-23 15:00');
  });

  it('has no weekly limit either', () => {
    const history: PastContact[] = ['2026-09-21', '2026-09-22', '2026-09-23'].flatMap((day, i) =>
      [0, 1, 2].map((j) => ({ at: new Date(`${day}T0${6 + j}:00:00Z`), topicKey: `t${i}-${j}` })),
    );
    const d = decideContact(base, idea(), history, WED_10);
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-23 15:00');
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
      { at: new Date('2026-09-21T13:00:00Z'), topicKey: 'exam:math:prep' },
    ];
    expect(decideContact(base, idea(), history, WED_10)).toEqual({
      kind: 'suppress',
      reason: 'duplicate_topic',
    });
    // After 72 hours the topic may come up again.
    const later = new Date('2026-09-24T14:00:00Z');
    expect(
      decideContact(
        base,
        idea({ earliest: later, expiresAt: new Date(later.getTime() + hours(24)) }),
        history,
        later,
      ).kind,
    ).toBe('schedule');
  });

  it('writes about a new topic even when the last message is still unanswered', () => {
    const history: PastContact[] = [{ at: new Date('2026-09-23T07:00:00Z'), topicKey: 'other' }];
    const d = decideContact(base, idea(), history, WED_10);
    expect(d.kind === 'schedule' && local(d.sendAt)).toBe('2026-09-23 15:00');
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

  it('is sent at the agreed time, whatever else Buddy said that day', () => {
    const at17 = new Date('2026-09-23T15:00:00Z');
    const full: PastContact[] = [{ at: new Date('2026-09-23T13:00:00Z'), topicKey: 'step:1' }];
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
