// What the end of a session says, in words (user feedback #1; docs/UX-PRINCIPLES.md,
// docs/DESIGN-BRIEF.md "encouraging without being fake"): something true and kind, never a
// hit rate. No "0 · Auf Anhieb richtig", no "0 von 1": homework says what she solved
// herself; a round says how much she did, and only a whole round right at once is named.
// The result screen (SessionSummary) and Buddy's home card (NowCard) use the same lines.

import type { PracticeSummary, SessionMode } from '@learnbuddy/shared-types/contracts';

/** One sentence: a key in the practice namespace, with a count for the plural when needed. */
export type SummaryLine = { key: string; count?: number };

export function summaryLines(
  summary: Pick<PracticeSummary, 'answered' | 'first_try'>,
  mode: SessionMode,
): SummaryLine[] {
  const { answered, first_try: firstTry } = summary;
  if (answered <= 0) return [];
  if (mode === 'help') return [{ key: 'summary_line.help', count: answered }];
  const lines: SummaryLine[] = [{ key: 'summary_line.answered', count: answered }];
  // Only praise that is true for the whole round; a partial count would read like a grade.
  if (mode !== 'test' && firstTry === answered) {
    lines.push({ key: answered === 1 ? 'summary_line.first_one' : 'summary_line.all_first' });
  }
  return lines;
}
