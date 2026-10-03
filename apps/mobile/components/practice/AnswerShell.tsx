// The place an answer is given in (issue #310): fixed slots, top to bottom, for every form —
//
//   [answer]     the form itself: a board, a table, a text with gaps, the typed field (with the
//                fraction bar it writes from), the note line. Right under the question and its
//                Tipp row, never anywhere else.
//   [keys]       optional: a row of keys for what she is typing (the math keys), directly under
//                the answer — a keyboard accessory, not furniture (issue #16).
//   [free room]  what nobody needs collects here, under the answer (`FreeSpace`, issue #286).
//   [action]     "Prüfen" (`CheckBar`), pinned at the bottom, the same for every form.
//
// A form fills the slots and decides nothing about where they stand, how far apart they are or
// how its action looks: before this every form brought its own bar and its own spacer, and which
// side of the free room it ended up on depended on where it stood in the screen (#309). The
// keyboard is handled once, by the screen's `KeyboardSafe` (CLAUDE.md rule 15); this column only
// gives way inside it: the answer slot may shrink, and a board then scrolls inside itself
// (`PartsArea`) rather than push "Prüfen" away.
//
// Guarded (issue #310 §3.4): `lib/__tests__/answerShell.test.ts` fails when a
// form imports the bar or the spacer itself; the walkthrough (`tests/web/fit.ts`) measures at
// every stop that the answer stands right under what is above it and "Prüfen" lowest.

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { CheckBar, type CheckAction } from './CheckBar.js';
import { FreeSpace } from './FreeSpace.js';

type Props = {
  /** The form: what she taps, places or types in. */
  answer: ReactNode;
  /** Keys for what she is typing, while she types (null: none). */
  keys?: ReactNode;
  /** "Prüfen": when the answer may go and how. */
  action: CheckAction;
  /**
   * What the answer slot keeps when the room runs out. 0: it may give all of it (a board scrolls
   * inside itself). A number: at least that (the note line: its tightest staff with both key
   * rows, `STAFF_ANSWER_MIN`). 'whole': nothing — the typed field never shrinks, it is what she
   * types into; the conversation above gives way instead (`threadRoom`).
   */
  keeps?: number | 'whole';
};

export function AnswerShell({ answer, keys = null, action, keeps = 0 }: Props) {
  return (
    <>
      <View
        testID="answer-slot"
        style={{
          // It gives way when the room runs out (the conversation's reply, the keyboard); the
          // form inside scrolls then, "Prüfen" stays.
          flexGrow: 0,
          flexShrink: keeps === 'whole' ? 0 : 1,
          minHeight: keeps === 'whole' ? undefined : keeps,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.sm,
        }}
      >
        {answer}
      </View>
      {keys ? (
        <View testID="answer-keys" style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm }}>
          {keys}
        </View>
      ) : null}
      <FreeSpace />
      <CheckBar {...action} />
    </>
  );
}
