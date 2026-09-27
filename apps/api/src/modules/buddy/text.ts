// Text helpers for provenance checks. These are NOT language understanding:
// they only verify that a quote the model cites really occurs in what the
// learner wrote (normalising case, whitespace, quotes and dashes).

const QUOTES = /[‘’‚‛′`´]/g;
const DQUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐-―−]/g;

export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(QUOTES, "'")
    .replace(DQUOTES, '"')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const EDGE = /^["'.,!?;:\s…-]+|["'.,!?;:\s…-]+$/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;
/** A quote this short is a fragment unless it is everything she wrote in that message. */
const MIN_FRAGMENT = 4;

function trimmed(text: string): string {
  return normalizeForMatch(text).replace(EDGE, '');
}

function atWordBoundaries(haystack: string, needle: string): boolean {
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    const before = at === 0 ? '' : haystack.charAt(at - 1);
    const after = haystack.charAt(at + needle.length);
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
  }
  return false;
}

/**
 * True when `quote` is the learner's own words: whole words, in order, from one of the
 * messages in `source` (after normalisation). A fragment of a word ("ge" in "geschlagen")
 * never counts, and a very short quote counts only when it is the whole message (a bare
 * "Ja" answering Buddy's question). Structural comparison against her text — not a list
 * of words (CLAUDE.md rule 3).
 */
export function quoteOccursIn(quote: string, source: string | readonly string[]): boolean {
  const q = trimmed(quote);
  if (q.length === 0) return false;
  const messages = (typeof source === 'string' ? [source] : source).map(trimmed);
  const letters = [...q].filter((c) => WORD_CHAR.test(c)).length;
  if (letters < MIN_FRAGMENT) return messages.some((m) => m === q);
  return messages.some((m) => atWordBoundaries(m, q));
}

// ─────────────── specifics a memory may only repeat ───────────────

type CalendarTerms = { prefixes: string[]; exact: string[] };
const calendarCache = new Map<string, CalendarTerms>();

const wordsOf = (text: string) => normalizeForMatch(text).match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * The calendar's own names in a locale — weekdays and times of day (matched as a word's start,
 * so "sonntags", "Sundays" count) and months (whole words) — from the platform's calendar data
 * (Intl/CLDR), not a list written here.
 */
function calendarTerms(locale: string): CalendarTerms {
  const cached = calendarCache.get(locale);
  if (cached) return cached;
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' });
  const lastWord = (s: string) => wordsOf(s).at(-1) ?? '';
  // German adverbs of time end in -s ("sonntags", "abends"): their stem matches both forms.
  const stem = (w: string) => (locale.startsWith('de') && w.length > 4 ? w.replace(/s$/, '') : w);
  const prefixes = new Set<string>();
  const exact = new Set<string>();
  const weekday = fmt({ weekday: 'long' });
  for (let d = 0; d < 7; d++)
    prefixes.add(stem(lastWord(weekday.format(new Date(Date.UTC(2026, 0, 4 + d))))));
  const period = fmt({ dayPeriod: 'long' });
  for (let h = 0; h < 24; h++)
    prefixes.add(stem(lastWord(period.format(new Date(Date.UTC(2026, 0, 4, h))))));
  const month = fmt({ month: 'long' });
  for (let m = 0; m < 12; m++) exact.add(lastWord(month.format(new Date(Date.UTC(2026, m, 15)))));
  prefixes.delete('');
  exact.delete('');
  const terms = { prefixes: [...prefixes], exact: [...exact] };
  calendarCache.set(locale, terms);
  return terms;
}

/** The specifics a text names: numbers, and days, times of day and months (by their calendar name). */
export function specificsIn(text: string, locale: string): Set<string> {
  const { prefixes, exact } = calendarTerms(locale);
  const found = new Set<string>();
  for (const w of wordsOf(text)) {
    if (/^\p{N}+$/u.test(w)) found.add(w);
    for (const p of prefixes) if (w.startsWith(p)) found.add(p);
    if (exact.includes(w)) found.add(w);
  }
  return found;
}

/**
 * Specifics in a statement Buddy wants to keep that the learner's cited words do not contain
 * (live finding 4: "hab gleich Handballtraining" became "hat sonntags Nachmittag
 * Handballtraining"). A memory may only repeat what she said: a day, time of day, month or
 * number must come from her quote (or, for a correction, from what was known already).
 * Provenance by structure, like quoteOccursIn — not language understanding.
 */
export function unsupportedSpecifics(
  statement: string,
  support: readonly string[],
  locale: string,
): string[] {
  const have = new Set(support.flatMap((s) => [...specificsIn(s, locale)]));
  return [...specificsIn(statement, locale)].filter((x) => !have.has(x));
}
