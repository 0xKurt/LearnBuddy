// What a measured rehearsal says in words (issue #264). Pure: only the numbers the API
// computed; nothing here is judged anew. No score and no grade — a talk is "about right",
// "a bit short" or "a bit long" against the length she was given, nothing more.

import type { RehearsalView } from '@learnbuddy/shared-types/contracts';

/** Within a tenth of the length she was given (at least 15 s either way) counts as fitting. */
export function lengthVerdict(
  durationS: number,
  targetS: number | null,
): 'short' | 'fits' | 'long' | null {
  if (targetS === null || targetS <= 0) return null;
  const slack = Math.max(15, Math.round(targetS / 10));
  if (durationS < targetS - slack) return 'short';
  if (durationS > targetS + slack) return 'long';
  return 'fits';
}

/** "4:05" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The words of the text she should look at again, both kinds together, each once, in order. */
export function wordsToPractise(r: Pick<RehearsalView, 'skipped' | 'misread'>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of [...r.skipped, ...r.misread]) {
    const k = w.toLocaleLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}
