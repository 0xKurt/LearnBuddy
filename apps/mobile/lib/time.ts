// Device time zone and locale-aware formatting of the API's local dates.

import { DEFAULT_TIMEZONE } from '@learnbuddy/shared-types/contracts';

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** The region an app language is formatted in when the phone does not name its own. */
const LOCALE_TAG: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
};

/** "en-US", "de-AT", "sr-Latn-RS" → language and region; null without a region. */
const REGIONAL = /^([a-z]{2,3})(?:-[A-Za-z]{4})?-([A-Z]{2}|\d{3})(?:-|$)/;

/**
 * The formatting locale for the app language (audit 30.09., #133): the phone's own region
 * when the phone speaks that language, so an English learner in the US reads "October 2"
 * and 3:00 PM instead of the British day-first default, and a German one in Vienna gets
 * de-AT. A phone in another language says nothing about how she reads English dates — the
 * default stands. An unsupported app language formats as German, the app's fallback.
 */
export function localeTag(language: string, device: string = deviceLocaleTag()): string {
  const fallback = LOCALE_TAG[language];
  if (fallback === undefined) return 'de-DE';
  const regional = REGIONAL.exec(device);
  return regional && regional[1] === language ? `${language}-${regional[2]}` : fallback;
}

let deviceTag: string | null = null;

/** The phone's locale as Intl reports it — the same source as deviceTimeZone(). */
function deviceLocaleTag(): string {
  if (deviceTag === null) {
    try {
      deviceTag = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      deviceTag = '';
    }
  }
  return deviceTag;
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
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Fr., 2. Okt." */
export function formatDayShort(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Wall time of an instant in the device zone, e.g. "15:00". */
export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/** Calendar date of an instant in the device zone, e.g. "4. Okt.". */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), { day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );
}

/** Ends are exclusive midnights; people think in the last day that still counts. */
export function formatLastDay(endIso: string, locale: string): string {
  const last = new Date(new Date(endIso).getTime() - 1);
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(last);
}

/** "Freitag" */
export function formatWeekday(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(localeTag(locale), { weekday: 'long', timeZone: 'UTC' }).format(
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

/** YYYY-MM-DD of an instant on the device's calendar. */
export function localDateOf(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Where a new day starts in the conversation (user feedback #22): for each message the
 * device-local day to show above it, or null. A day is shown where it changes, and above
 * the first message when that is not from today — so yesterday's chat reads as
 * yesterday's. Only the day, never how many days passed (CLAUDE.md rule 6).
 */
export function dayBreaks(createdAt: readonly string[], now: Date = new Date()): (string | null)[] {
  const today = localDateOf(now);
  let previous: string | null = null;
  return createdAt.map((iso, i) => {
    const day = localDateOf(iso);
    const show = i === 0 ? day !== today : day !== previous;
    previous = day;
    return show ? day : null;
  });
}
