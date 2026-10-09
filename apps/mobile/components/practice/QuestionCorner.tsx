// The right end of a question's progress row: the one quiet action on the question — "Frage
// passt nicht" for a question from a photo or from Buddy, else "Einspruch gegen die Bewertung"
// for a judgement she may disagree with (issue #164). Only one of the two ever stands there; the
// flag wins. Nothing else stands here, so this row keeps its room for the progress bar and a
// test's clock (#334.2). Hearing the question is the header's speaker (Vorlesen, issue #386).
//
// One short word on screen, the whole action for a screen reader (issue #459): at 360 the full
// sentence "Bewertung stimmt nicht" pushed "Frage 2 von 5" onto two lines and the bar down to a
// stub. The word is part of the name (WCAG 2.5.3), so saying what she sees reaches the button.
//
// Its confirm sheet (`CornerSheet`) stands here too: one sheet for both actions, saying in one
// sentence what happens and claiming nothing about who is right (issue #164) — closable by the
// visible button in it (rule 14). The flow behind both is `lib/practice/useCornerConfirm.ts`.

import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { CornerAction } from '../../lib/practice/useCornerConfirm.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Sheet } from '../lb/Sheet.js';

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

/** The sheet that confirms the corner's action: one sentence for what happens, one button. */
export function CornerSheet({
  action,
  visible,
  busy,
  onClose,
  onConfirm,
}: {
  action: CornerAction;
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation(['practice', 'common']);
  return (
    <Sheet
      visible={visible}
      title={t(`practice:${action}.sheet_title`)}
      closeLabel={t('common:actions.cancel')}
      onClose={onClose}
    >
      <Text style={TYPE.body}>{t(`practice:${action}.sheet_body`)}</Text>
      <Btn full busy={busy} onPress={onConfirm}>
        {t(`practice:${action}.confirm`)}
      </Btn>
    </Sheet>
  );
}
