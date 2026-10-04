// The place in the practice card where a structured item is answered (issues #228–#230).
// One component per `task_view.type`; this switch is the only thing the screen knows about
// them. A new kind (#229 match, #230 table_fill, #232 cloze, #240 select_all) adds its component and one
// `case` here — the screen (`app/practice/[id].tsx`), the outbox and the answer flow stay as
// they are, because every kind answers with the same `parts`.
//
// Each surface brings its own "Prüfen" in the pinned bar (it knows when its answer is
// complete) and sends `parts` plus a short text of the answer for the conversation while
// the server judges it — and, where she could type OR tap, which one it was (issue #163).

import type {
  StructuredAnswer as Parts,
  StructuredTaskView,
} from '@learnbuddy/shared-types/contracts';

import { MatchAnswer } from './MatchAnswer.js';
import { ClozeAnswer } from './ClozeAnswer.js';
import { OrderAnswer } from './OrderAnswer.js';
import { SelectAllAnswer } from './SelectAllAnswer.js';
import { TableAnswer } from './TableAnswer.js';

type Props = {
  view: StructuredTaskView;
  /** Where the surface keeps her unsent arrangement (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** Her answer as it goes to the server (`via` only where she could type OR tap), and its text. */
  onSubmit: (answer: { parts: Parts; via?: 'typed' | 'tapped' }, shown: string) => void;
};

export function StructuredAnswer({ view, draftKey, disabled, onSubmit: send }: Props) {
  const onSubmit = (parts: Parts, shown: string, via?: 'typed' | 'tapped') =>
    send(via ? { parts, via } : { parts }, shown);
  // What every form takes besides its own view.
  const own = { draftKey, disabled, onSubmit };
  switch (view.type) {
    case 'order':
      return <OrderAnswer view={view} {...own} />;
    case 'table_fill':
      return <TableAnswer view={view} {...own} />;
    case 'match':
      return <MatchAnswer view={view} {...own} />;
    case 'cloze':
      return <ClozeAnswer view={view} {...own} />;
    case 'select_all':
      return <SelectAllAnswer view={view} {...own} />;
  }
}
