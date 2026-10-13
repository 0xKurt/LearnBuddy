// The parents' area ("Für Eltern" for a minor's profile, "Dein Konto" for an adult learner): the
// parents' PIN, correcting the profile, the sign-in's e-mail and password, data export, account
// deletion and sign-out (docs/privacy.md §PIN gate, §Export and deletion). Reached from the
// settings through the parents' gate (components/settings/AdultSection.tsx).
// For a minor, export and deletion still need the parents in here: the API answers
// admin_required, the PIN screen opens (naming the step) and the call is retried once; for
// deletion the PIN comes before the confirmation, so the one confirming is the adult. The
// export is handed over as a file (lib/exportFile.ts). Deletion is scheduled with a 7-day hold;
// the date shown is the API's. After "PIN vergessen?" only the PIN can be set (`pin_only`),
// with the account's password.

import type { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { exportAccount } from '../../lib/api/endpoints.js';
import { currentSession } from '../../lib/auth/session.js';
import { deliverExport } from '../../lib/exportFile.js';
import type { ParentsView } from '../../lib/parentsGate.js';
import { formatDate, formatTime } from '../../lib/time.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { toast } from '../lb/Toast.js';
import { AccountAccessCard } from './AccountAccessCard.js';
import { afterModalCloses, asAdultIfNeeded } from './adultGate.js';
import { PinCard } from './PinCard.js';
import { ProfileFixCard } from './ProfileFixCard.js';
import { Hint } from './SettingsPage.js';
import { useAccountActions } from './useAccountActions.js';

/** The file export (M-11): what the parents get told afterwards. */
const EXPORT_DONE = {
  shared: 'settings:adult.export.shared',
  saved: 'settings:adult.export.saved',
} as const;

type Props = {
  account: NonNullable<MeResponse['account']>;
  learner: LearnerView;
  view: ParentsView;
  /** The page is in front. */
  active: boolean;
  /** The PIN screen lies over it. */
  pinActive: boolean;
};

export function ParentsPage({ account, learner, view, active, pinActive }: Props) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const minor = learner.is_minor;
  const email = currentSession()?.email ?? '';
  const pinSet = account.pin_set;
  const due = account.deletion_due_at;
  const lang = i18n.language;
  const { busy, run, withPin, askDeletion, cancelScheduledDeletion, askSignOut, confirmations } =
    useAccountActions({
      account,
      learner,
      active,
      pinActive,
      parentsAuthorized: view === 'all',
    });

  const exportData = () =>
    run('export', async (ctx) => {
      const shown = { pin: false };
      const data = await withPin(() =>
        asAdultIfNeeded(
          () => {
            ctx.guard();
            return exportAccount();
          },
          {
            pinSet,
            purpose: 'export',
            onPrompt: () => {
              shown.pin = true;
            },
          },
        ),
      );
      // The PIN screen has to be gone before the share sheet or folder picker can open.
      if (shown.pin) await afterModalCloses();
      ctx.guard();
      try {
        const result = await deliverExport(
          JSON.stringify(data, null, 2),
          t('settings:adult.export.share_title'),
        );
        if (ctx.current() && result !== 'cancelled') toast.show(t(EXPORT_DONE[result]));
      } catch {
        if (ctx.current()) toast.show(t('settings:adult.export.share_failed'), 'error');
      }
    });

  if (view === 'pin_only') {
    return (
      <>
        <Hint>{t('settings:adult.forgot_intro')}</Hint>
        <PinCard pinSet={pinSet} email={email} />
      </>
    );
  }
  return (
    <>
      <Hint>{minor ? t('settings:adult.intro_minor') : t('settings:adult.intro_self')}</Hint>
      {minor ? <PinCard pinSet={pinSet} email={email} /> : null}
      <AccountAccessCard
        minor={minor}
        pinSet={pinSet}
        email={email}
        enabled={busy === null}
        first={<ProfileFixCard learner={learner} pinSet={pinSet} enabled={busy === null} />}
      />
      <ListGroup>
        <Row
          title={t('settings:adult.export.title')}
          sub={
            busy === 'export' ? t('settings:adult.export.working') : t('settings:adult.export.body')
          }
          disabled={busy !== null}
          onPress={() => void exportData()}
        />
        {account.deletion_running ? (
          <Row title={t('settings:adult.delete.title')} sub={t('settings:adult.delete.running')} />
        ) : due ? (
          <Row
            title={t('settings:adult.delete.cancel')}
            sub={t('settings:adult.delete.scheduled', {
              date: formatDate(due, lang),
              time: formatTime(due, lang),
            })}
            disabled={busy !== null}
            onPress={() => void cancelScheduledDeletion()}
          />
        ) : (
          <Row
            title={t('settings:adult.delete.title')}
            sub={t('settings:adult.delete.body')}
            destructive
            disabled={busy !== null}
            onPress={() => void askDeletion()}
          />
        )}
        <Row
          title={t('settings:adult.signout.cta')}
          sub={
            email
              ? t('settings:adult.signout.body', { email })
              : t('settings:adult.signout.body_no_email')
          }
          chevron={false}
          disabled={busy !== null}
          onPress={() => void askSignOut()}
        />
      </ListGroup>
      {confirmations}
    </>
  );
}
