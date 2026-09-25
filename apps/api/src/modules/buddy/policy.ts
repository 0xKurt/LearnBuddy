// Contact policy: when Buddy may reach out, decided by code, not by the model.
// docs/architecture.md §Contact control, ADR 0004 §3.
//
// Pure functions over settings + contact history, evaluated in the learner's
// time zone. Two kinds of contact:
//   agreed — a reminder the learner explicitly asked for ("erinnere mich
//            Donnerstag um 17 Uhr"). Sent at the agreed time; quiet hours and
//            pause still apply; caps do not block it (it was requested) but it
//            counts toward the caps for Buddy's own initiatives.
//   buddy  — Buddy's own initiative. Needs relevance ≥ 0.6, lands in the
//            preferred window, respects caps, avoided weekdays, topic dedupe,
//            and never follows up while the previous initiative is unanswered.
// Silence is a normal outcome and is always logged with its reason.

import {
  addDays,
  daysBetween,
  inWindow,
  localParts,
  minutesOf,
  startOfLocalWeek,
  timeOfMinutes,
  weekdayOf,
  zonedToInstant,
} from '../../lib/time.js';

export type ContactSettings = {
  contact_enabled: boolean;
  timezone: string;
  quiet_start: string;
  quiet_end: string;
  preferred_start: string;
  preferred_end: string;
  avoid_weekdays: number[];
  max_per_day: number;
  max_per_week: number;
  paused_until: Date | null;
};

export type PastContact = {
  /** When it was (or is scheduled to be) sent. */
  at: Date;
  topicKey: string;
  origin: 'agreed' | 'buddy';
  /** The learner opened or answered it. */
  answered: boolean;
};

export type OutreachProposal = {
  origin: 'agreed' | 'buddy';
  topicKey: string;
  /** Model-rated relevance 0..1 (required for Buddy's initiatives). */
  relevance: number | null;
  /** Not before (agreed time, or now). */
  earliest: Date;
  expiresAt: Date;
};

export type SuppressReason =
  | 'contact_disabled'
  | 'paused'
  | 'low_relevance'
  | 'duplicate_topic'
  | 'previous_unanswered'
  | 'caps'
  | 'no_slot';

export type PolicyDecision =
  | { kind: 'schedule'; sendAt: Date }
  | { kind: 'suppress'; reason: SuppressReason };

export const MIN_RELEVANCE = 0.6;
export const TOPIC_DEDUPE_HOURS = 72;
export const UNANSWERED_HOURS = 48;
const MAX_LOOKAHEAD_DAYS = 14;

/** Allowed minutes of a day: [start, end) ranges within `window`, outside quiet hours. */
function allowedRanges(s: ContactSettings, window: [number, number]): Array<[number, number]> {
  const qs = minutesOf(s.quiet_start);
  const qe = minutesOf(s.quiet_end);
  const nonQuiet: Array<[number, number]> =
    qs === qe
      ? [[0, 1440]]
      : qs < qe
        ? [
            [0, qs],
            [qe, 1440],
          ]
        : [[qe, qs]];
  const out: Array<[number, number]> = [];
  for (const [a, b] of nonQuiet) {
    const lo = Math.max(a, window[0]);
    const hi = Math.min(b, window[1]);
    if (lo < hi) out.push([lo, hi]);
  }
  return out;
}

function earliestMinute(ranges: Array<[number, number]>, from: number): number | null {
  for (const [a, b] of ranges) {
    const m = Math.max(a, from);
    if (m < b) return m;
  }
  return null;
}

export function decideContact(
  s: ContactSettings,
  proposal: OutreachProposal,
  history: PastContact[],
  now: Date,
): PolicyDecision {
  if (!s.contact_enabled) return { kind: 'suppress', reason: 'contact_disabled' };
  if (s.paused_until && s.paused_until.getTime() > now.getTime()) {
    return { kind: 'suppress', reason: 'paused' };
  }

  const earliest = new Date(Math.max(proposal.earliest.getTime(), now.getTime()));

  if (proposal.origin === 'agreed') {
    // Agreed time, moved out of quiet hours if the settings changed since.
    const p = localParts(earliest, s.timezone);
    const minute = minutesOf(p.time);
    if (!inWindow(minute, s.quiet_start, s.quiet_end))
      return { kind: 'schedule', sendAt: earliest };
    const next = findSlot(s, earliest, proposal.expiresAt, [], false, true);
    return next ? { kind: 'schedule', sendAt: next } : { kind: 'suppress', reason: 'no_slot' };
  }

  if (proposal.relevance === null || proposal.relevance < MIN_RELEVANCE) {
    return { kind: 'suppress', reason: 'low_relevance' };
  }
  const dedupeFrom = now.getTime() - TOPIC_DEDUPE_HOURS * 3_600_000;
  if (history.some((h) => h.topicKey === proposal.topicKey && h.at.getTime() >= dedupeFrom)) {
    return { kind: 'suppress', reason: 'duplicate_topic' };
  }
  const lastBuddy = history
    .filter((h) => h.origin === 'buddy' && h.at.getTime() <= now.getTime())
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (
    lastBuddy &&
    !lastBuddy.answered &&
    now.getTime() - lastBuddy.at.getTime() < UNANSWERED_HOURS * 3_600_000
  ) {
    return { kind: 'suppress', reason: 'previous_unanswered' };
  }
  if (s.max_per_day === 0 || s.max_per_week === 0) return { kind: 'suppress', reason: 'caps' };

  const slot =
    findSlot(s, earliest, proposal.expiresAt, history, true, false) ??
    findSlot(s, earliest, proposal.expiresAt, history, false, false);
  if (slot) return { kind: 'schedule', sendAt: slot };
  // Distinguish "full" from "no allowed time at all" for the audit trail.
  const uncapped = findSlot(s, earliest, proposal.expiresAt, [], false, true);
  return { kind: 'suppress', reason: uncapped ? 'caps' : 'no_slot' };
}

/**
 * First instant ≥ `from` and < `until` that is outside quiet hours (and, for
 * Buddy's initiatives, on a non-avoided weekday, inside the preferred window
 * when `preferWindow`, and under the daily/weekly caps).
 */
function findSlot(
  s: ContactSettings,
  from: Date,
  until: Date,
  history: PastContact[],
  preferWindow: boolean,
  ignoreCaps: boolean,
): Date | null {
  const tz = s.timezone;
  const start = localParts(from, tz);
  const lastDay = localParts(until, tz).date;
  const window: [number, number] = preferWindow
    ? [minutesOf(s.preferred_start), minutesOf(s.preferred_end)]
    : [0, 1440];
  const ranges = allowedRanges(s, window);

  for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset++) {
    const date = addDays(start.date, offset);
    if (daysBetween(date, lastDay) < 0) break;
    if (!ignoreCaps) {
      if (s.avoid_weekdays.includes(weekdayOf(date))) continue;
      const weekStart = startOfLocalWeek(zonedToInstant(date, '12:00', tz), tz).getTime();
      let perDay = 0;
      let perWeek = 0;
      for (const h of history) {
        const hp = localParts(h.at, tz);
        if (hp.date === date) perDay++;
        if (startOfLocalWeek(h.at, tz).getTime() === weekStart) perWeek++;
      }
      if (perDay >= s.max_per_day || perWeek >= s.max_per_week) continue;
    }
    const fromMinute =
      offset === 0 ? minutesOf(start.time) + (from.getUTCSeconds() > 0 ? 1 : 0) : 0;
    const minute = earliestMinute(ranges, fromMinute);
    if (minute === null) continue;
    const instant = zonedToInstant(date, timeOfMinutes(minute), tz);
    const at = instant.getTime() < from.getTime() ? from : instant;
    if (at.getTime() >= until.getTime()) return null;
    return at;
  }
  return null;
}
