// What every structured form takes from `StructuredAnswer.tsx` besides its own view (issue #311):
// one shape for all of them, because the switch there hands each the same three things.

import type { StructuredAnswer } from '@learnbuddy/shared-types/contracts';

export type FormProps<View> = {
  view: View;
  /**
   * Where her unsent answer is kept (`lib/drafts.ts`), per question: it survives a theme change,
   * which remounts the tree (ThemeProvider), and Android killing the app — like a typed answer.
   */
  draftKey: string;
  disabled: boolean;
  /**
   * "Prüfen": her answer as parts, and in words for the thread — plus, where she could type OR
   * tap (a cloze, issue #163), which one it was.
   */
  onSubmit: (parts: StructuredAnswer, shown: string, via?: 'typed' | 'tapped') => void;
};
