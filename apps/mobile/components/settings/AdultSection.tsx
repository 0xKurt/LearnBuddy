// The parents' group in the settings ("Für Eltern" for a minor's profile, "Dein Konto" for an
// adult learner), as rows (ui_kits/app/Settings.jsx): allowing Buddy's messages, the data
// export, account deletion (docs/privacy.md §Export and deletion) and the way to the parents'
// page with the PIN, the profile correction and the sign-in (app/settings/parents.tsx).
// For a minor every one of them needs the parents: the PIN screen opens (naming the step) and
// the server checks the PIN too; for deletion the PIN comes before the confirmation, so the
// one confirming is the adult. The export is handed over as a file (lib/exportFile.ts).
// Deletion is scheduled with a 7-day hold; the date shown is the API's.
// The parents' page opens only with the parents' PIN (lib/parentsGate.ts) and shows what that
// approved (components/settings/parentsArea.ts).

import type { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { exportAccount } from '../../lib/api/endpoints.js';
import { deliverExport } from '../../lib/exportFile.js';
import { formatDate, formatTime } from '../../lib/time.js';
import { useRouteFocused } from '../../lib/useRouteFocused.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { toast } from '../lb/Toast.js';
import { afterModalCloses, asAdultIfNeeded } from './adultGate.js';
import { useParentsArea } from './parentsArea.js';
import { useAccountActions } from './useAccountActions.js';

/** The file export (M-11): what the parents get told afterwards. */
const EXPORT_DONE = {
  shared: 'settings:adult.export.shared',
  saved: 'settings:adult.export.saved',
} as const;

type Props = {
  account: NonNullable<MeResponse['account']>;
  learner: LearnerView;
  /** Allowing Buddy's messages (`useContact`); left out while they are allowed. */
  allowContact?: { busy: boolean; onPress: () => void };
};

export function AdultSection({ account, learner, allowContact }: Props) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const active = useRouteFocused();
  const pathname = usePathname();
  const {
    busy,
    run,
    withPin,
    authorizeParents,
    askDeletion,
    cancelScheduledDeletion,
    confirmations,
  } = useAccountActions({ account, learner, active, pinActive: pathname === '/pin' });

  // Back on the settings, the parents' page is closed again: the way forward finds nothing.
  useEffect(() => {
    if (active) useParentsArea.getState().close();
  }, [active]);

  const minor = learner.is_minor;
  const due = account.deletion_due_at;
  const lang = i18n.language;
  const pinSet = account.pin_set;
  const needsPin = minor ? t('settings:adult.needs_pin') : undefined;

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

  /** The parents' gate first; the page then shows what it approved. A stale approval is ignored. */
  async function openParentsPage() {
    const approved = await authorizeParents();
    if (!approved) return;
    useParentsArea.getState().open(approved);
    router.push('/settings/parents');
  }

  return (
    <View>
      <ListGroup label={minor ? t('settings:adult.title_minor') : t('settings:adult.title_self')}>
        {minor && allowContact ? (
          <Row
            title={t('settings:adult.allow_contact')}
            sub={needsPin}
            disabled={allowContact.busy}
            onPress={allowContact.onPress}
          />
        ) : null}
        <Row
          title={t('settings:adult.export.title')}
          sub={busy === 'export' ? t('settings:adult.export.working') : undefined}
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
            destructive
            disabled={busy !== null}
            onPress={() => void askDeletion()}
          />
        )}
        <Row
          title={t(minor ? 'settings:adult.manage_minor' : 'settings:adult.manage_self')}
          sub={needsPin}
          disabled={busy !== null}
          onPress={() => void openParentsPage()}
        />
      </ListGroup>

      {confirmations}
    </View>
  );
}
