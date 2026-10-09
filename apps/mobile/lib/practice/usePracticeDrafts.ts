// What she is writing on the practice screen, kept on the device (`useDraft`): her answer (a
// half-typed answer survives Android killing the app) and her question to the tutor (issue #402,
// kept the same way). With them the last answer sent: until the server confirms it, retrying the
// same answer reuses its id (`usePracticeActions`). Moved out of `app/practice/[id].tsx` (#311).

import { useRef } from 'react';
import { Keyboard } from 'react-native';

import { useDraft } from '../drafts.js';

/** The last answer sent; until the server confirms it, retrying the same answer reuses its id. */
type SentAnswer = {
  clientTurnId: string;
  itemId: string;
  text: string | null;
  choice: number | null;
  /**
   * A structured answer (issue #228), as JSON: an arrangement has no text of its own, its parts
   * are what makes it the same answer or a different one. Without this a re-arranged order
   * would reuse the first id and the server would file it as the same turn.
   */
  parts: string | null;
};

export function usePracticeDrafts(id: string) {
  const { text, setText } = useDraft(`session.${id}`);
  const question = useDraft(`session.${id}.ask`);
  const lastSent = useRef<SentAnswer | null>(null);
  return {
    text,
    setText,
    question,
    lastSent,
    /** After a step that leaves the question: no half answer, no retry id, no keyboard. */
    clearAnswer(): void {
      setText('');
      lastSent.current = null;
      Keyboard.dismiss();
    },
    /** On to the next question: both fields empty, no retry id. */
    clearAll(): void {
      setText('');
      question.setText('');
      lastSent.current = null;
    },
  };
}

export type PracticeDrafts = ReturnType<typeof usePracticeDrafts>;
