// What the practice screen offers around the question on screen — which question that is, and
// the ways past it, back to it and out of it (Tipp aside: the server says that one). Pure: the
// screen asks, this decides, the screen wires the taps. Moved out of `app/practice/[id].tsx`
// (issue #402) so the screen stays within its size (docs/engineering-guards.md, rule 4).

import type { SessionItemView, SessionView } from '@learnbuddy/shared-types/contracts';

import { freeText } from './essay.js';

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

export type Offers = {
  /** A running test: no verdicts, no solutions, but a question can be skipped. */
  testing: boolean;
  /** The second help chip: show the solution (or skip, in a test), or set the task aside. */
  skip: 'reveal' | 'later' | null;
  /** What that chip says when it isn't "Lösung zeigen" (a `practice:` key), and its hint. */
  skipLabel: 'skip' | 'later' | null;
  skipHint: 'later_hint' | null;
  /** "Anders erklären" after the solution. */
  explainAgain: boolean;
  /** "Frage passt nicht". */
  flaggable: boolean;
};

export function questionOffers(session: SessionView, shown: SessionItemView): Offers {
  const testing = session.mode === 'test' && session.status === 'active';
  const open = shown.status === 'open';
  const { item } = shown;
  // Homework help: a task can be set aside while another one is open (it comes back).
  const canPostpone =
    session.mode === 'help' && open && session.items.filter((i) => i.status === 'open').length > 1;
  // After a shown solution — in homework after a task she solved herself (never in a test).
  // Not after a clean first try: there the three ways to re-explain were three chips of
  // noise between the solution and "Weiter" (owner 28.09., issue #61). She can still ask
  // Buddy in the chat, and after a wrong try or a hint they are right there.
  const satFirstTry = shown.status === 'correct' && shown.attempts <= 1 && shown.hints_used === 0;
  return {
    testing,
    // "Lösung zeigen" only once the server offers it: after a try or a hint (feedback #8).
    skip: testing || shown.reveal_available ? 'reveal' : canPostpone ? 'later' : null,
    // A free text has no solution to show, so the way past it is named for what it does
    // (issue #197) — "Lösung zeigen" would promise something the server does not send.
    skipLabel:
      testing || freeText(item) ? 'skip' : canPostpone && !shown.reveal_available ? 'later' : null,
    skipHint: canPostpone && !testing ? 'later_hint' : null,
    explainAgain:
      !open &&
      !testing &&
      !satFirstTry &&
      (shown.answer !== null ||
        (session.mode === 'help' && shown.status === 'correct') ||
        // A free text sends no answer (issue #197) — but asking about her own text again is
        // exactly where it helps most, so the offer stays. Not after a long text's feedback:
        // there is nothing to explain again, the server answers 409 (#258).
        item.kind === 'long'),
    // Only a question from a photo or from Buddy; never homework, never during a test.
    flaggable:
      open &&
      session.status === 'active' &&
      session.mode !== 'help' &&
      !testing &&
      (item.origin === 'material' || item.origin === 'buddy'),
  };
}
