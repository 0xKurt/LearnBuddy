// The floor under a structured answer (issues #228–#230): the parts scroll inside themselves
// rather than be drawn over the question, if they ever had to.
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
// Where it stands, the room around it and "Prüfen" are the answer shell's (`AnswerShell`,
// issue #310): this is only the floor.

import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

export function PartsArea({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      testID="scroll-parts"
      style={{ flexGrow: 0, flexShrink: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
