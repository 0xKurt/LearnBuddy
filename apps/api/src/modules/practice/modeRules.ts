// What a session's mode allows around a question (docs/architecture.md §Practice): whether it
// feeds spaced repetition, whether the hint ladder runs, and when "Tipp" and "Lösung zeigen" are
// offered. Read by the answer (`answer.ts`), the view (`sessionView.ts`) and the doors beside
// them (`hint.ts`, `setAside.ts`), so all of them ask the same rules.

import type { SessionMode } from '@learnbuddy/shared-types/contracts';

import type { ItemRow } from './service.js';

/** Practice feeds spaced repetition; tests and homework do not. */
export function learnsFsrs(mode: SessionMode): boolean {
  return mode === 'practice';
}

/** The hint ladder runs in practice (tests give none; homework has its own rules). */
export function givesHints(mode: SessionMode): boolean {
  return mode === 'practice';
}

/**
 * "Tipp" on request: also in homework help (the help sheet promises tips; user feedback #7),
 * where a hint never carries the solution (checked like every homework reply).
 */
export function offersHintButton(mode: SessionMode): boolean {
  return mode === 'practice' || mode === 'help';
}

/**
 * "Lösung zeigen" only after a real try or a hint, never from the first second (user feedback
 * #8); a spoken sentence can always be skipped. Never in homework, never while a test runs.
 */
export function revealReady(
  mode: SessionMode,
  si: { kind: ItemRow['kind']; attempts: number; hints_used: number },
): boolean {
  if (mode === 'help' || mode === 'test') return false;
  // A free text keeps the way out (she must be able to move on), but nothing is revealed by
  // it: the view sends no answer and the screen names it "Überspringen" (issue #197).
  return si.kind === 'speak' || si.attempts > 0 || si.hints_used > 0;
}
