// Small decisions of the practice screen (`app/practice/[id].tsx`), out of the screen so it stays
// one task per file (Engineering-Regel 4): which verdict word is read before Buddy's reply. Pure.
// (Which question is on screen: `offers.ts`; whether a language is foreign: `isForeign` in lib/i18n.)

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';

/** The verdict word read before Buddy's reply (as ItemThread shows it); none for "not an attempt". */
export function verdictWordKey(verdict: PracticeTurnView['verdict']): string | null {
  if (verdict === 'not_an_attempt') return null;
  return `practice:verdict.${verdict ?? 'unchecked'}`;
}
