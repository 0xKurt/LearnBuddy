// The area a structured answer is arranged in (issues #228–#230): it takes the room left between
// the question and the pinned "Prüfen", and no more.
//
// The question card never shrinks and 44 pt per touch target is the floor, so when an allowed
// task is taller than the room — twelve elements still above four groups on a 360×740 phone, an
// order of eight long steps — something has to give. The conversation above gives its room first
// (`flexBasis: 0` in app/practice/[id].tsx); after that this area scrolls inside itself, as
// `scroll-list`, the one category `tests/web/fit.ts` allows: what scrolls here is a list she goes
// through. Without it the parts were drawn over the question (measured on 360×740, #229).
//
// `BottomBar` with "Prüfen" stays outside, pinned — it is never scrolled away.

import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';

export function PartsArea({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      testID="scroll-list"
      style={{ flexGrow: 0, flexShrink: 1 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm }}
    >
      {children}
    </ScrollView>
  );
}
