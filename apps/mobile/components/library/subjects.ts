// What "Dein Material" needs to know about a subject before she opens it (issue #189).
// Pure functions, no screen: the order the subjects stand in, and the glimpse of what is
// inside one.
//
// There is no number in here on purpose. "Wie viel dazu da ist" is answered by NAMING the
// newest things and saying "und mehr" when there are more — a tally next to a subject would
// read as a workload, and a learner is never shown one (CLAUDE.md rule 6).

import type { LibrarySubject } from '@learnbuddy/shared-types/contracts';

/**
 * One thing in a subject, as the glimpse names it: a sheet or an exercise. `named` is false
 * when it has no name of its own yet — a sheet still being read, a practice Buddy prepared.
 */
type Thing = { name: string; named: boolean; at: string };

function things(subject: LibrarySubject, untitled: string, exercise: string): Thing[] {
  return [
    ...subject.materials.map((m) => ({
      name: m.title?.trim() || untitled,
      named: (m.title ?? '').trim().length > 0,
      at: m.created_at,
    })),
    ...subject.exercises.map((e) => ({
      name: e.title?.trim() || exercise,
      named: (e.title ?? '').trim().length > 0,
      at: e.started_at,
    })),
    // Both are UTC ISO strings from the API, so newest first is a plain string compare.
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export type Glimpse = { names: string[]; more: boolean };

/**
 * The newest things in a subject by name, and whether more stand behind them.
 *
 * What has a name of its own goes first — "Ohne Titel · Üben" tells her nothing about what
 * she would find, and that is the whole job of this line. Only when NOTHING in the subject
 * is named does the glimpse fall back to those words, so it never claims the subject is
 * empty while something is in it.
 */
export function glimpseOf(
  subject: LibrarySubject,
  words: { untitled: string; exercise: string },
  most = 2,
): Glimpse {
  const all = things(subject, words.untitled, words.exercise);
  const named = all.filter((t) => t.named);
  const shown = (named.length > 0 ? named : all).slice(0, most);
  return { names: shown.map((t) => t.name), more: all.length > shown.length };
}

/** Whether there is anything at all to look up in this subject. */
export function hasSomething(subject: LibrarySubject): boolean {
  return subject.materials.length > 0 || subject.exercises.length > 0 || subject.topics.length > 0;
}

/** When something last happened in this subject ('' when nothing ever did). */
function lastActivityOf(subject: LibrarySubject): string {
  const newest = things(subject, '', '')[0];
  return newest?.at ?? '';
}

/**
 * The order the subjects stand in: the one something happened in last comes first (the owner
 * asked for "nach fach oder nach zuletzt, also beides" — this is both at once, without a
 * second list or a switch to understand). A subject nothing has happened in yet stands at the
 * end, by name.
 */
export function byActivity(a: LibrarySubject, b: LibrarySubject): number {
  const [x, y] = [lastActivityOf(a), lastActivityOf(b)];
  if (x !== y) return x < y ? 1 : -1;
  return a.name.localeCompare(b.name);
}
