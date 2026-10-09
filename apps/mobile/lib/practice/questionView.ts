// What the practice screen shows about the question on screen, read off the session the server
// sent: her tries and Buddy's replies, the "Anders erklären" exchanges, what is on its way, the
// answers already tried, and where she is in the run. Pure: the screen asks, this decides. Moved
// out of `app/practice/[id].tsx` (issue #311).

import type {
  PracticeTurnView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';

/** What is on its way to the server: an answer, or her question (`asked`). */
export type Pending = { itemId: string; text: string; asked?: true };

export type QuestionView = {
  open: boolean;
  /** Her tries and Buddy's replies; "Anders erklären" exchanges stand after the solution. */
  turns: PracticeTurnView[];
  /** The conversation as shown (`ItemThread`). */
  threadTurns: PracticeTurnView[];
  /** The "Anders erklären" exchanges (`Reexplain`). */
  turnsAgain: PracticeTurnView[];
  /** Her answer or question on its way, for this question. */
  pendingText: string | null;
  /** Once there is a conversation the Diktat card is one row (DictationCard `compact`). */
  dictationCompact: boolean;
  /** Once there is a conversation (or the solution), its newest part stays in view. */
  followEnd: boolean;
  /** The options she already tried and got wrong (a tried tile says so itself, #288). */
  tried: Set<string>;
  /**
   * Where she is — the server's word, never the app's guess: while it says more questions are
   * coming, the total is not the number it will be (issue #220).
   */
  progress: { position: number; total: number; closed: number; preparing: boolean };
};

export function questionView(
  session: SessionView,
  shown: SessionItemView,
  pending: Pending | null,
): QuestionView {
  const { item } = shown;
  const open = shown.status === 'open';
  const itemTurns = session.turns.filter((turn) => turn.item_id === item.id);
  const turns = itemTurns.filter((turn) => turn.reexplain === null);
  // A Diktat shows only her latest try and what followed it (issue #242): each try replaces the
  // last, and three tries with three replies, the word and the follow-ups do not fit under the
  // card on 360×740 — an older bubble would sit half cut under its edge (review of #286).
  const lastTry = turns.map((turn) => turn.role).lastIndexOf('learner');
  const threadTurns =
    item.kind === 'spelling_dictation' && lastTry > 0 ? turns.slice(lastTry) : turns;
  const pendingText = pending?.itemId === item.id ? pending.text : null;
  return {
    open,
    turns,
    threadTurns,
    turnsAgain: itemTurns.filter((turn) => turn.reexplain !== null),
    pendingText,
    dictationCompact: itemTurns.length > 0 || pendingText !== null,
    followEnd: itemTurns.length > 0 || pendingText !== null || !open,
    tried: new Set(
      turns
        .filter((turn) => turn.role === 'learner' && turn.verdict === 'incorrect')
        .map((turn) => turn.text),
    ),
    progress: {
      position: session.items.indexOf(shown) + 1,
      total: session.items.length,
      closed: session.items.filter((i) => i.status !== 'open').length,
      preparing: session.preparing,
    },
  };
}
