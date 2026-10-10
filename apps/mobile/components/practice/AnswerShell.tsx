// The place an answer is given in (issues #310, #386): fixed slots, top to bottom, for every form —
// one rule, the answer at the bottom, like the chat's input bar:
//
//   [free room]  what nobody needs collects here, between the question and its conversation above
//                and the answer below (`FreeSpace`, issue #286) — never under the answer.
//   [answer]     the form itself: options she taps, a board, a table, a text with gaps, the
//                fraction bar, the note line. At the bottom, directly above its action.
//   [keys]       optional: a row of keys for what she is typing in a board (the math keys of a
//                table's cell), directly under the answer — a keyboard accessory (issue #16).
//   [action]     "Prüfen" (`CheckBar`), pinned at the bottom, the same for every form — with a
//                typed answer's input bar right above it (`InputBar`, issue #365) — or, where
//                there is nothing to check, what stands in its place: options answered by a tap
//                (the bar holds her question, the tile being the action), the conversation row
//                in a conversation (issue #386), "Weiter" once the question is closed, the
//                pronunciation recorder.
//
// Before #386 a board, a table and tap options stood right under the question with the free room
// below them (#310 option B, 03.10.), while typed text sat at the bottom (#365): two rules in one
// shell, and on a tall phone the answer floated in the middle of the screen (owner 04.10.). Now no
// form decides its place, how far apart the slots are or how its action looks. The keyboard is
// handled once, by the screen's `KeyboardSafe` (CLAUDE.md rule 15); this column only gives way
// inside it: the free room goes first, then the answer slot may shrink, and a board then scrolls
// inside itself (`PartsArea`) rather than push "Prüfen" away.
//
// Guarded (issues #310 §3.4, #386): `lib/__tests__/answerShell.test.ts` fails when a form imports
// the bar or the spacer itself, or when the shell puts the spacer under the answer; the
// walkthrough (`tests/web/fit.ts`, `answerPlace`) measures at every stop that the answer stands
// directly above its action or the bottom edge, the free room above it, and "Prüfen" lowest.

import { useContext, useEffect, type ReactNode } from 'react';
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

// No answer has a gap of its own above it: when the free room is used up it meets the Tipp row,
// whose touch height already sets them apart. Tiles were the first (8 pt more cost the second
// row of picture options its place on 360×740, issue #288); since the bar's field (#402, +6 pt
// on a board) every form is, and an order with Buddy's reply on 360×740 keeps its last step.

// While she types her question with the keyboard up the answer folds away whole, the way the
// drawing folds (`answerFolds`, issue #402): a row cut at the slot's edge read as broken (rule
// 17). Not drawn, still mounted — back unchanged when the keyboard goes. The question card above
// stays; a typed answer or a board's own field is not her question.
// A board above a typed answer's bar (the Fehlerdetektiv's lines, issue #260) folds the same way
// while she types in that bar: she has picked her line, the bar holds it, and with the keyboard up
// on a small phone the lines would push the bar under the keyboard. Reported through the same
// route, so the screen's room (`screenRoom`, `boardGives`) knows the board holds nothing then.
// On a phone that is not roomy (360×740) the lines fold while she types there even without the
// keyboard (a hidden keyboard on Android keeps the focus, and so does the browser): since #522 the
// bar holds her text, the math keys and its tools as three rows, and the most a card holds no
// longer fits above them — the lines stood cut in their slot. What she types about stays
// (`whileTyping`): with every line folded she wrote her correction without the line she was
// correcting (#387). It stands in the slot instead of the board, which comes back when she stops.
export function AnswerShell({
  answer = null,
  whileTyping = null,
  keys = null,
  action,
  keeps = 0,
}: Props) {
  const seen = useVisibleHeight();
  const ask = useContext(AskRoute);
  const typedUnderBoard = answer !== null && 'input' in action && action.input !== undefined;
  const typing = typedUnderBoard && action.typing === true;
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
      <FreeSpace />
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
          }}
        >
          {kept ?? answer}
        </View>
      )}
      {keys ? (
        // The board's keys fold with it (issue #419): two rows of note keys stayed while the staff
        // was folded away, and on 360×440 they pushed her question's field half out of the window.
        <View
          testID="answer-keys"
          style={{
            display: folded ? 'none' : 'flex',
            paddingHorizontal: SPACE.lg,
            paddingTop: SPACE.sm,
          }}
        >
          {keys}
        </View>
      ) : null}
      <CheckBar {...action} />
    </>
  );
}
