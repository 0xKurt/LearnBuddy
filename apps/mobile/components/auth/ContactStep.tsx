// The setup's one question about notifications (issue #518, owner 09.10.: "Die Benachrichtigung
// sollte bereits beim setup abgefragt werden"). It used to be an unticked box in the small print
// between the consent and the PIN, where nearly nobody noticed it — and leaving it empty and
// saying no were the same thing, so the chat asked again later and, under 16, the parents had to
// come back with their PIN. Now it is a question of its own with two answers, and either answer
// is the button that saves the profile: for a child under 16 in the same request as the adults'
// consent and PIN (rule 6), from 16 hers. A "no" is final (owner 10.10.): the chat never asks
// again, only the settings change it.

import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import { IconBtn } from '../lb/IconBtn.js';
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
  const { t } = useTranslation('auth');
  const answer = (value: ContactAnswer, label: string) => (
    <Btn
      size="lg"
      pill
      full
      variant={value === 'yes' ? 'primary' : 'quiet'}
      busy={answering === value}
      disabled={answering !== null}
      onPress={() => onAnswer(value)}
    >
      {label}
    </Btn>
  );
  return (
    <SetupStep
      lead={forChild ? t('profile.contact_body_child') : t('profile.contact_body_self')}
      title={
        forChild ? t('profile.contact_title_child', { name }) : t('profile.contact_title_self')
      }
      top={<IconBtn icon="back" onPress={onBack} accessibilityLabel={t('profile.back')} />}
      footer={
        <>
          {answer('yes', t('profile.contact_yes'))}
          {answer('no', t('profile.contact_no'))}
        </>
      }
    >
      {null}
    </SetupStep>
  );
}
