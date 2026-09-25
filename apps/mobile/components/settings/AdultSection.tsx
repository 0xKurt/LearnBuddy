// The parents' area ("Für Eltern" for a minor's profile, "Dein Konto" for an
// adult learner), set apart from the learner's own settings: the parents'
// PIN, the sign-in's e-mail and password, data export, account deletion and
// sign-out (docs/privacy.md §Export and deletion). For a minor, export and deletion need the parents: the API
// answers admin_required, the PIN screen opens and the call is retried once.
// Deletion is scheduled with a 7-day hold; the date shown is the API's.

import type { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { Share, Text, View, type TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { clearAdminToken } from '../../lib/admin.js';
import { cancelDeletion, exportAccount, requestDeletion } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { currentSession } from '../../lib/auth/session.js';
import { signOut } from '../../lib/auth/supabase.js';
import { messageFor } from '../../lib/errors.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatDate, formatTime } from '../../lib/time.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Sheet } from '../lb/Sheet.js';
import { toast } from '../lb/Toast.js';
import { AccountAccessCard } from './AccountAccessCard.js';
import { AdultCancelled, afterModalCloses, asAdultIfNeeded } from './adultGate.js';
import { Group } from './Group.js';
import { PinCard } from './PinCard.js';
import { Row } from './Row.js';

type Task = 'export' | 'delete' | 'cancel' | 'signout';

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
  const [open, setOpen] = useState(false);
  const { t, i18n } = useTranslation(['settings', 'common']);
  const [busy, setBusy] = useState<Task | null>(null);
  const inFlight = useRef(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const minor = learner.is_minor;
  const email = currentSession()?.email ?? '';
  const due = account.deletion_due_at;
  const lang = i18n.language;
  const gate = { pinSet: account.pin_set };

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
        ...gate,
        onPrompt: () => {
          shown.pin = true;
        },
      });
      // The PIN screen has to be gone before the share sheet can open.
      if (shown.pin) await afterModalCloses();
      try {
        await Share.share({
          title: t('settings:adult.export.share_title'),
          message: JSON.stringify(data, null, 2),
        });
      } catch {
        toast.show(t('settings:adult.export.share_failed'), 'error');
      }
    });

  const scheduleDeletion = () => {
    setDeleteOpen(false);
    return run('delete', async () => {
      // The sheet has to be gone before the parents' PIN screen can open.
      await afterModalCloses();
      const res = await asAdultIfNeeded(() => requestDeletion(), gate);
      setDeletionDue(res.deletion_due_at);
      toast.show(t('settings:adult.delete.scheduled_toast'));
      void queryClient.invalidateQueries({ queryKey: keys.me });
    });
  };

  const cancelScheduledDeletion = () =>
    run('cancel', async () => {
      const res = await asAdultIfNeeded(() => cancelDeletion(), gate);
      setDeletionDue(res.deletion_due_at);
      toast.show(t('settings:adult.delete.cancelled'));
      void queryClient.invalidateQueries({ queryKey: keys.me });
    });

  const signOutNow = () => {
    setSignOutOpen(false);
    return run('signout', async () => {
      await afterModalCloses();
      clearAdminToken();
      // The root layout returns to the start screen once the session is gone.
      await signOut();
    });
  };

  return (
    <View
      style={{
        backgroundColor: LB.rose,
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
        <Btn pill variant="outline" onPress={() => setOpen((v) => !v)}>
          {open ? t('settings:adult.close') : t('settings:adult.open')}
        </Btn>
        {open ? (
          <>
            {minor ? (
              <PinCard pinSet={account.pin_set} email={email} onInputFocus={onInputFocus} />
            ) : null}

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
                  <Text style={[TYPE.body, { color: LB.ink2 }]}>
                    {t('settings:adult.needs_pin')}
                  </Text>
                ) : null}
                <Btn
                  pill
                  variant="outline"
                  onPress={() => void exportData()}
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
                  due
                    ? t('settings:adult.delete.scheduled', {
                        date: formatDate(due, lang),
                        time: formatTime(due, lang),
                      })
                    : undefined
                }
                hint={due ? undefined : t('settings:adult.delete.body')}
              >
                {due ? (
                  <Btn pill onPress={() => void cancelScheduledDeletion()} disabled={busy !== null}>
                    {t('settings:adult.delete.cancel')}
                  </Btn>
                ) : (
                  <Btn
                    pill
                    variant="danger"
                    onPress={() => setDeleteOpen(true)}
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
                <Btn
                  pill
                  variant="outline"
                  onPress={() => setSignOutOpen(true)}
                  disabled={busy !== null}
                >
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
        onClose={() => setDeleteOpen(false)}
      >
        <Text style={TYPE.body}>{t('settings:adult.delete.confirm_body')}</Text>
        {minor ? (
          <Text style={[TYPE.body, { color: LB.ink2 }]}>{t('settings:adult.needs_pin')}</Text>
        ) : null}
        <Btn pill variant="danger" full onPress={() => void scheduleDeletion()}>
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
        <Btn pill full onPress={() => void signOutNow()}>
          {t('settings:adult.signout.confirm_cta')}
        </Btn>
      </Sheet>
    </View>
  );
}
