// Buddy's reply while it is written arrives in chunks; shown as they come it
// jumps. The screen instead lets the shown text catch up with what arrived,
// word by word, at a calm reading pace that speeds up when it falls behind —
// never ahead of what the server sent (nothing is invented), and a new round
// (the text was replaced) starts over. Pure logic (unit tests).

/** Characters per second at the calm pace. */
export const REVEAL_CPS = 90;
/** It never lags more than this long behind what arrived (ms): then it speeds up. */
export const REVEAL_MAX_LAG_MS = 700;

/**
 * How much of `target` to show after `dtMs`, given `shown` characters shown so far.
 * Ends on a word boundary where it can, so words appear whole.
 */
export function revealNext(shown: number, target: string, dtMs: number): number {
  if (shown >= target.length) return target.length;
  const behind = target.length - shown;
  const calm = (REVEAL_CPS * dtMs) / 1000;
  // Catch up within the maximal lag, however much arrived at once (a quarter of the lag is
  // the time constant: after the whole lag only a few words are left).
  const catchUp = behind * Math.min(1, (4 * dtMs) / REVEAL_MAX_LAG_MS);
  let next = Math.min(target.length, shown + Math.max(1, Math.ceil(Math.max(calm, catchUp))));
  // Finish the word it is in (at most a few characters more).
  const space = target.slice(next).search(/\s/);
  if (space > 0 && space <= 12) next += space;
  else if (space < 0 && target.length - next <= 12) next = target.length;
  return Math.min(next, target.length);
}

/** The text to reveal from: a new text that does not continue the old one starts over. */
export function revealStart(previous: string, next: string, shown: number): number {
  return next.startsWith(previous.slice(0, shown)) ? Math.min(shown, next.length) : 0;
}
