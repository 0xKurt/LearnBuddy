// The parents' area ("Für Eltern" for a minor's profile, "Dein Konto" for an
// adult learner), set apart from the learner's own settings: the parents'
// PIN, the sign-in's e-mail and password, data export, account deletion and
// sign-out (docs/privacy.md §Export and deletion), and correcting the profile.
// For a minor, export and deletion need the parents: the API answers
// admin_required, the PIN screen opens (naming the step) and the call is
// retried once; for deletion the PIN comes before the confirmation, so the
// one confirming is the adult. The export is handed over as a file
// (lib/exportFile.ts). Deletion is scheduled with a 7-day hold; the date shown
// is the API's.
// For a minor's profile the area itself opens only with the parents' PIN (the
// e-mail and sign-out are theirs; lib/parentsGate.ts), and closes when the app
// goes to the background.

import type { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'expo-router';
import { useRouteFocused } from '../../lib/useRouteFocused.js';
import { useAccountActions } from './useAccountActions.js';

import { type ParentsView } from '../../lib/parentsGate.js';
import { exportAccount } from '../../lib/api/endpoints.js';
import { currentSession } from '../../lib/auth/session.js';
import { deliverExport } from '../../lib/exportFile.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatDate, formatTime } from '../../lib/time.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { toast } from '../lb/Toast.js';
import { AccountAccessCard } from './AccountAccessCard.js';
import { afterModalCloses, asAdultIfNeeded } from './adultGate.js';
import { ListGroup, Row as ListRow } from '../lb/ListGroup.js';
import { Group } from './Group.js';
import { PinCard } from './PinCard.js';
import { ProfileFixCard } from './ProfileFixCard.js';
import { Row } from './Row.js';

/** The file export (M-11): what the parents get told afterwards. */
const EXPORT_DONE = {
  shared: 'settings:adult.export.shared',
  saved: 'settings:adult.export.saved',
} as const;

type Props = {
  account: NonNullable<MeResponse['account']>;
  learner: LearnerView;
};

export function AdultSection({ account, learner }: Props) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<ParentsView | null>(null);
  // The phone may go back to the child: the area closes with the app (like the PIN).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') setOpen(null);
    });
    return () => sub.remove();
  }, []);
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
    askSignOut,
    confirmations,
  } = useAccountActions({
    account,
    learner,
    active,
    pinActive: pathname === '/pin',
    parentsAuthorized: open === 'all',
  });

  const minor = learner.is_minor;
  const email = currentSession()?.email ?? '';
  const due = account.deletion_due_at;
  const lang = i18n.language;
  const pinSet = account.pin_set;

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

  const opening = busy === 'parents';
  /** The same real parents gate is shared with the Profile footer; stale approval is ignored. */
  async function toggle() {
    if (open) {
      setOpen(null);
      return;
    }
    const approved = await authorizeParents();
    if (approved !== undefined) setOpen(approved);
  }

  return (
    <View>
      <Group
        title={minor ? t('settings:adult.title_minor') : t('settings:adult.title_self')}
        intro={minor ? t('settings:adult.intro_minor') : t('settings:adult.intro_self')}
        icon="shield"
      >
        {/* Closed by default: the learner's settings stay short; parents open it when needed. */}
        <ListGroup>
          <ListRow
            title={open ? t('settings:adult.close') : t('settings:adult.open')}
            accessibilityLabel={open ? t('settings:adult.close') : t('settings:adult.open')}
            sub={minor ? t('settings:adult.needs_pin') : undefined}
            icon="shield"
            disabled={opening}
            onPress={() => void toggle()}
          />
        </ListGroup>
        {open === 'pin_only' ? (
          <>
            <Text style={[TYPE.body, { color: palette.ink2, paddingHorizontal: SPACE.xs }]}>
              {t('settings:adult.forgot_intro')}
            </Text>
            <PinCard pinSet={account.pin_set} email={email} />
          </>
        ) : null}
        {open === 'all' ? (
          <>
            {minor ? <PinCard pinSet={account.pin_set} email={email} /> : null}

            <ProfileFixCard learner={learner} pinSet={pinSet} enabled={busy === null} />

            <AccountAccessCard
              minor={minor}
              pinSet={account.pin_set}
              email={email}
              enabled={busy === null}
            />

            <Card>
              <Row
                question={t('settings:adult.export.title')}
                hint={t('settings:adult.export.body')}
              >
                {minor ? (
                  <Text style={[TYPE.body, { color: palette.ink2 }]}>
                    {t('settings:adult.needs_pin')}
                  </Text>
                ) : null}
                <Btn
                  pill
                  variant="outline"
                  onPress={() => void exportData()}
                  busy={busy === 'export'}
                  disabled={busy !== null}
                >
                  {busy === 'export'
                    ? t('settings:adult.export.working')
                    : t('settings:adult.export.cta')}
                </Btn>
              </Row>
            </Card>

            <Card>
              <Row
                question={t('settings:adult.delete.title')}
                answer={
                  account.deletion_running
                    ? t('settings:adult.delete.running')
                    : due
                      ? t('settings:adult.delete.scheduled', {
                          date: formatDate(due, lang),
                          time: formatTime(due, lang),
                        })
                      : undefined
                }
                hint={due ? undefined : t('settings:adult.delete.body')}
              >
                {account.deletion_running ? null : due ? (
                  <Btn pill onPress={() => void cancelScheduledDeletion()} disabled={busy !== null}>
                    {t('settings:adult.delete.cancel')}
                  </Btn>
                ) : (
                  <Btn
                    pill
                    variant="danger"
                    onPress={() => void askDeletion()}
                    disabled={busy !== null}
                  >
                    {t('settings:adult.delete.cta')}
                  </Btn>
                )}
              </Row>
            </Card>

            <Card>
              <Row
                question={t('settings:adult.signout.title')}
                hint={
                  email
                    ? t('settings:adult.signout.body', { email })
                    : t('settings:adult.signout.body_no_email')
                }
              >
                <Btn pill variant="outline" onPress={askSignOut} disabled={busy !== null}>
                  {t('settings:adult.signout.cta')}
                </Btn>
              </Row>
            </Card>
          </>
        ) : null}
      </Group>

      {confirmations}
    </View>
  );
}
