// Date helpers. The whole app stores dates as ISO `YYYY-MM-DD` (matches the
// shared-types `DateOnly` regex and the API). The UI always shows the European
// `DD.MM.YYYY` form so there is no day/month ambiguity for the user.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DateParts = { year: number; month: number; day: number };

export function isValidIso(iso: string | null | undefined): iso is string {
  if (!iso || !ISO_RE.test(iso)) return false;
  const { year, month, day } = parseIso(iso);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseIso(iso: string): DateParts {
  const [year, month, day] = iso.split('-').map((n) => Number.parseInt(n, 10));
  return { year: year!, month: month!, day: day! };
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

export function toIso({ year, month, day }: DateParts): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** ISO `YYYY-MM-DD` → European `DD.MM.YYYY`. Returns null for invalid input. */
export function isoToDisplay(iso: string | null | undefined): string | null {
  if (!isValidIso(iso)) return null;
  const { year, month, day } = parseIso(iso);
  return `${pad(day)}.${pad(month)}.${pad(year, 4)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function todayParts(now: Date = new Date()): DateParts {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Today as a `YYYY-MM-DD` ISO string, local timezone. Use for inclusive
 *  min/max bounds on date pickers (e.g. "tests can't be scheduled in the
 *  past"). Lexical compare on these strings works because the format is
 *  zero-padded and fixed-width. */
export function todayIso(now: Date = new Date()): string {
  return toIso(todayParts(now));
}

/** Whole years between `iso` and `now`. Used for the GDPR under-16 check.
 *  UTC-anchored to match the server: a learner whose 16th birthday is "today"
 *  in their local timezone but still "yesterday" in UTC must read as 15 on both
 *  client and server, otherwise the minor-consent flow forks on a TZ boundary. */
export function ageInYears(iso: string, now: Date = new Date()): number {
  const { year, month, day } = parseIso(iso);
  let age = now.getUTCFullYear() - year;
  const beforeBirthday =
    now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}
