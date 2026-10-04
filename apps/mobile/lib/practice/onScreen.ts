// Small decisions of the practice screen (`app/practice/[id].tsx`), out of the screen so it stays
// one task per file (Engineering-Regel 4): which question is on screen, which verdict word is read
// before Buddy's reply, and whether a language is worth hearing read aloud. Pure.

import type {
  PracticeTurnView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';

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

/**
 * The question on screen: the one the learner works on or has just closed
 * (it stays until "Weiter"), otherwise the first open one; none when nothing is left.
 */
export function questionOnScreen(
  session: SessionView,
  pinnedId: string | null,
): SessionItemView | null {
  const pinned = pinnedId ? session.items.find((i) => i.item.id === pinnedId) : undefined;
  const id = pinned?.item.id ?? session.current_item_id;
  const shown = id ? session.items.find((i) => i.item.id === id) : undefined;
  // An open question of a session that has ended can't be answered any more.
  if (!shown || (shown.status === 'open' && session.status !== 'active')) return null;
  return shown;
}
