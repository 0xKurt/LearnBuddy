// Small decisions of the practice screen (`app/practice/[id].tsx`), out of the screen so it stays
// one task per file (Engineering-Regel 4): which verdict word is read before Buddy's reply, and
// whether a language is worth hearing read aloud. Pure. (Which question is on screen: `offers.ts`.)

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';

import { currentLocale } from '../i18n/index.js';
import { baseLanguage } from '../speech/voice.js';

/** A language other than the app's: worth hearing read aloud (vocab prompts and answers). */
export function foreign(lang: string | null): lang is string {
  const base = baseLanguage(lang);
  return base !== null && base !== currentLocale();
}

/** The verdict word read before Buddy's reply (as ItemThread shows it); none for "not an attempt". */
export function verdictWordKey(verdict: PracticeTurnView['verdict']): string | null {
  if (verdict === 'not_an_attempt') return null;
  return `practice:verdict.${verdict ?? 'unchecked'}`;
}
