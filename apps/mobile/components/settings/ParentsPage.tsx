// The parents' page (the row "Anmeldung und PIN" for a minor's profile, "Anmeldung und Profil"
// for an adult learner): the parents' PIN, correcting the profile, and the sign-in's e-mail and
// password (docs/privacy.md §PIN gate, §Export and deletion). Reached from the settings through
// the parents' gate (components/settings/AdultSection.tsx); every step in here still asks for
// the PIN itself, and the server checks it. After "PIN vergessen?" only the PIN can be set
// (`pin_only`), with the account's password.

import type { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { currentSession } from '../../lib/auth/session.js';
import type { ParentsView } from '../../lib/parentsGate.js';
import { AccountAccessCard } from './AccountAccessCard.js';
import { PinCard } from './PinCard.js';
import { ProfileFixCard } from './ProfileFixCard.js';
import { Hint } from './SettingsPage.js';

type Props = {
  account: NonNullable<MeResponse['account']>;
  learner: LearnerView;
  view: ParentsView;
};

export function ParentsPage({ account, learner, view }: Props) {
  const { t } = useTranslation('settings');
  const minor = learner.is_minor;
  const email = currentSession()?.email ?? '';
  if (view === 'pin_only') {
    return (
      <>
        <Hint>{t('adult.forgot_intro')}</Hint>
        <PinCard pinSet={account.pin_set} email={email} />
      </>
    );
  }
  return (
    <>
      {minor ? <PinCard pinSet={account.pin_set} email={email} /> : null}
      <AccountAccessCard
        minor={minor}
        pinSet={account.pin_set}
        email={email}
        enabled
        first={<ProfileFixCard learner={learner} pinSet={account.pin_set} enabled />}
      />
    </>
  );
}
