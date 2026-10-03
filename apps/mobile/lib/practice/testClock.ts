// The clock of a practice test she asked to sit with time (issue #241), in words.
//
// Calm on purpose: Prüfungsangst is the reason a clock is never the default. So the line says
// whole minutes in a small chip, never seconds ticking; it never turns red; and the one change it
// makes is a quiet sentence at five minutes ("Schau in Ruhe, was du noch schaffst."). The server keeps the
// deadline (`SessionView.timer`); this only counts down from what it was told.

import type { PracticeSummary } from '@learnbuddy/shared-types/contracts';

/** From here on the line says it gently: the time is getting short. */
export const SOON_MS = 5 * 60_000;

/**
 * What the header shows with `leftMs` to go, or null once the time is up: whole minutes, rounded
 * up — "noch 1 Min." until the very end, never "noch 0" — and whether the quiet hint is due.
 */
export function clockLine(leftMs: number): { count: number; soon: boolean } | null {
  if (leftMs <= 0) return null;
  return { count: Math.max(1, Math.ceil(leftMs / 60_000)), soon: leftMs <= SOON_MS };
}

/**
 * The milliseconds left now, counted from the moment the view arrived — never from the phone's
 * wall clock against a deadline, so a phone whose clock is wrong still shows the right time.
 */
export function leftNow(remainingMs: number, receivedAt: number, now: number): number {
  return Math.max(0, remainingMs - Math.max(0, now - receivedAt));
}

/**
 * What the result says when the time ran out: how far she got — and that what stayed open is
 * not answered, not wrong. Nothing answered at all is not said as "0 von 5": then only the
 * second sentence stands.
 */
export function timeUpLines(
  summary: Pick<PracticeSummary, 'answered'>,
  total: number,
): Array<{ key: string; count?: number; answered?: number }> {
  const lines: Array<{ key: string; count?: number; answered?: number }> = [];
  if (summary.answered > 0) {
    lines.push({ key: 'summary_test.time_up_line', count: total, answered: summary.answered });
  }
  if (summary.answered < total) lines.push({ key: 'summary_test.time_up_rest' });
  return lines;
}
