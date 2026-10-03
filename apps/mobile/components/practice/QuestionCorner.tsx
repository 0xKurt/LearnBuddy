// The right end of a question's progress row: "Vorlesen" (issue #238) and the one quiet action
// on the question — "Frage passt nicht" for a question from a photo or from Buddy, else "Das
// stimmt doch" for a judgement she may disagree with (issue #164). Only one of the two ever
// stands there; the flag wins, as before.
//
// The speaker sits here and not in the card because this row is 44 pt tall anyway: it costs no
// height, while inside the card it took a line from the prompt and pushed a structured
// question's parts off a 360×740 phone (rule 16). Its own component so the practice screen
// stays within its size (docs/engineering-guards.md, rule 4).

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SpokenPart } from '../../lib/speech/listen.js';
import { SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { DisputeVerdictButton } from './DisputeVerdict.js';
import { ReadQuestionButton } from './ReadQuestionButton.js';

type Props = {
  itemId: string;
  /** What "Vorlesen" says (already spoken: math in words), or null when it is not offered. */
  read: SpokenPart | null;
  flaggable: boolean;
  canDispute: boolean;
  disabled: boolean;
  onFlag: () => void;
  onDispute: () => void;
};

export function QuestionCorner({
  itemId,
  read,
  flaggable,
  canDispute,
  disabled,
  onFlag,
  onDispute,
}: Props) {
  const { t } = useTranslation('practice');
  const action = flaggable ? (
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
  ) : canDispute ? (
    <DisputeVerdictButton disabled={disabled} onPress={onDispute} />
  ) : null;
  if (!read) return action;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      {/* Keyed by the question: a new question never inherits a reading that is still running —
          the old button goes away and stops it. */}
      <ReadQuestionButton key={`read-${itemId}`} text={read.text} lang={read.lang} />
      {action}
    </View>
  );
}
