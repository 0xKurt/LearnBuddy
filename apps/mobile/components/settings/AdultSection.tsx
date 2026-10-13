// The parents' group in the settings ("Für Eltern" for a minor's profile, "Dein Konto" for an
// adult learner), as the design's rows (ui_kits/app/Settings.jsx:45–49). The rows only name what
// is behind the gate — no state, no date, nothing of the account: the parents' area itself
// (their e-mail, sign-out, export, deletion, the PIN, the profile correction) opens for a
// minor's profile only with the parents' PIN (docs/privacy.md §PIN gate, lib/parentsGate.ts).
// A tap on any of them asks for the PIN and then opens the parents' page
// (app/settings/parents.tsx), where each step acts — and asks again.
// "Benachrichtigungen erlauben" is the one step taken here: the PIN first, then the opt-in
// (`useContact`); it is there for a minor while contact is off.

import type { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useRouteFocused } from '../../lib/useRouteFocused.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { parentsOwner, useParentsArea } from './parentsArea.js';
import { useAccountActions } from './useAccountActions.js';

type Props = {
  account: NonNullable<MeResponse['account']>;
  learner: LearnerView;
  /** Allowing Buddy's messages (`useContact`); left out while they are allowed. */
  allowContact?: { busy: boolean; onPress: () => void };
};

export function AdultSection({ account, learner, allowContact }: Props) {
  const { t } = useTranslation('settings');
  const active = useRouteFocused();
  const pathname = usePathname();
  const { busy, authorizeParents } = useAccountActions({
    account,
    learner,
    active,
    pinActive: pathname === '/pin',
  });
  const minor = learner.is_minor;

  /** The parents' gate first; the page then shows what it approved. A stale approval is ignored. */
  async function openParentsPage() {
    const approved = await authorizeParents();
    if (!approved) return;
    useParentsArea.getState().open(approved, parentsOwner(account.id, learner.id));
    router.push('/settings/parents');
  }
  const toParents = { disabled: busy !== null, onPress: () => void openParentsPage() };

  return (
    <ListGroup label={minor ? t('adult.title_minor') : t('adult.title_self')}>
      {minor && allowContact ? (
        <Row
          title={t('adult.allow_contact')}
          // Without a PIN yet the tap could only say so afterwards: the row says it first.
          sub={
            account.pin_set
              ? t('adult.needs_pin')
              : `${t('adult.needs_pin')} ${t('contact.no_pin_hint')}`
          }
          disabled={allowContact.busy}
          onPress={allowContact.onPress}
        />
      ) : null}
      <Row title={t('adult.export.title')} {...toParents} />
      <Row title={t('adult.delete.title')} destructive {...toParents} />
      <Row title={t(minor ? 'adult.manage_minor' : 'adult.manage_self')} {...toParents} />
    </ListGroup>
  );
}
