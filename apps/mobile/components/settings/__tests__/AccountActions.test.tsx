// requires live verification in Claude Code session — PIN, storage/outbox and account APIs
// are real controller edges held here; no database or invented authorization state is used.
import { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as admin from '../../../lib/admin.js';
import * as adminFlow from '../../../lib/adminFlow.js';
import * as endpoints from '../../../lib/api/endpoints.js';
import * as outbox from '../../../lib/api/outboxSync.js';
import * as localWork from '../../../lib/localWork.js';
import * as leave from '../../../lib/leave.js';
import * as gates from '../adultGate.js';
import { queryClient, keys } from '../../../lib/api/queries.js';
import { renderInApp } from '../../../testing/render.js';
import { useAccountActions } from '../useAccountActions.js';
import { useRouteFocused } from '../../../lib/useRouteFocused.js';
const learner = LearnerView.parse({
  id: '11111111-1111-4111-8111-111111111111',
  relation: 'child',
  display_name: 'Mia',
  birth_date: '2013-01-01',
  is_minor: true,
  level: 'school',
  grade: 6,
  locale: 'de',
  curriculum_region: 'he',
  version: 2,
  own_consent_due: false,
});
const account = {
  id: '44444444-4444-4444-8444-444444444444',
  locale: 'de' as const,
  pin_set: true,
  deletion_due_at: null,
  deletion_running: false,
  consent_current: true,
};
function Harness({
  active,
  pinActive = false,
  person = learner,
  authorized = false,
}: {
  active?: boolean;
  pinActive?: boolean;
  person?: LearnerView;
  authorized?: boolean;
}) {
  const routeFocused = useRouteFocused();
  const a = useAccountActions({
    account,
    learner: person,
    active: active ?? routeFocused,
    pinActive,
    parentsAuthorized: authorized,
  });
  return (
    <>
      <button onClick={() => void a.askSignOut()}>Ask signout</button>
      <button onClick={() => void a.askDeletion()}>Ask delete</button>
      <button onClick={() => void a.cancelScheduledDeletion()}>Ask cancel deletion</button>
      {a.confirmations}
    </>
  );
}
beforeEach(() => {
  vi.spyOn(gates, 'afterModalCloses').mockResolvedValue(undefined);
  vi.spyOn(outbox, 'flushOutbox').mockResolvedValue({ sent: 0, refused: 0 });
  vi.spyOn(localWork, 'hasUnsentWork').mockResolvedValue(false);
  queryClient.setQueryData(
    keys.me,
    MeResponse.parse({
      account,
      learner,
      consent_version: 'v1',
      capabilities: { model: true, push: false },
    }),
  );
});
afterEach(() => {
  queryClient.clear();
  admin.clearAdminToken();
  vi.restoreAllMocks();
});
it('requires the real parents gate before a minor signout confirmation and preserves a valid PIN excursion', async () => {
  let done!: (ok: boolean) => void;
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const view = renderInApp(<Harness />);
  fireEvent.click(screen.getByText('Ask signout'));
  expect(request).toHaveBeenCalledWith('parents');
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(<Harness active={false} pinActive />);
  view.rerender(<Harness />);
  await act(async () => done(true));
  await waitFor(() => expect(screen.getByText('Wirklich abmelden?')).toBeTruthy());
});
it('keeps cancelled PIN approval from opening signout or changing the account', async () => {
  vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  const signout = vi.spyOn(leave, 'signOutHere').mockResolvedValue(undefined);
  renderInApp(<Harness />);
  await act(async () => fireEvent.click(screen.getByText('Ask signout')));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(signout).not.toHaveBeenCalled();
});
it.each(['leave-return', 'owner'] as const)(
  'does not open a stale signout confirmation after %s during PIN',
  async (change) => {
    let done!: (ok: boolean) => void;
    vi.spyOn(adminFlow, 'requestAdmin').mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const view = renderInApp(<Harness />);
    fireEvent.click(screen.getByText('Ask signout'));
    if (change === 'owner')
      view.rerender(
        <Harness person={{ ...learner, id: '33333333-3333-4333-8333-333333333333' }} />,
      );
    else {
      view.rerender(<Harness active={false} />);
      view.rerender(<Harness />);
    }
    await act(async () => done(true));
    expect(screen.queryByText('Wirklich abmelden?')).toBeNull();
  },
);
it('fences late unsent-work results after leaving and returning before a new confirmation', async () => {
  let finish!: (left: boolean) => void;
  vi.mocked(localWork.hasUnsentWork).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderInApp(<Harness authorized />);
  fireEvent.click(screen.getByText('Ask signout'));
  await waitFor(() => expect(localWork.hasUnsentWork).toHaveBeenCalledTimes(1));
  view.rerender(<Harness authorized active={false} />);
  view.rerender(<Harness authorized />);
  await act(async () => finish(true));
  expect(screen.queryByRole('dialog')).toBeNull();
  await act(async () => fireEvent.click(screen.getByText('Ask signout')));
  await waitFor(() => expect(screen.getByText('Wirklich abmelden?')).toBeTruthy());
  expect(screen.queryByText(/Hier liegen noch Antworten/)).toBeNull();
});
it('preserves actual unsent-work warning and calls the existing signout only after explicit confirmation', async () => {
  vi.mocked(localWork.hasUnsentWork).mockResolvedValue(true);
  const signout = vi.spyOn(leave, 'signOutHere').mockResolvedValue(undefined);
  renderInApp(<Harness authorized />);
  fireEvent.click(screen.getByText('Ask signout'));
  await waitFor(() => expect(screen.getByText('Trotzdem abmelden')).toBeTruthy());
  expect(signout).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Trotzdem abmelden' })));
  expect(signout).toHaveBeenCalledTimes(1);
});
it('keeps one deletion approval in flight and opens its actual confirmation after success', async () => {
  let done!: () => void;
  const confirm = vi.spyOn(gates, 'confirmAdultFirst').mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const request = vi.spyOn(endpoints, 'requestDeletion');
  renderInApp(<Harness />);
  fireEvent.click(screen.getByText('Ask delete'));
  fireEvent.click(screen.getByText('Ask delete'));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(confirm).toHaveBeenCalledWith(true, true, 'delete');
  await act(async () => done());
  expect(screen.getByText('Konto wirklich löschen?')).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
});
it.each(['leave-return', 'owner', 'unmount'] as const)(
  'does not reopen deletion after held approval and %s',
  async (change) => {
    let done!: () => void;
    vi.spyOn(gates, 'confirmAdultFirst').mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const view = renderInApp(<Harness />);
    fireEvent.click(screen.getByText('Ask delete'));
    if (change === 'unmount') view.unmount();
    else if (change === 'owner')
      view.rerender(
        <Harness person={{ ...learner, id: '33333333-3333-4333-8333-333333333333' }} />,
      );
    else {
      view.rerender(<Harness active={false} />);
      view.rerender(<Harness />);
    }
    await act(async () => done());
    expect(screen.queryByText('Konto wirklich löschen?')).toBeNull();
  },
);
it('does not send deletion when the page loses focus during the closing-confirmation handoff', async () => {
  let finish!: () => void;
  const wait = vi.spyOn(gates, 'afterModalCloses').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.spyOn(gates, 'confirmAdultFirst').mockResolvedValue(undefined);
  const request = vi.spyOn(endpoints, 'requestDeletion');
  const view = renderInApp(<Harness />);
  await act(async () => fireEvent.click(screen.getByText('Ask delete')));
  fireEvent.click(screen.getByRole('button', { name: 'Ja, in 7 Tagen löschen' }));
  expect(wait).toHaveBeenCalled();
  view.rerender(<Harness active={false} />);
  await act(async () => finish());
  expect(request).not.toHaveBeenCalled();
});

it('does not let an inactive mounted observer clear the foreground actors fresh PIN token', async () => {
  let finish!: () => void;
  vi.spyOn(gates, 'confirmAdultFirst').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  function Both({ pin = false }: { pin?: boolean }) {
    const foreground = useAccountActions({ account, learner, active: !pin, pinActive: pin });
    useAccountActions({ account, learner, active: false, pinActive: pin });
    return (
      <>
        <button onClick={() => void foreground.askDeletion()}>Ask foreground delete</button>
        {foreground.confirmations}
      </>
    );
  }
  const view = renderInApp(<Both />);
  fireEvent.click(screen.getByText('Ask foreground delete'));
  view.rerender(<Both pin />);
  admin.setAdminToken('owned-test-token', new Date(Date.now() + 60_000).toISOString());
  view.rerender(<Both />);
  expect(admin.adminToken()).toBe('owned-test-token');
  await act(async () => finish());
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
  expect(admin.adminToken()).toBeNull();
});

it('keeps a confirmed same-account deletion cache result after ordinary leave without hidden feedback', async () => {
  vi.spyOn(gates, 'confirmAdultFirst').mockResolvedValue(undefined);
  let finish!: (next: { deletion_due_at: string | null }) => void;
  const request = vi.spyOn(endpoints, 'requestDeletion').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderInApp(<Harness />);
  await act(async () => fireEvent.click(screen.getByText('Ask delete')));
  fireEvent.click(screen.getByRole('button', { name: 'Ja, in 7 Tagen löschen' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  view.rerender(<Harness active={false} />);
  const due = '2026-11-01T12:00:00.000Z';
  await act(async () => finish({ deletion_due_at: due }));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.account?.deletion_due_at).toBe(due);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('closes an already visible confirmation when its account/learner is replaced', async () => {
  vi.spyOn(gates, 'confirmAdultFirst').mockResolvedValue(undefined);
  const view = renderInApp(<Harness />);
  await act(async () => fireEvent.click(screen.getByText('Ask delete')));
  expect(screen.getByText('Konto wirklich löschen?')).toBeTruthy();
  view.rerender(<Harness person={{ ...learner, id: '33333333-3333-4333-8333-333333333333' }} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});
it.each(['clear', 'replace', 'recreate'] as const)(
  'does not write an old deletion result into a %s settings owner cache',
  async (kind) => {
    vi.spyOn(gates, 'confirmAdultFirst').mockResolvedValue(undefined);
    let finish!: (next: { deletion_due_at: string | null }) => void;
    const request = vi.spyOn(endpoints, 'requestDeletion').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderInApp(<Harness />);
    await act(async () => fireEvent.click(screen.getByText('Ask delete')));
    fireEvent.click(screen.getByRole('button', { name: 'Ja, in 7 Tagen löschen' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    if (kind === 'clear') queryClient.clear();
    else if (kind === 'recreate') {
      const saved = queryClient.getQueryData<MeResponse>(keys.me);
      queryClient.clear();
      queryClient.setQueryData(keys.me, saved);
    } else
      queryClient.setQueryData(
        keys.me,
        MeResponse.parse({
          account: { ...account, id: '55555555-5555-4555-8555-555555555555' },
          learner,
          consent_version: 'v1',
          capabilities: { model: true, push: false },
        }),
      );
    await act(async () => finish({ deletion_due_at: '2026-11-01T12:00:00.000Z' }));
    if (kind === 'clear') expect(queryClient.getQueryData(keys.me)).toBeUndefined();
    else expect(queryClient.getQueryData<MeResponse>(keys.me)?.account?.deletion_due_at).toBeNull();
  },
);

it('keeps confirmed same-account cancellation after leave without hidden feedback', async () => {
  admin.setAdminToken('owned-test-token', new Date(Date.now() + 60_000).toISOString());
  const current = queryClient.getQueryData<MeResponse>(keys.me)!;
  queryClient.setQueryData(keys.me, {
    ...current,
    account: { ...current.account!, deletion_due_at: '2026-11-01T12:00:00.000Z' },
  });
  let finish!: (next: { deletion_due_at: string | null }) => void;
  const request = vi.spyOn(endpoints, 'cancelDeletion').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderInApp(<Harness />);
  fireEvent.click(screen.getByText('Ask cancel deletion'));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  view.rerender(<Harness active={false} />);
  await act(async () => finish({ deletion_due_at: null }));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.account?.deletion_due_at).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('does not authorize deletion into a recreated same-ID query after the closing handoff', async () => {
  let finish!: () => void;
  vi.spyOn(gates, 'afterModalCloses').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.spyOn(gates, 'confirmAdultFirst').mockResolvedValue(undefined);
  const request = vi
    .spyOn(endpoints, 'requestDeletion')
    .mockResolvedValue({ deletion_due_at: null });
  renderInApp(<Harness />);
  await act(async () => fireEvent.click(screen.getByText('Ask delete')));
  fireEvent.click(screen.getByRole('button', { name: 'Ja, in 7 Tagen löschen' }));
  const saved = queryClient.getQueryData<MeResponse>(keys.me);
  queryClient.clear();
  queryClient.setQueryData(keys.me, saved);
  await act(async () => finish());
  expect(request).not.toHaveBeenCalled();
});
