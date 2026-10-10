// "In which line does it stop?" (Informatik, issue #262): the program's lines ARE the board — the
// same numbered tiles as every option she picks (`ChoiceList`), in monospace with the indentation
// kept, one under the other. A tap answers with the line's number; the thread says "Zeile 3". The
// program stands here INSTEAD of in the question card (`answerForm.figureInAnswer`): one program,
// the one she works on. The server judges the line against the run, without a model
// (apps/api/src/modules/practice/codeCheck.ts).

import { lineMark, type CodeFigure } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { AnswerShell } from './AnswerShell.js';
import { ChoiceList } from './ChoiceList.js';
import { PartsArea } from './PartsArea.js';

/** A wrong line stays on the board: Buddy says why, and she may look at it again. */
const NONE_TRIED: ReadonlySet<string> = new Set();

type Props = {
  figure: CodeFigure;
  disabled: boolean;
  /** Her answer: the line's number as the server takes it, and the line in words for the thread. */
  onAnswer: (line: string, shown: string) => void;
};

export function CodeLineAnswer({ figure, disabled, onAnswer }: Props) {
  const { t } = useTranslation('practice');
  return (
    <AnswerShell
      answer={
        <PartsArea>
          <ChoiceList
            code
            choices={[...figure.lines]}
            tried={NONE_TRIED}
            marks={figure.lines.map((_, i) => ({
              mark: lineMark(i),
              label: t('code.line', { n: i + 1 }),
            }))}
            disabled={disabled}
            onChoose={(index) => onAnswer(String(index + 1), t('code.line', { n: index + 1 }))}
          />
        </PartsArea>
      }
      action={{ tap: true, canTalk: false }}
    />
  );
}
