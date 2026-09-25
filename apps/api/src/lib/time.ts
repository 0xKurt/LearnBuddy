// Time-zone arithmetic and temporal specs. docs/architecture.md §Time.
//
// Every rule about *when* (quiet hours, preferred window, avoided weekdays,
// "am Freitag" in a message, "diese Woche keine Zeit") is evaluated in the
// learner's IANA time zone, anchored to the moment the learner wrote the
// message — never to server time or to when a background job happens to
// run. The model never computes calendar dates: it emits a TemporalSpec and
// this module resolves it. Local wall times that do not exist (spring
// forward) or exist twice (fall back) are rejected so the caller can ask
// instead of guessing.
//
// Implemented on Intl only; DST behaviour is covered by lib/__tests__/time.test.ts.

export type LocalParts = {
  /** YYYY-MM-DD in the zone. */
  date: string;
  /** HH:MM (24h) in the zone. */
  time: string;
  hour: number;
  minute: number;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

/** Named IANA zones only ("Europe/Berlin"); fixed offsets and "UTC" aliases are fine too. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z_+\-/0-9]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type RawParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

function rawParts(instant: Date, tz: string): RawParts {
  const out: RawParts = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0, weekday: 1 };
  for (const p of formatter(tz).formatToParts(instant)) {
    if (p.type === 'year') out.year = Number(p.value);
    else if (p.type === 'month') out.month = Number(p.value);
    else if (p.type === 'day') out.day = Number(p.value);
    else if (p.type === 'hour') out.hour = Number(p.value);
    else if (p.type === 'minute') out.minute = Number(p.value);
    else if (p.type === 'second') out.second = Number(p.value);
    else if (p.type === 'weekday') out.weekday = WEEKDAY_INDEX[p.value] ?? 1;
  }
  return out;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function localParts(instant: Date, tz: string): LocalParts {
  const r = rawParts(instant, tz);
  return {
    date: `${r.year}-${pad(r.month)}-${pad(r.day)}`,
    time: `${pad(r.hour)}:${pad(r.minute)}`,
    hour: r.hour,
    minute: r.minute,
    weekday: r.weekday,
  };
}

/** Offset of `tz` from UTC at `instant`, in minutes (Berlin summer = +120). */
export function offsetMinutes(instant: Date, tz: string): number {
  const r = rawParts(instant, tz);
  const asUtc = Date.UTC(r.year, r.month - 1, r.day, r.hour, r.minute, r.second);
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60_000);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function isLocalDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function isLocalTime(value: string): boolean {
  return TIME_RE.test(value);
}

function parseDate(date: string): [number, number, number] {
  if (!isLocalDate(date)) throw new Error(`invalid local date: ${date}`);
  const m = DATE_RE.exec(date)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** "HH:MM" or "HH:MM:SS" → minutes after midnight. */
export function minutesOf(time: string): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`invalid local time: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function timeOfMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export type ZonedResult =
  | { ok: true; instant: Date }
  | { ok: false; error: 'nonexistent_time' | 'ambiguous_time' };

/**
 * Local wall time in `tz` → UTC instant.
 * - `reject`: DST gaps and overlaps are errors (for times a learner agreed to).
 * - `compatible`: gaps move forward by the gap, overlaps take the earlier
 *   instant (for system-chosen times such as "start of the preferred window").
 */
export function resolveLocalDateTime(
  date: string,
  time: string,
  tz: string,
  disambiguation: 'reject' | 'compatible' = 'reject',
): ZonedResult {
  const [y, mo, d] = parseDate(date);
  const mins = minutesOf(time);
  const wallUtc = Date.UTC(y, mo - 1, d, Math.floor(mins / 60), mins % 60);
  // Candidate instants from the offsets in force a day before and after.
  const offsets = new Set([
    offsetMinutes(new Date(wallUtc - 86_400_000), tz),
    offsetMinutes(new Date(wallUtc + 86_400_000), tz),
    offsetMinutes(new Date(wallUtc), tz),
  ]);
  const matches: number[] = [];
  for (const off of offsets) {
    const candidate = wallUtc - off * 60_000;
    const back = localParts(new Date(candidate), tz);
    if (back.date === date && minutesOf(back.time) === mins && !matches.includes(candidate)) {
      matches.push(candidate);
    }
  }
  matches.sort((a, b) => a - b);
  if (matches.length === 1) return { ok: true, instant: new Date(matches[0]!) };
  if (matches.length > 1) {
    return disambiguation === 'reject'
      ? { ok: false, error: 'ambiguous_time' }
      : { ok: true, instant: new Date(matches[0]!) };
  }
  if (disambiguation === 'reject') return { ok: false, error: 'nonexistent_time' };
  // Gap: reading the wall time with the offset in force *before* the
  // transition lands just after the gap (02:30 → 03:30 on spring forward).
  const before = offsetMinutes(new Date(wallUtc - 86_400_000), tz);
  return { ok: true, instant: new Date(wallUtc - before * 60_000) };
}

/** Convenience for system-chosen times: never fails (see `compatible`). */
export function zonedToInstant(date: string, time: string, tz: string): Date {
  const r = resolveLocalDateTime(date, time, tz, 'compatible');
  if (!r.ok) throw new Error('unreachable: compatible resolution cannot fail');
  return r.instant;
}

/** Add whole calendar days to a local date string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from local date `a` to local date `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = parseDate(a);
  const [yb, mb, db] = parseDate(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a local date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = parseDate(date);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** True when `localMinutes` lies in [start, end), wrapping over midnight. */
export function inWindow(localMinutes: number, start: string, end: string): boolean {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  return s < e ? localMinutes >= s && localMinutes < e : localMinutes >= s || localMinutes < e;
}

/** Start of the learner's local day containing `instant`. */
export function startOfLocalDay(instant: Date, tz: string): Date {
  return zonedToInstant(localParts(instant, tz).date, '00:00', tz);
}

/** Start of the learner's local ISO week (Monday 00:00) containing `instant`. */
export function startOfLocalWeek(instant: Date, tz: string): Date {
  const p = localParts(instant, tz);
  return zonedToInstant(addDays(p.date, -(p.weekday - 1)), '00:00', tz);
}

// ─────────────────────────── temporal specs ───────────────────────────

/**
 * What the model may say about a day. It never writes a computed date for a
 * relative expression; the server resolves it against the message time.
 *   date      "am 14.10." → the calendar date the learner named
 *   in_days   "heute" 0, "morgen" 1, "in zwei Wochen" 14
 *   weekday   "am Freitag" → next Friday strictly after today (+ weeks_ahead)
 *   unknown   the learner's meaning is unclear → Buddy must ask
 */
export type DaySpec =
  | { kind: 'date'; date: string }
  | { kind: 'in_days'; days: number }
  | { kind: 'weekday'; weekday: number; weeks_ahead: number }
  | { kind: 'unknown' };

/**
 * How long a temporary condition lasts ("diese Woche keine Zeit"). Always
 * ends; `unknown` means Buddy must ask rather than store a permanent rule.
 *   end_of_day   through the end of the day `days` from today
 *   end_of_week  through Sunday of this week (+ weeks_ahead)
 *   through      through the end of a resolved day
 */
export type UntilSpec =
  | { kind: 'end_of_day'; days: number }
  | { kind: 'end_of_week'; weeks_ahead: number }
  | { kind: 'through'; day: DaySpec }
  | { kind: 'unknown' };

export type TemporalError = 'unresolved_time' | 'invalid_time' | 'out_of_range';

export type DayResult = { ok: true; date: string } | { ok: false; error: TemporalError };

/** Resolve a DaySpec to a learner-local date, anchored at `reference`. */
export function resolveDay(spec: DaySpec, reference: Date, tz: string): DayResult {
  const today = localParts(reference, tz).date;
  switch (spec.kind) {
    case 'unknown':
      return { ok: false, error: 'unresolved_time' };
    case 'date':
      return isLocalDate(spec.date)
        ? { ok: true, date: spec.date }
        : { ok: false, error: 'invalid_time' };
    case 'in_days':
      if (!Number.isInteger(spec.days) || spec.days < 0 || spec.days > 366) {
        return { ok: false, error: 'out_of_range' };
      }
      return { ok: true, date: addDays(today, spec.days) };
    case 'weekday': {
      if (!Number.isInteger(spec.weekday) || spec.weekday < 1 || spec.weekday > 7) {
        return { ok: false, error: 'invalid_time' };
      }
      if (!Number.isInteger(spec.weeks_ahead) || spec.weeks_ahead < 0 || spec.weeks_ahead > 8) {
        return { ok: false, error: 'out_of_range' };
      }
      const delta = (spec.weekday - weekdayOf(today) + 7) % 7 || 7;
      return { ok: true, date: addDays(today, delta + spec.weeks_ahead * 7) };
    }
  }
}

export type UntilResult = { ok: true; until: Date } | { ok: false; error: TemporalError };

/** Resolve an UntilSpec to the exclusive end instant (local midnight after the last day). */
export function resolveUntil(spec: UntilSpec, reference: Date, tz: string): UntilResult {
  const today = localParts(reference, tz).date;
  let lastDay: string;
  switch (spec.kind) {
    case 'unknown':
      return { ok: false, error: 'unresolved_time' };
    case 'end_of_day':
      if (!Number.isInteger(spec.days) || spec.days < 0 || spec.days > 60) {
        return { ok: false, error: 'out_of_range' };
      }
      lastDay = addDays(today, spec.days);
      break;
    case 'end_of_week':
      if (!Number.isInteger(spec.weeks_ahead) || spec.weeks_ahead < 0 || spec.weeks_ahead > 8) {
        return { ok: false, error: 'out_of_range' };
      }
      lastDay = addDays(today, 7 - weekdayOf(today) + spec.weeks_ahead * 7);
      break;
    case 'through': {
      const r = resolveDay(spec.day, reference, tz);
      if (!r.ok) return r;
      lastDay = r.date;
      break;
    }
  }
  if (daysBetween(today, lastDay) < 0) return { ok: false, error: 'out_of_range' };
  return { ok: true, until: zonedToInstant(addDays(lastDay, 1), '00:00', tz) };
}

const WEEKDAY_EN = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function weekdayName(date: string): string {
  return WEEKDAY_EN[weekdayOf(date)] ?? '';
}
