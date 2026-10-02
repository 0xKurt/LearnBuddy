// The area a structured answer is arranged in (issues #228–#230): it takes the room left between
// the question and the pinned "Prüfen", and no more.
//
// The question card never shrinks and 44 pt per touch target is the floor, so when an allowed
// task is taller than the room — twelve elements still above four groups on a 360×740 phone, an
// order of eight long steps — something has to give. The conversation above gives its room first
// (`flexBasis: 0` in app/practice/[id].tsx); after that this area would scroll inside itself
// rather than be drawn over the question (found on 360×740, #229). It must not come to that: the
// contract's maxima are measured so that the largest task fits (`contracts/structured.ts`), and
// `scroll-parts` is NOT a scroll area `tests/web/fit.ts` allows — a walkthrough shot fails the
// moment the parts would have to be scrolled. The scroll is the floor under a mistake, not a
// feature (rule 16).
//
// `BottomBar` with "Prüfen" stays outside, pinned — it is never scrolled away.

import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';

export function PartsArea({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      testID="scroll-parts"
      style={{ flexGrow: 0, flexShrink: 1 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm }}
    >
      {children}
    </ScrollView>
  );
}
