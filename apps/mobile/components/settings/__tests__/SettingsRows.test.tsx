// requires live verification in Claude Code session — navigation, the PIN screen and the
// account APIs are the edges held here; the pages on a phone, with the real API, are
// tests/web/redesign-settings-view.spec.ts and core-loop-settings.spec.ts.
//
// The settings as rows (#589, #599; ui_kits/app/Settings.jsx): a row leads to a page, nothing
// unfolds in place — and the parents' gate, the export and the deletion still ask the parents
// before anything happens.
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
import { useParentsArea } from '../parentsArea.js';
import { ParentsPage } from '../ParentsPage.js';

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

beforeEach(() => {
  vi.spyOn(gates, 'afterModalCloses').mockResolvedValue(undefined);
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
  useParentsArea.getState().close();
  vi.restoreAllMocks();
});

const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

it('lists the parents’ steps as rows, with nothing unfolded and no sheet', () => {
  renderInApp(<AdultSection account={account} learner={learner} />);
  expect(screen.getByRole('heading', { name: 'Für Eltern' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Daten exportieren' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Konto löschen' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Anmeldung und PIN, Geht nur mit der PIN der Eltern.' }),
  ).toBeTruthy();
  // The sign-in and the PIN are behind the gate, not on the settings.
  expect(screen.queryByText('E-Mail ändern')).toBeNull();
  expect(screen.queryByText('PIN ändern')).toBeNull();
  expect(document.querySelector('[aria-expanded]')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('opens the parents’ page only after the PIN, with what the gate approved', async () => {
  const push = vi.spyOn(router, 'push').mockImplementation(() => undefined);
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  renderInApp(<AdultSection account={account} learner={learner} />);
  await press(/^Anmeldung und PIN/);
  expect(request).toHaveBeenCalledWith('parents');
  expect(push).not.toHaveBeenCalled();
  expect(useParentsArea.getState().view).toBeNull();

  request.mockResolvedValue(true);
  await press(/^Anmeldung und PIN/);
  await waitFor(() => expect(push).toHaveBeenCalledWith('/settings/parents'));
  expect(useParentsArea.getState().view).toBe('all');
  // Opening was its own step: the PIN does not stay for what follows.
  expect(admin.adminToken()).toBeNull();
});

it('after "PIN vergessen?" the page opens for the PIN alone', async () => {
  vi.spyOn(router, 'push').mockImplementation(() => undefined);
  vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  vi.spyOn(adminFlow, 'takeForgotPin').mockReturnValue(true);
  renderInApp(<AdultSection account={account} learner={learner} />);
  await press(/^Anmeldung und PIN/);
  await waitFor(() => expect(useParentsArea.getState().view).toBe('pin_only'));
});

it('an adult learner reaches her sign-in without a PIN screen', async () => {
  const push = vi.spyOn(router, 'push').mockImplementation(() => undefined);
  const request = vi.spyOn(adminFlow, 'requestAdmin');
  const adult = { ...learner, is_minor: false, relation: 'self' as const };
  queryClient.setQueryData<MeResponse>(keys.me, (old) => (old ? { ...old, learner: adult } : old));
  renderInApp(<AdultSection account={account} learner={adult} />);
  expect(screen.getByRole('heading', { name: 'Dein Konto' })).toBeTruthy();
  await press('Anmeldung und Profil');
  expect(request).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith('/settings/parents');
});

it('exports only after the parents’ PIN when the server asks for it', async () => {
  const exported = vi
    .spyOn(endpoints, 'exportAccount')
    .mockRejectedValueOnce(new ApiError('admin_required', 'adult needed', 403))
    .mockResolvedValue({} as Awaited<ReturnType<typeof endpoints.exportAccount>>);
  const deliver = vi.spyOn(exportFile, 'deliverExport').mockResolvedValue('saved');
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  renderInApp(<AdultSection account={account} learner={learner} />);
  await press('Daten exportieren');
  expect(request).toHaveBeenCalledWith('export');
  expect(exported).toHaveBeenCalledTimes(1);
  expect(deliver).not.toHaveBeenCalled();

  request.mockResolvedValue(true);
  exported.mockRejectedValueOnce(new ApiError('admin_required', 'adult needed', 403));
  await press('Daten exportieren');
  await waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
});

it('asks the parents before the deletion can even be confirmed', async () => {
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  const requested = vi.spyOn(endpoints, 'requestDeletion');
  renderInApp(<AdultSection account={account} learner={learner} />);
  await press('Konto löschen');
  expect(request).toHaveBeenCalledWith('delete');
  expect(screen.queryByText('Konto wirklich löschen?')).toBeNull();
  request.mockResolvedValue(true);
  await press('Konto löschen');
  await waitFor(() => expect(screen.getByText('Konto wirklich löschen?')).toBeTruthy());
  expect(requested).not.toHaveBeenCalled();
});

it('offers "Benachrichtigungen erlauben" to a minor’s parents only while contact is off', async () => {
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
  view.rerender(<AdultSection account={account} learner={learner} />);
  expect(screen.queryByText('Benachrichtigungen erlauben')).toBeNull();
});

it('the parents’ page holds the PIN, the profile correction and the sign-in; "pin_only" the PIN alone', () => {
  const view = renderInApp(<ParentsPage account={account} learner={learner} view="all" />);
  expect(screen.getByRole('button', { name: 'PIN ändern, Eine PIN ist festgelegt.' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Profil korrigieren, Mia, geboren am/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^E-Mail ändern/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeTruthy();
  view.rerender(<ParentsPage account={account} learner={learner} view="pin_only" />);
  expect(screen.getByRole('button', { name: /^PIN ändern/ })).toBeTruthy();
  expect(screen.queryByText('Profil korrigieren')).toBeNull();
  expect(screen.queryByText('Passwort ändern')).toBeNull();
});

it('opens the PIN’s fields on the page, each under its own label, and never in a sheet', () => {
  renderInApp(<ParentsPage account={account} learner={learner} view="all" />);
  fireEvent.click(screen.getByRole('button', { name: /^PIN ändern/ }));
  expect(screen.getByLabelText('Aktuelle PIN')).toBeTruthy();
  expect(screen.getByLabelText('Neue PIN (4 Ziffern)')).toBeTruthy();
  expect(screen.getByLabelText('Neue PIN wiederholen')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('asks the parents before the profile correction or a sign-in sheet opens', async () => {
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  renderInApp(<ParentsPage account={account} learner={learner} view="all" />);
  await press(/^Profil korrigieren/);
  expect(request).toHaveBeenLastCalledWith('profile');
  await press('Passwort ändern');
  expect(request).toHaveBeenLastCalledWith('credentials');
  expect(screen.queryByRole('dialog')).toBeNull();
});

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

it('lists the shipped packages as rows; a tap opens one licence text under its row', async () => {
  renderInApp(<LicencesPage />);
  // By its text, not by role: computing the accessible name of every one of the ~170 rows
  // takes jsdom seconds, and the full suite then ran this into its 5 s limit.
  const title = await screen.findByText(/^@babel\/runtime [\d.]+$/);
  const first = title.closest<HTMLElement>('[role="button"]')!;
  expect(first.getAttribute('aria-label')).toMatch(/^@babel\/runtime [\d.]+, MIT$/);
  expect(screen.queryByText(/Permission is hereby granted/)).toBeNull();
  fireEvent.click(first);
  expect(screen.getAllByText(/Permission is hereby granted/)).toHaveLength(1);
  expect(first.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(first);
  expect(screen.queryByText(/Permission is hereby granted/)).toBeNull();
}, 20_000);
