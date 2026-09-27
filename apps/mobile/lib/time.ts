// Device time zone and locale-aware formatting of the API's local dates.

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
  } catch {
    return 'Europe/Berlin';
  }
}

const LOCALE_TAG: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
};

function tag(locale: string): string {
  return LOCALE_TAG[locale] ?? 'de-DE';
}

/** Days from today (device-local) to a YYYY-MM-DD date. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

/** "Freitag, 2. Oktober" for a learner-local date. */
export function formatDay(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(tag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Fr., 2. Okt." */
export function formatDayShort(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(tag(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Wall time of an instant in the device zone, e.g. "15:00". */
export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/** Calendar date of an instant in the device zone, e.g. "4. Okt.". */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );
}

/** Ends are exclusive midnights; people think in the last day that still counts. */
export function formatLastDay(endIso: string, locale: string): string {
  const last = new Date(new Date(endIso).getTime() - 1);
  return new Intl.DateTimeFormat(tag(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(last);
}

/** "Freitag" */
export function formatWeekday(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(tag(locale), { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** ISO weekdays (1 = Monday … 7 = Sunday) as names: "Samstag, Sonntag". */
export function formatIsoWeekdays(days: readonly number[], locale: string): string {
  // 1 January 2024 was a Monday, so ISO weekday d is 2024-01-0d.
  return [...days]
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b)
    .map((d) => formatWeekday(`2024-01-0${d}`, locale))
    .join(', ');
}
