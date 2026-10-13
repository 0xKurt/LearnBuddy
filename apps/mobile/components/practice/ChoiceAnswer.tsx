// A single selection is a durable draft, separate from the bar's question text.
import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { useDraft } from '../../lib/drafts.js';
import { AnswerShell } from './AnswerShell.js';
import { ChoiceList } from './ChoiceList.js';

type Props = {
  draftKey: string;
  choices: string[];
  figures?: readonly Figure[] | null;
  tried: ReadonlySet<string>;
  disabled: boolean;
  onCheck: (index: number, choice: string) => void;
  canTalk?: boolean;
  spoken?: {
    prompt: string;
    lang: string | null;
    disabled: boolean;
    onText: (text: string) => void;
    onReadAgain?: () => void;
  };
};

export function ChoiceAnswer({
  draftKey,
  choices,
  figures,
  tried,
  disabled,
  onCheck,
  spoken,
  canTalk = false,
}: Props) {
  const { t } = useTranslation('practice');
  const draft = useDraft(`${draftKey}.choice`);
  const index = /^\d+$/.test(draft.text) ? Number(draft.text) : -1;
  const choice = choices[index];
  const selected = choice !== undefined && !tried.has(choice) ? index : null;
  return (
    <AnswerShell
      keeps="whole"
      answer={
        <ChoiceList
          choices={choices}
          figures={figures}
          tried={tried}
          selected={selected}
          disabled={disabled}
          onChoose={(next) => {
            // A second tap on her choice takes it back: nothing is ready then, and the Composer's
            // one primary slot is the conversation's again (#599).
            if (!disabled) draft.setText(next === selected ? '' : String(next));
          }}
        />
      }
      action={{
        spoken,
        canTalk,
        ready: selected !== null,
        disabled,
        waitsHint: t('select.check_waits'),
        onPress: () => {
          if (disabled || selected === null || choice === undefined) return;
          onCheck(selected, choice);
        },
      }}
    />
  );
}
