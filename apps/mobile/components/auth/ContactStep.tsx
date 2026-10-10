// The setup's one question about notifications (issue #518, owner 09.10.: "Die Benachrichtigung
// sollte bereits beim setup abgefragt werden"). It used to be an unticked box in the small print
// between the consent and the PIN, where nearly nobody noticed it — and leaving it empty and
// saying no were the same thing, so the chat asked again later and, under 16, the parents had to
// come back with their PIN. Now it is a question of its own with two answers, and either answer
// is the button that saves the profile: for a child under 16 in the same request as the adults'
// consent and PIN (rule 6), from 16 hers. A "no" is final (owner 10.10.): the chat never asks
// again, only the settings change it.

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { GUTTER, SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { SetupStep } from './SetupStep.js';

export type ContactAnswer = 'yes' | 'no';

export function ContactStep({
  name,
  forChild,
  answering,
  onAnswer,
  onBack,
}: {
  /** Whose phone it is: the child's name when the adults answer for her. */
  name: string;
  /** The adults answer (a child's profile): the sentence speaks to them. */
  forChild: boolean;
  /** The answer being saved right now (its button spins), or null. */
  answering: ContactAnswer | null;
  onAnswer: (answer: ContactAnswer) => void;
  onBack: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('auth');
  const answer = (value: ContactAnswer, label: string) => (
    <Btn
      size="lg"
      pill
      full
      variant={value === 'yes' ? 'primary' : 'outline'}
      busy={answering === value}
      disabled={answering !== null}
      onPress={() => onAnswer(value)}
    >
      {label}
    </Btn>
  );
  return (
    <SetupStep
      title={
        forChild ? t('profile.contact_title_child', { name }) : t('profile.contact_title_self')
      }
      top={
        <View style={{ paddingHorizontal: GUTTER, paddingTop: SPACE.sm }}>
          <CircleBtn icon="back" onPress={onBack} accessibilityLabel={t('profile.back')} />
        </View>
      }
      footer={
        <>
          {answer('yes', t('profile.contact_yes'))}
          {answer('no', t('profile.contact_no'))}
        </>
      }
    >
      <Text style={[TYPE.body, { color: palette.ink2, textAlign: 'center' }]}>
        {forChild ? t('profile.contact_body_child') : t('profile.contact_body_self')}
      </Text>
    </SetupStep>
  );
}
