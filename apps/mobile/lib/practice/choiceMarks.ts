// What each option of a closed multiple choice says (issue #521): the options stay on screen once
// the question is answered, read only, so a question whose stem does not name them ("Welcher
// Bruch ist größer?") still makes sense afterwards. Hers is marked — with its verdict's shape (a
// check or a cross) where verdicts are shown, plainly hers in a running test —, the right one
// only where the server sent the solution (never in homework help, never during a test), and the
// ones she tried before say so as they did while the question was open. Pure: the tiles render it.

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';

/**
 * One option of a closed question: hers (judged right or wrong, or not shown judged), the right
 * one, one she tried before, or none of these (`null`).
 */
export type ChoiceMark = 'mine_right' | 'mine_wrong' | 'mine' | 'right' | 'tried' | null;

type Turn = Pick<PracticeTurnView, 'role' | 'text' | 'verdict'>;

export function choiceMarks(
  choices: readonly string[],
  /** This question's tries and Buddy's replies, oldest first (no "Anders erklären"). */
  turns: readonly Turn[],
  /** The solution as the server sent it (the right option's text), or null. */
  solution: string | null,
  /** Verdicts are shown (not in a running test). */
  judged: boolean,
): ChoiceMark[] {
  const tries = turns.filter((t) => t.role === 'learner' && t.verdict !== 'not_an_attempt');
  const last = tries.at(-1);
  const mine = last ? choices.indexOf(last.text) : -1;
  const right = solution === null ? -1 : choices.indexOf(solution);
  const tried = new Set(tries.filter((t) => t.verdict === 'incorrect').map((t) => t.text));
  const own =
    !judged || !last
      ? 'mine'
      : last.verdict === 'correct'
        ? 'mine_right'
        : last.verdict === 'incorrect'
          ? 'mine_wrong'
          : 'mine';
  return choices.map((choice, i) =>
    i === mine ? own : i === right ? 'right' : tried.has(choice) ? 'tried' : null,
  );
}
