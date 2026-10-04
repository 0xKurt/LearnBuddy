// The right end of a question's progress row: the one quiet action on the question — "Frage
// passt nicht" for a question from a photo or from Buddy, else "Das stimmt doch" for a judgement
// she may disagree with (issue #164). Only one of the two ever stands there; the flag wins.
// "Frage vorlesen" is not here: it lives in the question card's meta row (`ReadQuestionButton`,
// issue #310), so this row keeps its room for the progress bar and a test's clock (#334.2).

import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import { DisputeVerdictButton } from './DisputeVerdict.js';

type Props = {
  flaggable: boolean;
  canDispute: boolean;
  disabled: boolean;
  onFlag: () => void;
  onDispute: () => void;
};

export function QuestionCorner({ flaggable, canDispute, disabled, onFlag, onDispute }: Props) {
  const { t } = useTranslation('practice');
  if (flaggable) {
    return (
      <Btn
        size="sm"
        variant="ghost"
        pill
        disabled={disabled}
        onPress={onFlag}
        accessibilityHint={t('flag.hint')}
      >
        {t('flag.button')}
      </Btn>
    );
  }
  return canDispute ? <DisputeVerdictButton disabled={disabled} onPress={onDispute} /> : null;
}
