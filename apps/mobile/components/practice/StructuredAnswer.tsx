// The place in the practice card where a structured item is answered (issues #228–#230).
// One component per `task_view.type`; this switch is the only thing the screen knows about
// them. A new kind (#229 match, #230 table_fill, #240 select_all, #232 cloze) adds its component and one
// `case` here — the screen (`app/practice/[id].tsx`), the outbox and the answer flow stay as
// they are, because every kind answers with the same `parts`.
//
// Each surface brings its own "Prüfen" in the pinned bar (it knows when its answer is
// complete) and sends `parts` plus a short text of the answer for the conversation while
// the server judges it.

import type {
  StructuredAnswer as Parts,
  StructuredTaskView,
} from '@learnbuddy/shared-types/contracts';

import { MatchAnswer } from './MatchAnswer.js';
import { OrderAnswer } from './OrderAnswer.js';
import { SelectAllAnswer } from './SelectAllAnswer.js';
import { TableAnswer } from './TableAnswer.js';

type Props = {
  view: StructuredTaskView;
  /** Where the surface keeps her unsent arrangement (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** She has sent an answer to this question before (Buddy's reply stands above it now). */
  answered: boolean;
  onSubmit: (parts: Parts, shown: string) => void;
};

export function StructuredAnswer({ view, draftKey, disabled, answered, onSubmit }: Props) {
  switch (view.type) {
    case 'order':
      return (
        <OrderAnswer view={view} draftKey={draftKey} disabled={disabled} onSubmit={onSubmit} />
      );
    case 'table_fill':
      return (
        <TableAnswer view={view} draftKey={draftKey} disabled={disabled} onSubmit={onSubmit} />
      );
    case 'match':
      return (
        <MatchAnswer view={view} draftKey={draftKey} disabled={disabled} onSubmit={onSubmit} />
      );
    case 'select_all':
      return (
        <SelectAllAnswer
          view={view}
          draftKey={draftKey}
          disabled={disabled}
          answered={answered}
          onSubmit={onSubmit}
        />
      );
  }
}
