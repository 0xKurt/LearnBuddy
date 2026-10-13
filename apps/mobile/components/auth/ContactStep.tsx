// The setup's one question about notifications (issue #518, owner 09.10.: "Die Benachrichtigung
// sollte bereits beim setup abgefragt werden"). It used to be an unticked box in the small print
// between the consent and the PIN, where nearly nobody noticed it — and leaving it empty and
// saying no were the same thing, so the chat asked again later and, under 16, the parents had to
// come back with their PIN. Now it is a question of its own with two answers, and either answer
// is the button that saves the profile: for a child under 16 in the same request as the adults'
// consent and PIN (rule 6), from 16 hers. A "no" is final (owner 10.10.): the chat never asks
// again, only the settings change it.
//
// The design draws this as a tick box on the parents' page (ui_kits/app/Onboarding.jsx:71). It
// stays a page of its own (#599): an empty box and a "no" are the same there, which is the very
// thing #518 took out, and with a "no" that is final an overlooked box would decide for good.
// Nothing is chosen in advance here either — no answer exists until an adult taps one.
// How it looks follows the design's page: "yes" is the one main action, "no" and the way back are
// the quiet ones below it, like the privacy page's "Nicht einverstanden" (Onboarding.jsx:44–48).

import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
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
  const saving = answering !== null;
  return (
    <SetupStep
      step="profile"
      lead={forChild ? t('profile.contact_body_child') : t('profile.contact_body_self')}
      title={
        forChild ? t('profile.contact_title_child', { name }) : t('profile.contact_title_self')
      }
      footer={
        <>
          <Btn
            size="lg"
            pill
            full
            busy={answering === 'yes'}
            disabled={saving}
            onPress={() => onAnswer('yes')}
          >
            {t('profile.contact_yes')}
          </Btn>
          <Btn
            variant="ghost"
            pill
            full
            busy={answering === 'no'}
            disabled={saving}
            onPress={() => onAnswer('no')}
          >
            {t('profile.contact_no')}
          </Btn>
          <Btn variant="ghost" size="sm" pill full disabled={saving} onPress={onBack}>
            {t('profile.back')}
          </Btn>
        </>
      }
    >
      {null}
    </SetupStep>
  );
}
