// A control beside the answer field that must not take the focus away from it (issue #271).
//
// `components/practice/AnswerComposer.tsx` shows the math keys only while the field has focus
// (issue #16: the row may not take room on a small phone before she types). In the browser a
// mouse-down on a key takes the focus out of the field, `onBlur` hides the row — and that happens
// BETWEEN mousedown and mouseup, so the click never completes: nothing is inserted and the key
// she just pressed is gone. Every key of the row was affected, and no web test had ever tapped
// one, which is why it stood like that since #16.
//
// `preventDefault()` on mousedown stops the focus change and the text selection; the click event
// itself still fires, so `onPress` runs as before. On the phone `onMouseDown` is never called —
// there `keyboardShouldPersistTaps="always"` on the row does this job — so the branch is web only.
//
// Cast like the other web-only props in this app (`growsWithText.ts`, `components/lb/EdgeFade.tsx`,
// `components/practice/ChoiceList.tsx`): react-native's prop types know no mouse events.

import { Platform, type PressableProps } from 'react-native';

export const KEEPS_FOCUS: Partial<PressableProps> =
  Platform.OS === 'web'
    ? ({
        onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
      } as unknown as Partial<PressableProps>)
    : {};
