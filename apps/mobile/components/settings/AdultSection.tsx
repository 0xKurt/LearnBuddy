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
import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View, type TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { adminToken, clearAdminToken } from '../../lib/admin.js';
import { requestAdmin, takeForgotPin } from '../../lib/adminFlow.js';
import { openParents, type ParentsView } from '../../lib/parentsGate.js';
import {
  cancelDeletion,
  exportAccount,
  postAnswer,
  requestDeletion,
} from '../../lib/api/endpoints.js';
import { flushOutbox } from '../../lib/api/outboxSync.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { currentSession } from '../../lib/auth/session.js';
import { deliverExport } from '../../lib/exportFile.js';
import { signOutHere } from '../../lib/leave.js';
import { hasUnsentWork } from '../../lib/localWork.js';
import { messageFor } from '../../lib/errors.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatDate, formatTime } from '../../lib/time.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Sheet } from '../lb/Sheet.js';
import { toast } from '../lb/Toast.js';
import { AccountAccessCard } from './AccountAccessCard.js';
import { AdultCancelled, afterModalCloses, asAdultIfNeeded, confirmAdult } from './adultGate.js';
import { Group } from './Group.js';
import { PinCard } from './PinCard.js';
import { ProfileFixCard } from './ProfileFixCard.js';
import { Row } from './Row.js';

type Task = 'export' | 'delete' | 'cancel' | 'signout';

/** The file export (M-11): what the parents get told afterwards. */
const EXPORT_DONE = {
  shared: 'settings:adult.export.shared',
  saved: 'settings:adult.export.saved',
} as const;

type Props = {
  account: NonNullable<MeResponse['account']>;
  learner: LearnerView;
  onInputFocus: (input: TextInput | null) => void;
};

function setDeletionDue(due: string | null): void {
  queryClient.setQueryData<MeResponse>(keys.me, (old) =>
    old?.account ? { ...old, account: { ...old.account, deletion_due_at: due } } : old,
  );
}

export function AdultSection({ account, learner, onInputFocus }: Props) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<ParentsView | null>(null);
  const [opening, setOpening] = useState(false);
  // The phone may go back to the child: the area closes with the app (like the PIN).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') setOpen(null);
    });
    return () => sub.remove();
  }, []);
  const { t, i18n } = useTranslation(['settings', 'common']);
  const [busy, setBusy] = useState<Task | null>(null);
  const inFlight = useRef(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  // Unsent answers or photos on this device: signing out would delete them, so the sheet says so.
  const [unsent, setUnsent] = useState(false);

  const minor = learner.is_minor;
  const email = currentSession()?.email ?? '';
  const due = account.deletion_due_at;
  const lang = i18n.language;
  const pinSet = account.pin_set;

  /** One account task at a time (a ref, so a double tap cannot start two). */
  async function run(task: Task, work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(task);
    try {
      await work();
    } catch (err) {
      if (err instanceof AdultCancelled) {
        if (err.reason === 'no_pin') toast.show(t('settings:pin_first'));
      } else {
        toast.show(messageFor(err), 'error');
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const exportData = () =>
    run('export', async () => {
      const shown = { pin: false };
      const data = await asAdultIfNeeded(() => exportAccount(), {
        pinSet,
        purpose: 'export',
        onPrompt: () => {
          shown.pin = true;
        },
      });
      // The PIN screen has to be gone before the share sheet or folder picker can open.
      if (shown.pin) await afterModalCloses();
      try {
        const result = await deliverExport(
          JSON.stringify(data, null, 2),
          t('settings:adult.export.share_title'),
        );
        if (result !== 'cancelled') toast.show(t(EXPORT_DONE[result]));
      } catch {
        toast.show(t('settings:adult.export.share_failed'), 'error');
      }
    });

  /** For a minor the PIN comes first, then the confirmation (from the adult). */
  const askDeletion = () =>
    run('delete', async () => {
      if (minor) {
        const prompted = adminToken() === null;
        await confirmAdult(pinSet, 'delete');
        if (prompted) await afterModalCloses();
      }
      setDeleteOpen(true);
    });

  const closeDeletion = () => {
    setDeleteOpen(false);
    clearAdminToken();
  };

  const scheduleDeletion = () => {
    setDeleteOpen(false);
    return run('delete', async () => {
      // The sheet has to be gone before the parents' PIN screen could open (token lapsed).
      await afterModalCloses();
      const res = await asAdultIfNeeded(() => requestDeletion(), { pinSet, purpose: 'delete' });
      setDeletionDue(res.deletion_due_at);
      toast.show(t('settings:adult.delete.scheduled_toast'));
      void queryClient.invalidateQueries({ queryKey: keys.me });
    });
  };

  const cancelScheduledDeletion = () =>
    run('cancel', async () => {
      const res = await asAdultIfNeeded(() => cancelDeletion(), {
        pinSet,
        purpose: 'cancel_deletion',
      });
      setDeletionDue(res.deletion_due_at);
      toast.show(t('settings:adult.delete.cancelled'));
      void queryClient.invalidateQueries({ queryKey: keys.me });
    });

  /** Opening asks for the parents' PIN on a minor's profile (lib/parentsGate.ts). */
  async function toggle() {
    if (open) {
      setOpen(null);
      return;
    }
    setOpening(true);
    try {
      setOpen(
        await openParents(
          { minor, pinSet },
          {
            request: () => requestAdmin('parents'),
            takeForgot: takeForgotPin,
            clear: clearAdminToken,
          },
        ),
      );
    } finally {
      setOpening(false);
    }
  }

  const askSignOut = () => {
    setUnsent(false);
    setSignOutOpen(true);
    // Send what can be sent first; whatever is still left is named in the sheet.
    void flushOutbox(postAnswer, () => undefined)
      .catch(() => 0)
      .then(() => hasUnsentWork())
      .then(setUnsent)
      .catch(() => undefined);
  };

  const signOutNow = () => {
    setSignOutOpen(false);
    return run('signout', async () => {
      await afterModalCloses();
      // On purpose: push released, nothing of hers left for the next person (lib/leave.ts).
      await signOutHere();
    });
  };

  return (
    <View
      style={{
        backgroundColor: palette.rose,
        borderRadius: 28,
        padding: 16,
      }}
    >
      <Group
        title={minor ? t('settings:adult.title_minor') : t('settings:adult.title_self')}
        intro={minor ? t('settings:adult.intro_minor') : t('settings:adult.intro_self')}
        icon="shield"
      >
        {/* Closed by default: the learner's settings stay short; parents open it when needed. */}
        <Btn pill variant="outline" disabled={opening} onPress={() => void toggle()}>
          {open ? t('settings:adult.close') : t('settings:adult.open')}
        </Btn>
        {open === 'pin_only' ? (
          <>
            <Text style={[TYPE.body, { color: palette.ink2, paddingHorizontal: 4 }]}>
              {t('settings:adult.forgot_intro')}
            </Text>
            <PinCard pinSet={account.pin_set} email={email} onInputFocus={onInputFocus} />
          </>
        ) : null}
        {open === 'all' ? (
          <>
            {minor ? (
              <PinCard pinSet={account.pin_set} email={email} onInputFocus={onInputFocus} />
            ) : null}

            <ProfileFixCard learner={learner} pinSet={pinSet} enabled={busy === null} />

            <AccountAccessCard
              minor={minor}
              pinSet={account.pin_set}
              email={email}
              enabled={busy === null}
            />

            <Card padding={18}>
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

            <Card padding={18}>
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

            <Card padding={18}>
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

      <Sheet
        visible={deleteOpen}
        title={t('settings:adult.delete.confirm_title')}
        closeLabel={t('common:actions.cancel')}
        onClose={closeDeletion}
      >
        <Text style={TYPE.body}>{t('settings:adult.delete.confirm_body')}</Text>
        <Btn
          pill
          variant="danger"
          full
          disabled={busy !== null}
          onPress={() => void scheduleDeletion()}
        >
          {t('settings:adult.delete.confirm_cta')}
        </Btn>
      </Sheet>

      <Sheet
        visible={signOutOpen}
        title={t('settings:adult.signout.confirm_title')}
        closeLabel={t('common:actions.cancel')}
        onClose={() => setSignOutOpen(false)}
      >
        <Text style={TYPE.body}>{t('settings:adult.signout.confirm_body')}</Text>
        {unsent ? (
          <Text style={[TYPE.body, { color: palette.ink2 }]}>
            {t('settings:adult.signout.confirm_unsent')}
          </Text>
        ) : null}
        <Btn pill full variant={unsent ? 'danger' : 'primary'} onPress={() => void signOutNow()}>
          {unsent
            ? t('settings:adult.signout.confirm_cta_unsent')
            : t('settings:adult.signout.confirm_cta')}
        </Btn>
      </Sheet>
    </View>
  );
}
