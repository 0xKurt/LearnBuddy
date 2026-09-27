// Contact policy: when Buddy's message goes to the phone, decided by code, not by the model.
// docs/architecture.md §Proactivity, §Delivery; ADR 0006.
//
// Pure functions over settings + contact history, evaluated in the learner's
// time zone. Messages in the app are never limited or counted (ADR 0006): the
// policy only decides whether and when a message also goes to the phone, and
// keeps Buddy from saying the same thing twice. Three kinds of contact:
//   agreed  — a reminder the learner explicitly asked for ("erinnere mich
//             Donnerstag um 17 Uhr"). Sent at the agreed time; quiet hours and
//             pause still apply to the phone.
//   buddy   — Buddy's own initiative. Needs relevance ≥ 0.6 and a topic not
//             raised in the last 72 h; to the phone only when contact is on,
//             not paused, in the preferred window, outside quiet hours and on
//             a day she did not rule out — and, after "Seltener schreiben",
//             only when it is important (relevance ≥ 0.85).
//   learner — Buddy's answer to something the learner just did (her photos were
//             read, her practice is finished). Sent now outside quiet hours when
//             contact is on.
// Whatever cannot go to the phone (contact off, paused, no allowed time) waits
// in the app (delivery.ts). Only a low relevance or a repeated topic drops a
// message. Silence is always logged with its reason.

import {
  addDays,
  daysBetween,
  inWindow,
  localParts,
  minutesOf,
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
  paused_until: Date | null;
  /** "Seltener schreiben" (a notification button): only important initiatives to the phone. */
  phone_only_important: boolean;
};

export type PastContact = {
  /** The outreach row (to leave a row out of its own history at send time). */
  id?: string;
  /** When it was (or is scheduled to be) sent. */
  at: Date;
  topicKey: string;
};

export type OutreachProposal = {
  origin: 'agreed' | 'buddy' | 'learner';
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
  | 'no_slot'
  | 'only_important';

/** Not to the phone, but the message waits in the app. The other reasons drop it. */
export const IN_APP_REASONS: readonly SuppressReason[] = [
  'contact_disabled',
  'paused',
  'no_slot',
  'only_important',
];

export type PolicyDecision =
  | { kind: 'schedule'; sendAt: Date }
  | { kind: 'suppress'; reason: SuppressReason };

export const MIN_RELEVANCE = 0.6;
/** After "Seltener schreiben": what still reaches the phone (time-critical and ready). */
export const IMPORTANT_RELEVANCE = 0.85;
export const TOPIC_DEDUPE_HOURS = 72;
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
  if (proposal.origin === 'buddy') {
    // What makes Buddy's own message worth saying at all — in the app too.
    if (proposal.relevance === null || proposal.relevance < MIN_RELEVANCE) {
      return { kind: 'suppress', reason: 'low_relevance' };
    }
    const dedupeFrom = now.getTime() - TOPIC_DEDUPE_HOURS * 3_600_000;
    if (history.some((h) => h.topicKey === proposal.topicKey && h.at.getTime() >= dedupeFrom)) {
      return { kind: 'suppress', reason: 'duplicate_topic' };
    }
  }

  // From here on only the phone: contact outside the app is opt-in.
  if (!s.contact_enabled) return { kind: 'suppress', reason: 'contact_disabled' };
  if (s.paused_until && s.paused_until.getTime() > now.getTime()) {
    return { kind: 'suppress', reason: 'paused' };
  }

  if (
    proposal.origin === 'buddy' &&
    s.phone_only_important &&
    (proposal.relevance ?? 0) < IMPORTANT_RELEVANCE
  ) {
    return { kind: 'suppress', reason: 'only_important' };
  }

  const earliest = new Date(Math.max(proposal.earliest.getTime(), now.getTime()));

  if (proposal.origin === 'learner') {
    // Her own action's result: now, unless it is the middle of the night for her.
    const minute = minutesOf(localParts(earliest, s.timezone).time);
    return inWindow(minute, s.quiet_start, s.quiet_end)
      ? { kind: 'suppress', reason: 'no_slot' }
      : { kind: 'schedule', sendAt: earliest };
  }

  if (proposal.origin === 'agreed') {
    // Agreed time, moved out of quiet hours if the settings changed since.
    const p = localParts(earliest, s.timezone);
    const minute = minutesOf(p.time);
    if (!inWindow(minute, s.quiet_start, s.quiet_end))
      return { kind: 'schedule', sendAt: earliest };
    const next = findSlot(s, earliest, proposal.expiresAt, false, false);
    return next ? { kind: 'schedule', sendAt: next } : { kind: 'suppress', reason: 'no_slot' };
  }

  const slot =
    findSlot(s, earliest, proposal.expiresAt, true, true) ??
    findSlot(s, earliest, proposal.expiresAt, false, true);
  return slot ? { kind: 'schedule', sendAt: slot } : { kind: 'suppress', reason: 'no_slot' };
}

/**
 * First instant ≥ `from` and < `until` that is outside quiet hours (and, for
 * Buddy's initiatives, on a day she did not rule out, inside the preferred
 * window when `preferWindow`).
 */
function findSlot(
  s: ContactSettings,
  from: Date,
  until: Date,
  preferWindow: boolean,
  initiative: boolean,
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
    if (initiative && s.avoid_weekdays.includes(weekdayOf(date))) continue;
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

/** True when the change allows more contact to the phone than before (needs the adult under 16). */
export function loosens(before: ContactSettings, after: ContactSettings, now: Date): boolean {
  if (!before.contact_enabled && after.contact_enabled) return true;
  if (before.phone_only_important && !after.phone_only_important) return true;
  if (before.avoid_weekdays.some((d) => !after.avoid_weekdays.includes(d))) return true;
  const pausedBefore =
    before.paused_until && before.paused_until > now ? before.paused_until.getTime() : 0;
  const pausedAfter =
    after.paused_until && after.paused_until > now ? after.paused_until.getTime() : 0;
  if (pausedAfter < pausedBefore) return true;
  for (let m = 0; m < 1440; m += 5) {
    const wasQuiet = inWindow(m, before.quiet_start, before.quiet_end);
    const isQuiet = inWindow(m, after.quiet_start, after.quiet_end);
    if (wasQuiet && !isQuiet) return true;
  }
  return false;
}
