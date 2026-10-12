// Account actions shared by the protected Settings area and the factual Profile footer.
// Policy stays here: parents gate, one task, actual confirmations, unsent work and APIs.
import type { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { adminToken, clearAdminToken } from '../../lib/admin.js';
import { requestAdmin, takeForgotPin } from '../../lib/adminFlow.js';
import { cancelDeletion, postAnswer, requestDeletion } from '../../lib/api/endpoints.js';
import { flushOutbox } from '../../lib/api/outboxSync.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { signOutHere } from '../../lib/leave.js';
import { hasUnsentWork } from '../../lib/localWork.js';
import { openParents } from '../../lib/parentsGate.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { useMounted } from '../../lib/useMounted.js';
import { Btn } from '../lb/Btn.js';
import { Sheet } from '../lb/Sheet.js';
import { toast } from '../lb/Toast.js';
import {
  AdultCancelled,
  afterModalCloses,
  asAdultIfNeeded,
  confirmAdultFirst,
  toastAdultFailure,
} from './adultGate.js';

type Task = 'export' | 'delete' | 'cancel' | 'signout' | 'parents';
type TaskContext = { current: () => boolean; cacheCurrent: () => boolean; guard: () => void };
type Props = {
  account: NonNullable<MeResponse['account']>;
  learner: LearnerView;
  active: boolean;
  pinActive: boolean;
  parentsAuthorized?: boolean;
};
export function useAccountActions({
  account,
  learner,
  active,
  pinActive,
  parentsAuthorized = false,
}: Props) {
  const mounted = useMounted();
  const { t } = useTranslation(['settings', 'common']);
  const { palette } = useTheme();
  const [busy, setBusy] = useState<Task | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [unsent, setUnsent] = useState(false);
  const inFlight = useRef(false);
  const prompting = useRef(false);
  const permission = useRef<string | null>(null);
  const priorOwner = useRef(`${account.id}:${learner.id}`);
  const view = useRef({ owner: `${account.id}:${learner.id}`, active, pinActive, epoch: 0 });
  const owner = `${account.id}:${learner.id}`;
  if (
    view.current.owner !== owner ||
    ((view.current.active !== active || view.current.pinActive !== pinActive) &&
      !(prompting.current && (active || pinActive)))
  ) {
    view.current = { owner, active, pinActive, epoch: view.current.epoch + 1 };
  } else view.current = { ...view.current, active, pinActive };
  useEffect(() => {
    const replaced = priorOwner.current !== owner;
    priorOwner.current = owner;
    if (replaced || (!active && !(pinActive && prompting.current))) {
      setDeleteOpen(false);
      setSignOutOpen(false);
      setUnsent(false);
      if (permission.current !== null && adminToken() === permission.current) clearAdminToken();
      permission.current = null;
    }
  }, [active, pinActive, owner]);

  function context(): TaskContext {
    const epoch = view.current.epoch;
    const query = queryClient.getQueryCache().find({ queryKey: keys.me, exact: true });
    const cacheCurrent = () => {
      const data = queryClient.getQueryData<MeResponse>(keys.me);
      return (
        query !== undefined &&
        queryClient.getQueryCache().find({ queryKey: keys.me, exact: true }) === query &&
        data?.account?.id === account.id &&
        data.learner?.id === learner.id
      );
    };
    const current = () =>
      mounted.current &&
      view.current.owner === owner &&
      view.current.epoch === epoch &&
      view.current.active &&
      cacheCurrent();
    return {
      current,
      cacheCurrent,
      guard: () => {
        if (
          !mounted.current ||
          !cacheCurrent() ||
          view.current.owner !== owner ||
          view.current.epoch !== epoch ||
          !(view.current.active || (view.current.pinActive && prompting.current))
        )
          throw new AdultCancelled('cancelled');
      },
    };
  }
  async function run<T>(
    task: Task,
    work: (ctx: TaskContext) => Promise<T>,
  ): Promise<T | undefined> {
    if (inFlight.current || !active) return;
    const ctx = context();
    if (!ctx.cacheCurrent()) return;
    inFlight.current = true;
    setBusy(task);
    try {
      return await work(ctx);
    } catch (err) {
      if (ctx.current()) toastAdultFailure(err, t('settings:pin_first'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  async function withPin<T>(work: () => Promise<T>): Promise<T> {
    prompting.current = true;
    try {
      return await work();
    } finally {
      prompting.current = false;
    }
  }
  function cacheDue(due: string | null) {
    queryClient.setQueryData<MeResponse>(keys.me, (old) =>
      old?.account?.id === account.id && old.learner?.id === learner.id
        ? { ...old, account: { ...old.account, deletion_due_at: due } }
        : old,
    );
  }
  const askDeletion = () =>
    run('delete', async (ctx) => {
      await withPin(() => confirmAdultFirst(learner.is_minor, account.pin_set, 'delete'));
      ctx.guard();
      permission.current = adminToken();
      setDeleteOpen(true);
    });
  const closeDeletion = () => {
    setDeleteOpen(false);
    if (permission.current !== null && adminToken() === permission.current) clearAdminToken();
    permission.current = null;
  };
  const scheduleDeletion = () => {
    setDeleteOpen(false);
    return run('delete', async (ctx) => {
      await afterModalCloses();
      ctx.guard();
      const res = await withPin(() =>
        asAdultIfNeeded(
          () => {
            ctx.guard();
            return requestDeletion();
          },
          { pinSet: account.pin_set, purpose: 'delete' },
        ),
      );
      if (!ctx.cacheCurrent()) return;
      cacheDue(res.deletion_due_at);
      if (ctx.current()) toast.show(t('settings:adult.delete.scheduled_toast'));
      void queryClient.invalidateQueries({ queryKey: keys.me });
    });
  };
  const cancelScheduledDeletion = () =>
    run('cancel', async (ctx) => {
      const res = await withPin(() =>
        asAdultIfNeeded(
          () => {
            ctx.guard();
            return cancelDeletion();
          },
          { pinSet: account.pin_set, purpose: 'cancel_deletion' },
        ),
      );
      if (!ctx.cacheCurrent()) return;
      cacheDue(res.deletion_due_at);
      if (ctx.current()) toast.show(t('settings:adult.delete.cancelled'));
      void queryClient.invalidateQueries({ queryKey: keys.me });
    });
  async function approveParents(ctx: TaskContext) {
    const allowed = await withPin(async () => {
      const result = await openParents(
        { minor: learner.is_minor, pinSet: account.pin_set },
        {
          request: () => requestAdmin('parents'),
          takeForgot: takeForgotPin,
          clear: clearAdminToken,
        },
      );
      if (learner.is_minor && account.pin_set && result !== null) await afterModalCloses();
      return result;
    });
    ctx.guard();
    return ctx.cacheCurrent() ? allowed : null;
  }
  const authorizeParents = () => run('parents', approveParents);
  const askSignOut = () =>
    run('signout', async (ctx) => {
      if (!parentsAuthorized && (await approveParents(ctx)) !== 'all') return;
      ctx.guard();
      setUnsent(false);
      setSignOutOpen(true);
      await flushOutbox(postAnswer, () => undefined).catch(() => 0);
      if (!ctx.current()) return;
      const remaining = await hasUnsentWork().catch(() => false);
      if (ctx.current()) setUnsent(remaining);
    });
  const signOutNow = () => {
    setSignOutOpen(false);
    return run('signout', async (ctx) => {
      await afterModalCloses();
      ctx.guard();
      await signOutHere();
    });
  };
  const confirmations = (
    <>
      <Sheet
        visible={active && deleteOpen}
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
        visible={active && signOutOpen}
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
        <Btn
          pill
          full
          variant={unsent ? 'danger' : 'primary'}
          disabled={busy !== null}
          onPress={() => void signOutNow()}
        >
          {t(
            unsent
              ? 'settings:adult.signout.confirm_cta_unsent'
              : 'settings:adult.signout.confirm_cta',
          )}
        </Btn>
      </Sheet>
    </>
  );
  return {
    busy,
    run,
    withPin,
    authorizeParents,
    askDeletion,
    cancelScheduledDeletion,
    askSignOut,
    confirmations,
  };
}
