// requires live verification in Claude Code session — navigation, the PIN screen and the
// account APIs are the edges held here; the pages on a phone, with the real API, are
// tests/web/redesign-settings-view.spec.ts, core-loop-settings.spec.ts and tour.spec.ts.
//
// The settings as rows (#589, #599; ui_kits/app/Settings.jsx): a row leads to a page, nothing
// unfolds in place — and the parents' area stays what docs/privacy.md §PIN gate says it is:
// closed until the parents' PIN opened it, for that account and profile, and closed again once
// its page is gone.
import { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { router } from 'expo-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import * as admin from '../../../lib/admin.js';
import * as adminFlow from '../../../lib/adminFlow.js';
import { ApiError } from '../../../lib/api/client.js';
import * as endpoints from '../../../lib/api/endpoints.js';
import { keys, queryClient } from '../../../lib/api/queries.js';
import * as exportFile from '../../../lib/exportFile.js';
import { renderInApp } from '../../../testing/render.js';
import * as gates from '../adultGate.js';
import { AdultSection } from '../AdultSection.js';
import { LicencesPage } from '../LicencesPage.js';
import { LookSection } from '../LookSection.js';
import { parentsOwner, useOpenParentsArea, useParentsArea } from '../parentsArea.js';
import { ParentsPage } from '../ParentsPage.js';

// Two packages stand for the ~170 the app ships: the list's size is the generator's matter
// (lib/__tests__/licences.test.ts), the rows' behaviour is this file's.
vi.mock('../../../lib/licences.js', () => ({
  LICENCES: [
    {
      name: '@babel/runtime',
      version: '7.29.2',
      licence: 'MIT',
      text: 'Permission is hereby granted',
    },
    { name: 'zustand', version: '5.0.2', licence: 'MIT', text: 'The second licence text' },
  ],
}));

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
  deletion_due_at: null as string | null,
  deletion_running: false,
  consent_current: true,
};
type Account = typeof account;
const OWNER = parentsOwner(account.id, learner.id);
const adminRequired = () => new ApiError('admin_required', 'adult needed', 403);

function cache(nextAccount: Account = account, nextLearner: LearnerView = learner) {
  queryClient.setQueryData(
    keys.me,
    MeResponse.parse({
      account: nextAccount,
      learner: nextLearner,
      consent_version: 'v1',
      capabilities: { model: true, push: false },
    }),
  );
}
beforeEach(() => {
  vi.spyOn(gates, 'afterModalCloses').mockResolvedValue(undefined);
  cache();
});
afterEach(() => {
  queryClient.clear();
  admin.clearAdminToken();
  useParentsArea.getState().close();
  vi.restoreAllMocks();
});

const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const parents = (nextAccount: Account = account, view: 'all' | 'pin_only' = 'all') =>
  renderInApp(
    <ParentsPage account={nextAccount} learner={learner} view={view} active pinActive={false} />,
  );

// ── the settings' own group: names only ──

it('names the parents’ steps as plain rows: no state, nothing of the account, no fold, no sheet', () => {
  const due = { ...account, deletion_due_at: '2026-10-20T10:00:00.000Z' };
  cache(due);
  renderInApp(<AdultSection account={due} learner={learner} />);
  expect(screen.getByRole('heading', { name: 'Für Eltern' })).toBeTruthy();
  // The accessible name is the label alone: a row with a second line would carry it.
  for (const name of ['Daten exportieren', 'Konto löschen', 'Anmeldung und PIN'])
    expect(screen.getByRole('button', { name })).toBeTruthy();
  // A scheduled deletion and its date are behind the gate, like the sign-in and the PIN.
  expect(document.body.textContent).not.toMatch(/geplant|Löschung abbrechen|2026|20\.10/);
  expect(screen.queryByText('E-Mail ändern')).toBeNull();
  expect(screen.queryByText('PIN ändern')).toBeNull();
  expect(document.querySelector('[aria-expanded]')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it.each(['Daten exportieren', 'Konto löschen', 'Anmeldung und PIN'])(
  '"%s" asks the parents’ PIN and only then opens their page — it does nothing itself',
  async (row) => {
    const push = vi.spyOn(router, 'push').mockImplementation(() => undefined);
    const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
    const exported = vi.spyOn(endpoints, 'exportAccount');
    const deletion = vi.spyOn(endpoints, 'requestDeletion');
    renderInApp(<AdultSection account={account} learner={learner} />);
    await press(row);
    expect(request).toHaveBeenCalledWith('parents');
    expect(push).not.toHaveBeenCalled();
    expect(useParentsArea.getState().view).toBeNull();

    request.mockResolvedValue(true);
    await press(row);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/settings/parents'));
    expect(useParentsArea.getState()).toMatchObject({ view: 'all', owner: OWNER });
    // Opening was its own step: the PIN does not stay for what follows.
    expect(admin.adminToken()).toBeNull();
    expect(exported).not.toHaveBeenCalled();
    expect(deletion).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  },
);

it('after "PIN vergessen?" the page opens for the PIN alone', async () => {
  vi.spyOn(router, 'push').mockImplementation(() => undefined);
  vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  vi.spyOn(adminFlow, 'takeForgotPin').mockReturnValue(true);
  renderInApp(<AdultSection account={account} learner={learner} />);
  await press('Anmeldung und PIN');
  await waitFor(() => expect(useParentsArea.getState().view).toBe('pin_only'));
});

it('an adult learner reaches her account without a PIN screen', async () => {
  const push = vi.spyOn(router, 'push').mockImplementation(() => undefined);
  const request = vi.spyOn(adminFlow, 'requestAdmin');
  const adult = { ...learner, is_minor: false, relation: 'self' as const };
  cache(account, adult);
  renderInApp(<AdultSection account={account} learner={adult} />);
  expect(screen.getByRole('heading', { name: 'Dein Konto' })).toBeTruthy();
  await press('Anmeldung und Profil');
  expect(request).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith('/settings/parents');
});

it('offers "Benachrichtigungen erlauben" to a minor’s parents only while contact is off, and says when a PIN comes first', async () => {
  const allow = vi.fn();
  const view = renderInApp(
    <AdultSection
      account={account}
      learner={learner}
      allowContact={{ busy: false, onPress: allow }}
    />,
  );
  await press('Benachrichtigungen erlauben, Geht nur mit der PIN der Eltern.');
  expect(allow).toHaveBeenCalledTimes(1);
  view.rerender(
    <AdultSection
      account={{ ...account, pin_set: false }}
      learner={learner}
      allowContact={{ busy: false, onPress: allow }}
    />,
  );
  expect(screen.getByText(/Dafür legen deine Eltern zuerst unten eine PIN fest\./)).toBeTruthy();
  view.rerender(<AdultSection account={account} learner={learner} />);
  expect(screen.queryByText('Benachrichtigungen erlauben')).toBeNull();
});

// ── the gate itself (app/settings/parents.tsx draws nothing while this answers null) ──

function Gate({
  owner = OWNER,
  pathname = '/settings/parents',
}: {
  owner?: string | null;
  pathname?: string;
}) {
  return <span>{useOpenParentsArea(owner, pathname) ?? 'closed'}</span>;
}

it('is closed by a link straight to the page, and for another account or profile', () => {
  const view = renderInApp(<Gate />);
  expect(screen.getByText('closed')).toBeTruthy();
  act(() => useParentsArea.getState().open('all', OWNER));
  expect(screen.getByText('all')).toBeTruthy();
  // The same phone, another profile or a signed-out session: the approval is not theirs.
  view.rerender(<Gate owner={parentsOwner(account.id, '33333333-3333-4333-8333-333333333333')} />);
  expect(screen.getByText('closed')).toBeTruthy();
  view.rerender(<Gate owner={null} />);
  expect(screen.getByText('closed')).toBeTruthy();
});

it('closes when the page is taken off the stack by any means, so a later link finds nothing', () => {
  const view = renderInApp(<Gate />);
  act(() => useParentsArea.getState().open('all', OWNER));
  expect(screen.getByText('all')).toBeTruthy();
  // `dismissAll`, `dismissTo` and `replace` (app/_layout.tsx) remove the page without a focus
  // change of its own: only its unmount is left to close the area.
  view.unmount();
  expect(useParentsArea.getState()).toMatchObject({ view: null, owner: null });
  renderInApp(<Gate />);
  expect(screen.getByText('closed')).toBeTruthy();
});

it('stays open under the PIN pad and closes when another screen comes in front', () => {
  const view = renderInApp(<Gate />);
  act(() => useParentsArea.getState().open('all', OWNER));
  view.rerender(<Gate pathname="/pin" />);
  expect(screen.getByText('all')).toBeTruthy();
  view.rerender(<Gate pathname="/library" />);
  expect(screen.getByText('closed')).toBeTruthy();
  expect(useParentsArea.getState().view).toBeNull();
});

// ── the parents' page ──

it('holds the PIN, the profile correction, the sign-in, export, deletion and sign-out, each with what parents need to read first', () => {
  const view = parents();
  expect(
    screen.getByText('Hier regeln Eltern das Konto. Öffnen geht nur mit ihrer PIN.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'PIN ändern, Eine PIN ist festgelegt.' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Profil korrigieren, Mia, geboren am/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^E-Mail ändern/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeTruthy();
  // What the export contains stands there before anything is created.
  expect(
    screen.getByRole('button', {
      name: 'Daten exportieren, Alles, was gespeichert ist, als Datei. Zum Sichern oder Weitergeben.',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: /^Konto löschen, Alles wird nach 7 Tagen/ }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Abmelden, Du bist angemeldet.' })).toBeTruthy();
  view.unmount();
  parents(account, 'pin_only');
  expect(screen.getByRole('button', { name: /^PIN ändern/ })).toBeTruthy();
  for (const gone of ['Profil korrigieren', 'Passwort ändern', 'Daten exportieren', 'Abmelden'])
    expect(screen.queryByText(gone)).toBeNull();
});

it('opens the PIN’s fields on the page, each under its own label, and never in a sheet', () => {
  parents();
  fireEvent.click(screen.getByRole('button', { name: /^PIN ändern/ }));
  expect(screen.getByLabelText('Aktuelle PIN')).toBeTruthy();
  expect(screen.getByLabelText('Neue PIN (4 Ziffern)')).toBeTruthy();
  expect(screen.getByLabelText('Neue PIN wiederholen')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it.each([
  [/^Profil korrigieren/, 'profile'],
  [/^E-Mail ändern/, 'credentials'],
  ['Passwort ändern', 'credentials'],
] as const)('asks the parents’ PIN again before the sheet of %s opens', async (row, purpose) => {
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  parents();
  await press(row);
  expect(request).toHaveBeenCalledWith(purpose);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('exports only after the parents’ PIN when the server asks for it', async () => {
  const exported = vi
    .spyOn(endpoints, 'exportAccount')
    .mockRejectedValueOnce(adminRequired())
    .mockResolvedValue({} as Awaited<ReturnType<typeof endpoints.exportAccount>>);
  const deliver = vi.spyOn(exportFile, 'deliverExport').mockResolvedValue('saved');
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  parents();
  await press(/^Daten exportieren/);
  expect(request).toHaveBeenCalledWith('export');
  expect(exported).toHaveBeenCalledTimes(1);
  expect(deliver).not.toHaveBeenCalled();

  request.mockResolvedValue(true);
  exported.mockRejectedValueOnce(adminRequired());
  await press(/^Daten exportieren/);
  await waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
});

it('asks the parents before the deletion can even be confirmed', async () => {
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  const requested = vi.spyOn(endpoints, 'requestDeletion');
  parents();
  await press(/^Konto löschen/);
  expect(request).toHaveBeenCalledWith('delete');
  expect(screen.queryByText('Konto wirklich löschen?')).toBeNull();
  request.mockResolvedValue(true);
  await press(/^Konto löschen/);
  await waitFor(() => expect(screen.getByText('Konto wirklich löschen?')).toBeTruthy());
  expect(requested).not.toHaveBeenCalled();
});

it('"Löschung abbrechen" shows the date behind the gate and asks the parents’ PIN again', async () => {
  const due = { ...account, deletion_due_at: '2026-10-20T10:00:00.000Z' };
  cache(due);
  const cancel = vi
    .spyOn(endpoints, 'cancelDeletion')
    .mockRejectedValueOnce(adminRequired())
    .mockResolvedValue({ deletion_due_at: null });
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  parents(due);
  expect(screen.getByText(/^Die Löschung ist geplant: ab /)).toBeTruthy();
  await press(/^Löschung abbrechen/);
  expect(request).toHaveBeenCalledWith('cancel_deletion');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.account?.deletion_due_at).toBe(
    due.deletion_due_at,
  );

  request.mockResolvedValue(true);
  cancel.mockRejectedValueOnce(adminRequired());
  await press(/^Löschung abbrechen/);
  await waitFor(() =>
    expect(queryClient.getQueryData<MeResponse>(keys.me)?.account?.deletion_due_at).toBeNull(),
  );
});

it('signs out from the opened area without asking the PIN a second time', async () => {
  const request = vi.spyOn(adminFlow, 'requestAdmin');
  parents();
  await press(/^Abmelden/);
  await waitFor(() => expect(screen.getByText('Wirklich abmelden?')).toBeTruthy());
  expect(request).not.toHaveBeenCalled();
});

// ── rows elsewhere in the settings ──

it('"Aussehen" is two rows: the colour tiles and one switch with the short "System"', () => {
  renderInApp(<LookSection />);
  expect(screen.getByText('Farbe')).toBeTruthy();
  expect(screen.getByText('Hell oder dunkel')).toBeTruthy();
  expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
    'Pastell',
    'Wald',
    'Meer',
    'Abend',
    'System',
    'Hell',
    'Dunkel',
  ]);
  expect(screen.queryByText('Welche Farben magst du?')).toBeNull();
});

it('lists the shipped packages as rows; a tap opens one licence text under its row, one at a time', async () => {
  renderInApp(<LicencesPage />);
  const first = await screen.findByRole('button', { name: '@babel/runtime 7.29.2, MIT' });
  const second = screen.getByRole('button', { name: 'zustand 5.0.2, MIT' });
  expect(screen.queryByText('Permission is hereby granted')).toBeNull();
  fireEvent.click(first);
  expect(screen.getByText('Permission is hereby granted')).toBeTruthy();
  expect(first.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(second);
  expect(screen.queryByText('Permission is hereby granted')).toBeNull();
  expect(screen.getByText('The second licence text')).toBeTruthy();
  fireEvent.click(second);
  expect(screen.queryByText('The second licence text')).toBeNull();
});
