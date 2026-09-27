// Birth dates as the profile form takes them (day, month, year) and the API
// stores them (YYYY-MM-DD). Pure: used by onboarding and the correction in the
// parents' area.

/** YYYY-MM-DD for a real, past date; null otherwise. */
export function birthDateOf(
  day: string,
  month: string,
  year: string,
  now: Date = new Date(),
): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || y < 1920) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  if (date.getTime() > now.getTime()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Whole years on `now` (the device's calendar day). */
export function ageOf(iso: string, now: Date = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

/** The parts of a stored date for the form fields. */
export function partsOf(iso: string): { day: string; month: string; year: string } {
  const [y, m, d] = iso.split('-');
  return { day: String(Number(d)), month: String(Number(m)), year: y ?? '' };
}

/** "10. März 2014" in the app's language (a calendar date, no time zone shift). */
export function formatBirthDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}
