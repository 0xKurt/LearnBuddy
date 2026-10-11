// One practice flow: QuestionCard is the screen's; this shell places its answer directly
// beneath it, then existing tutor feedback, free room, help chips and pinned Composer.
// Forms own drafts/payloads, not the spacer or bar. Folding keeps the board mounted and
// preserves its draft; keys fold with it into Composer. Source ownership and real phone
// geometry both enforce the order (owner mobile redesign 11.10.).
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';

import { answerFolds, formDensity } from '../../lib/keyboard.js';
import { SPACE } from '../../lib/theme/space.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { AskRoute, CheckBar, type CheckAction } from './CheckBar.js';
import { FreeSpace } from './FreeSpace.js';

type Props = {
  /** The form: what she taps, places or types in (none: a closed question, a spoken one). */
  answer?: ReactNode;
  /**
   * What of the answer stays while she types in the bar under it and the answer folds (null:
   * nothing, it folds whole) — the Fehlerdetektiv's line she corrects (#387).
   */
  whileTyping?: ReactNode;
  /** Keys for what she is typing, while she types (null: none). */
  keys?: ReactNode;
  /** "Prüfen": when the answer may go and how. */
  action: CheckAction;
  /**
   * What the answer slot keeps when the room runs out. 0: it may give all of it (a board scrolls
   * inside itself). A number: at least that (the note line: its tightest staff with both key
   * rows, `STAFF_ANSWER_MIN`). 'whole': nothing — options she taps and the fraction bar she
   * shades never shrink; the conversation above gives way instead (`threadRoom`).
   */
  keeps?: number | 'whole';
};

/** Pure layout slots supplied by the existing practice screen adapters. */
export const AnswerFlow = createContext<{ thread: ReactNode; tools: ReactNode }>({
  thread: null,
  tools: null,
});

export function AnswerShell({
  answer = null,
  whileTyping = null,
  keys = null,
  action,
  keeps = 0,
}: Props) {
  const seen = useVisibleHeight();
  const ask = useContext(AskRoute);
  const flow = useContext(AnswerFlow);
  const typedUnderBoard = answer !== null && 'input' in action && action.input !== undefined;
  const typing = typedUnderBoard && action.typing === true;
  // Typed fields may have no answer board. While she edits in the tight keyboard room,
  // the optional hint row folds; the full source, keys and Check retain their minimum sizes.
  const toolsFolded =
    'input' in action &&
    action.input !== undefined &&
    action.typing === true &&
    formDensity(seen.window, seen.overlap) === 'tight';
  const { onFocused } = ask;
  useEffect(() => {
    if (!typedUnderBoard) return;
    onFocused(typing);
    return () => onFocused(false);
  }, [typedUnderBoard, typing, onFocused]);
  const folded =
    answerFolds(ask.focused, seen.window, seen.overlap) ||
    (typing && formDensity(seen.window, seen.overlap) !== 'roomy');
  // She types under the board (her own focus, reported as the route's): what of it stays.
  const kept = folded && typing ? whileTyping : null;
  return (
    <>
      {answer === null ? null : (
        <View
          testID="answer-slot"
          style={{
            // It gives way when the room runs out (the conversation's reply, the keyboard); the
            // form inside scrolls then, "Prüfen" stays.
            display: folded && kept === null ? 'none' : 'flex',
            flexGrow: 0,
            flexShrink: keeps === 'whole' ? 0 : 1,
            minHeight: keeps === 'whole' ? undefined : keeps,
            paddingHorizontal: SPACE.lg,
            paddingTop: SPACE.md,
          }}
        >
          {kept ?? answer}
        </View>
      )}
      {flow.thread}
      <FreeSpace />
      {flow.tools ? (
        <View
          testID="answer-help"
          style={{
            display: toolsFolded ? 'none' : 'flex',
            paddingHorizontal: SPACE.lg,
            paddingTop: SPACE.sm,
          }}
        >
          {flow.tools}
        </View>
      ) : null}
      <CheckBar {...action} keys={folded ? null : keys} />
    </>
  );
}
