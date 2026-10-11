// "In which line does it stop?" (Informatik, issue #262): the program's lines ARE the board — the
// same numbered tiles as every option she picks (`ChoiceList`), in monospace with the indentation
// kept, one under the other. A tap saves the selected line; Check sends its one-based number
// and the thread says "Zeile 3". The
// program stands here INSTEAD of in the question card (`answerForm.figureInAnswer`): one program,
// the one she works on. The server judges the line against the run, without a model
// (apps/api/src/modules/practice/codeCheck.ts).

import { lineMark, type CodeFigure } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { useDraft } from '../../lib/drafts.js';

import { AnswerShell } from './AnswerShell.js';
import { ChoiceList } from './ChoiceList.js';
import { PartsArea } from './PartsArea.js';

/** A wrong line stays on the board: Buddy says why, and she may look at it again. */
const NONE_TRIED: ReadonlySet<string> = new Set();

type Props = {
  figure: CodeFigure;
  draftKey: string;
  disabled: boolean;
  /** Her answer: the line's number as the server takes it, and the line in words for the thread. */
  onAnswer: (line: string, shown: string) => void;
};

export function CodeLineAnswer({ figure, draftKey, disabled, onAnswer }: Props) {
  const { t } = useTranslation('practice');
  const draft = useDraft(`${draftKey}.codeLine`);
  const picked = /^\d+$/.test(draft.text) ? Number(draft.text) : null;
  const ready = picked !== null && picked >= 0 && picked < figure.lines.length;
  return (
    <AnswerShell
      answer={
        <PartsArea>
          <ChoiceList
            code
            choices={[...figure.lines]}
            tried={NONE_TRIED}
            picked={ready ? picked : null}
            marks={figure.lines.map((_, i) => ({
              mark: lineMark(i),
              label: t('code.line', { n: i + 1 }),
            }))}
            disabled={disabled}
            onChoose={(index) => {
              if (!disabled) draft.setText(String(index));
            }}
          />
        </PartsArea>
      }
      action={{
        ready,
        disabled,
        waitsHint: t('select.check_waits'),
        onPress: () => {
          if (disabled || !ready || picked === null) return;
          onAnswer(String(picked + 1), t('code.line', { n: picked + 1 }));
        },
      }}
    />
  );
}
