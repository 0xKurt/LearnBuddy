// Fehlerdetektiv (issue #260): a worked solution, line by line, with one wrong line in it. She taps
// the line where it goes wrong — the same tiles as every option she picks (`ChoiceList`), one under
// the other, numbered — and writes it right in the app's one input bar below, where every typed
// answer is written (`TypedAnswer`, issue #365), with the math keys. Tapping a line copies it into
// the bar, so she corrects it rather than retyping it. "Prüfen" waits until a line is picked.
//
// The server judges both, without a model (apps/api/src/modules/practice/findError.ts): the line
// against the key, her correction against the line before by equivalence. The task stands on top,
// numbered like the lines but not a tile: it is not one to pick. Which line she picked and what she
// wrote stay in the draft (`lib/drafts.ts`) — a theme switch or a restart takes nothing away.

import {
  findErrorText,
  lineMark,
  type FindErrorTaskView,
  type StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { useDraft } from '../../lib/drafts.js';
import { ChoiceList } from './ChoiceList.js';
import { PartsArea } from './PartsArea.js';
import { TypedAnswer } from './TypedAnswer.js';

/** Nothing is "tried" here: a wrong line stays on the board for her to pick again. */
const NONE_TRIED: ReadonlySet<string> = new Set();

/** A line as math: the server sends plain lines ("3x + 6 = 21"), set like any formula. */
const asMath = (text: string) => `$${text}$`;

type Props = {
  view: FindErrorTaskView;
  /** Where her line and her correction are kept (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": a line picked and written; `shown` is "② 3x + 6 = 21", for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function FindErrorAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { t } = useTranslation('practice');
  const { text: fix, setText: setFix } = useDraft(draftKey);
  const { text: kept, setText: keep } = useDraft(`${draftKey}.line`);
  const [task, ...lines] = view.lines;
  const picked = lines.findIndex((l) => l.id === kept);
  const line = picked >= 0 ? lines[picked]! : null;

  const pick = (index: number) => {
    const next = lines[index];
    if (!next || disabled) return;
    // Her correction starts from the line she picked — unless she has already written something
    // of her own (not just another line copied in).
    const copied = fix.trim() === '' || lines.some((l) => l.text === fix);
    keep(next.id);
    if (copied) setFix(next.text);
  };

  return (
    <TypedAnswer
      kind="find_error"
      unit={null}
      lang={null}
      value={fix}
      disabled={disabled}
      onChange={setFix}
      onCheck={(value) => {
        const written = value.trim();
        if (!line || written === '') return;
        onSubmit(
          { type: 'find_error', line: line.id, fix: written },
          findErrorText(view, line.id, written),
        );
      }}
      board={{
        node: (
          <PartsArea>
            <ChoiceList
              choices={lines.map((l) => asMath(l.text))}
              tried={NONE_TRIED}
              picked={picked >= 0 ? picked : null}
              marks={lines.map((_, i) => ({
                mark: lineMark(i + 1),
                label: t('find_error.line', { n: i + 2 }),
              }))}
              lead={
                task
                  ? { mark: lineMark(0), text: asMath(task.text), label: t('find_error.task') }
                  : null
              }
              disabled={disabled}
              onChoose={pick}
            />
          </PartsArea>
        ),
        waits: line ? null : t('find_error.waits'),
        placeholder: line ? t('find_error.fix') : t('find_error.waits'),
      }}
    />
  );
}
