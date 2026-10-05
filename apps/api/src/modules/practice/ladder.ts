// The hint ladder's end and what a test says instead (docs/architecture.md §Practice): when a
// request for help shows the solution, how the solution is put into words, and the one neutral
// line of a practice test. Read by the answer (`answer.ts`) for an answer, "Tipp" and a question
// to the tutor (#391), so the three never disagree about where the ladder ends.

import type { AnswerResponse } from '@learnbuddy/shared-types/contracts';

import { t } from '../../i18n/index.js';
import { noSingleSolution } from './evaluate.js';
import { shownSolution, type ItemRow } from './service.js';
import { answersOnScreen } from './viewParts.js';

/**
 * After this many wrong tries the solution is explained (docs/buddy/03-fahrplan.md §2):
 * the old app withheld it forever, which frustrated; research on bottom-out hints and
 * worked examples supports a bounded ladder.
 */
export const REVEAL_AFTER_MISSES = 3;

/**
 * Asked for help again, the solution is explained only once she has seen this many hints and
 * every prepared one (live finding 1: the first "Tipp" after a miss showed the solution).
 */
const HINTS_BEFORE_SOLUTION = 2;

/**
 * After this many misses "Tipp" stands out, once (report #388 §5.5): help avoidance hurts weaker
 * children, so one quiet offer on the chip she already has — never a pushed hint, never a coach.
 * One below `REVEAL_AFTER_MISSES`: the offer comes before the solution would.
 */
const OFFER_HINT_AFTER_MISSES = REVEAL_AFTER_MISSES - 1;

/** Whether "Tipp" stands out for a question where "Tipp" works: missed twice, no hint taken yet. */
export function hintOffered(si: { attempts: number; hints_used: number }): boolean {
  return si.attempts >= OFFER_HINT_AFTER_MISSES && si.hints_used === 0;
}

/** Whether a (further) request for help shows the solution: the end of the hint ladder. */
export function ladderDone(i: {
  hints: string[];
  hints_used: number;
  prepared_hints_used: number;
}) {
  return (
    i.prepared_hints_used >= i.hints.length &&
    i.hints_used >= Math.max(i.hints.length, HINTS_BEFORE_SOLUTION)
  );
}

/**
 * The worked solution when prepared, otherwise the plain solution.
 *
 * For a free text neither is "the solution" (issue #197): a prepared way is introduced as ONE
 * way, and where none was prepared the app says plainly that there is no single right answer
 * here — instead of reading out the 600-character key as if it were one.
 */
export function workedReply(
  locale: string,
  i: Pick<ItemRow, 'kind' | 'answer' | 'choices' | 'correct_choice' | 'unit' | 'worked_solution'>,
): string {
  const free = noSingleSolution(i);
  if (i.worked_solution) {
    return `${t(locale, free ? 'practice.one_way_intro' : 'practice.worked_intro')} ${i.worked_solution}`;
  }
  if (free) return t(locale, 'practice.no_single_solution');
  // A Diktat's word stands in the solution card right under this line (issue #242): said here
  // too, it would be the same word twice (#286). The line says what to do with it instead.
  if (i.kind === 'spelling_dictation') return t(locale, 'practice.dictation.shown');
  return t(locale, 'practice.solution_is', { answer: shownSolution(i) });
}

/**
 * A test: one neutral acknowledgement per answer, never a hint or the
 * solution (whatever the model wrote); what was right comes at the end.
 *
 * Asked for help, she gets the test's one line, worded for the form in front of her (issue #388):
 * "schreib, was du denkst" only where she writes her answer — on options or a board there is
 * nothing to write, and the line says "antworte" instead.
 */
export function asTestTurn<
  J extends {
    verdict: AnswerResponse['verdict'];
    reply: string;
    gaveHint: boolean;
    revealed: boolean;
  },
>(j: J, locale: string, item: Parameters<typeof answersOnScreen>[0]): J {
  if (j.verdict === null) return { ...j, gaveHint: false, revealed: false };
  const key =
    j.verdict !== 'not_an_attempt'
      ? 'practice.test_noted'
      : answersOnScreen(item)
        ? 'practice.test_no_hints_on_screen'
        : 'practice.test_no_hints';
  return { ...j, reply: t(locale, key), gaveHint: false, revealed: false };
}
