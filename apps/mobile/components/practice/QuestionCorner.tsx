// The right end of a question's progress row: the one quiet action on the question — "Frage
// passt nicht" for a question from a photo or from Buddy, else "Einspruch gegen die Bewertung"
// for a judgement she may disagree with (issue #164). Only one of the two ever stands there; the
// flag wins. Nothing else stands here, so this row keeps its room for the progress bar and a
// test's clock (#334.2). Hearing the question is the header's speaker (Vorlesen, issue #386).
//
// One short word on screen, the whole action for a screen reader (issue #459): at 360 the full
// sentence "Bewertung stimmt nicht" pushed "Frage 2 von 5" onto two lines and the bar down to a
// stub. The word is part of the name (WCAG 2.5.3), so saying what she sees reaches the button.

import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';

type Props = {
  flaggable: boolean;
  canDispute: boolean;
  disabled: boolean;
  onFlag: () => void;
  onDispute: () => void;
};

export function QuestionCorner({ flaggable, canDispute, disabled, onFlag, onDispute }: Props) {
  const { t } = useTranslation('practice');
  const action = flaggable ? 'flag' : canDispute ? 'dispute' : null;
  if (action === null) return null;
  return (
    <Btn
      size="sm"
      variant="ghost"
      pill
      disabled={disabled}
      onPress={action === 'flag' ? onFlag : onDispute}
      accessibilityLabel={t(`${action}.label`)}
      accessibilityHint={t(`${action}.hint`)}
    >
      {t(`${action}.button`)}
    </Btn>
  );
}
