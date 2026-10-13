// requires live verification in Claude Code session — the settings PATCH and the parents' PIN
// screen are the edges held here; what the server allows is its own (policy and route tests),
// and the pages on a phone are tests/web/redesign-settings-view.spec.ts.
//
// The contact pages after the move from folds to pages (#589, #599): every function of the old
// "Benachrichtigungen" card is still there, sends the same PATCH, and asks the parents first
// where a minor would get more contact (CLAUDE.md rule 6).
import { BuddySettingsView, VOICE_NAMES } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';

import * as admin from '../../../lib/admin.js';
import * as adminFlow from '../../../lib/adminFlow.js';
import { ApiError } from '../../../lib/api/client.js';
import * as endpoints from '../../../lib/api/endpoints.js';
import { keys, queryClient } from '../../../lib/api/queries.js';
import * as push from '../../../lib/push.js';
import { renderInApp } from '../../../testing/render.js';
import { toast } from '../../lb/Toast.js';
import * as gates from '../adultGate.js';
import { ContactPage } from '../ContactPage.js';
import { TimesPage } from '../TimesPage.js';

const base = BuddySettingsView.parse({
  contact_enabled: true,
  quiet_start: '20:00',
  quiet_end: '07:00',
  preferred_start: '15:00',
  preferred_end: '18:30',
  avoid_weekdays: [],
  paused_until: null,
  only_important: false,
  timezone: 'Europe/Berlin',
  voice: VOICE_NAMES[0],
  natural_voice: false,
  version: 4,
  can_loosen: false,
});

let update: MockInstance<typeof endpoints.updateSettings>;

beforeEach(() => {
  vi.spyOn(gates, 'afterModalCloses').mockResolvedValue(undefined);
  vi.spyOn(push, 'registeredHere').mockResolvedValue(true);
  vi.spyOn(push, 'registerDeviceForPush').mockResolvedValue(false);
  update = vi
    .spyOn(endpoints, 'updateSettings')
    .mockImplementation(async (change) =>
      BuddySettingsView.parse({ ...base, ...change, version: change.version + 1 }),
    );
});
afterEach(() => {
  queryClient.clear();
  admin.clearAdminToken();
  vi.restoreAllMocks();
});

function times(settings: BuddySettingsView, isMinor = true) {
  queryClient.setQueryData(keys.settings, settings);
  return renderInApp(
    <TimesPage settings={settings} isMinor={isMinor} pinSet push="active" active />,
  );
}
function contact(settings: BuddySettingsView, opts: { isMinor?: boolean; pinSet?: boolean } = {}) {
  queryClient.setQueryData(keys.settings, settings);
  return renderInApp(
    <ContactPage
      settings={settings}
      isMinor={opts.isMinor ?? true}
      pinSet={opts.pinSet ?? true}
      push="active"
    />,
  );
}
const press = async (target: HTMLElement) => {
  await act(async () => {
    fireEvent.click(target);
  });
};

it('shows every day as its own switch: the days Buddy may write are on', () => {
  times({ ...base, avoid_weekdays: [6, 7] });
  const days = screen.getAllByRole('checkbox');
  expect(days.map((d) => d.getAttribute('aria-label'))).toEqual([
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
    'Sonntag',
  ]);
  expect(days.map((d) => d.getAttribute('aria-checked'))).toEqual([
    'true',
    'true',
    'true',
    'true',
    'true',
    'false',
    'false',
  ]);
  expect(
    screen.getByRole('switch', { name: 'Ruhe am Wochenende' }).getAttribute('aria-checked'),
  ).toBe('true');
});

it('takes a day away without the parents: less contact always goes', async () => {
  const request = vi.spyOn(adminFlow, 'requestAdmin');
  times(base);
  await press(screen.getByRole('checkbox', { name: 'Mittwoch' }));
  expect(request).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledWith({ avoid_weekdays: [3], version: 4 });
});

it('asks the parents before a minor gets a day back, and sends nothing when they cancel', async () => {
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  times({ ...base, avoid_weekdays: [3, 6] });
  await press(screen.getByRole('checkbox', { name: 'Mittwoch' }));
  expect(request).toHaveBeenCalledWith('contact');
  expect(update).not.toHaveBeenCalled();
});

it('gives the day back once the parents entered the PIN', async () => {
  vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(true);
  times({ ...base, avoid_weekdays: [3, 6] });
  await press(screen.getByRole('checkbox', { name: 'Mittwoch' }));
  expect(update).toHaveBeenCalledWith({ avoid_weekdays: [6], version: 4 });
});

it('an adult learner changes her days without a PIN screen', async () => {
  const request = vi.spyOn(adminFlow, 'requestAdmin');
  times({ ...base, can_loosen: true, avoid_weekdays: [3] }, false);
  await press(screen.getByRole('checkbox', { name: 'Mittwoch' }));
  expect(request).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledWith({ avoid_weekdays: [], version: 4 });
});

it('"Ruhe am Wochenende" is Saturday and Sunday in the same field, kept with the other days', async () => {
  const view = times({ ...base, avoid_weekdays: [3] });
  await press(screen.getByRole('switch', { name: 'Ruhe am Wochenende' }));
  expect(update).toHaveBeenCalledWith({ avoid_weekdays: [3, 6, 7], version: 4 });
  view.unmount();
  update.mockClear();
  // Off again allows more: the parents first.
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  times({ ...base, avoid_weekdays: [3, 6, 7] });
  await press(screen.getByRole('switch', { name: 'Ruhe am Wochenende' }));
  expect(request).toHaveBeenCalledWith('contact');
  expect(update).not.toHaveBeenCalled();
});

it('picks the time of day and the quiet hours from the shared sheet, one field per save', async () => {
  times(base);
  fireEvent.click(screen.getByRole('button', { name: 'Wann am liebsten?, 15:00–18:30' }));
  await press(await screen.findByRole('radio', { name: '16:00–19:30' }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      preferred_start: '16:00',
      preferred_end: '19:30',
      version: 4,
    }),
  );
  update.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Nicht nach, 20:00 Uhr' }));
  await press(await screen.findByRole('radio', { name: '19:00 Uhr' }));
  await waitFor(() => expect(update).toHaveBeenCalledWith({ quiet_start: '19:00', version: 5 }));
});

it('retries a later quiet time once after the parents’ PIN when the server asks for them', async () => {
  update.mockRejectedValueOnce(new ApiError('admin_required', 'adult needed', 403));
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(true);
  times(base);
  fireEvent.click(screen.getByRole('button', { name: 'Nicht nach, 20:00 Uhr' }));
  await press(await screen.findByRole('radio', { name: '21:00 Uhr' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  expect(request).toHaveBeenCalledWith('contact');
  expect(update).toHaveBeenLastCalledWith({ quiet_start: '21:00', version: 4 });
});

it('the weekend switch: when the server asks for the parents it is retried once after the PIN, and nothing more is sent when they cancel', async () => {
  const refused = () => new ApiError('admin_required', 'adult needed', 403);
  update.mockRejectedValueOnce(refused());
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  // Quiet on: less contact, so no PIN up front — the server's answer is what asks for it.
  const view = times({ ...base, avoid_weekdays: [3] });
  await press(screen.getByRole('switch', { name: 'Ruhe am Wochenende' }));
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('contact');
  expect(update).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData<BuddySettingsView>(keys.settings)?.avoid_weekdays).toEqual([3]);
  view.unmount();

  update.mockClear();
  update.mockRejectedValueOnce(refused());
  request.mockResolvedValue(true);
  times({ ...base, avoid_weekdays: [3] });
  await press(screen.getByRole('switch', { name: 'Ruhe am Wochenende' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  expect(update).toHaveBeenLastCalledWith({ avoid_weekdays: [3, 6, 7], version: 4 });
  // Once, not until it works: a second refusal is not asked about again.
  expect(request).toHaveBeenCalledTimes(2);
});

it('says to a minor without a PIN that the parents set one first — on the page, not only in a toast', () => {
  contact({ ...base, contact_enabled: false }, { pinSet: false });
  expect(
    screen.getByText(/in den Einstellungen unter „Für Eltern“ bei „Anmeldung und PIN“\./),
  ).toBeTruthy();
});

it('switches contact off with one tap, and pauses it', async () => {
  const view = contact(base);
  expect(screen.getByText('Ja – nie nach 20:00 Uhr.')).toBeTruthy();
  await press(screen.getByRole('button', { name: 'Nicht mehr erlauben' }));
  expect(update).toHaveBeenCalledWith({ contact_enabled: false, version: 4 });
  view.unmount();
  update.mockClear();
  contact(base);
  await press(screen.getByRole('button', { name: /^Bis morgen/ }));
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0]?.[0]).toMatchObject({ version: 4 });
  expect(typeof update.mock.calls[0]?.[0].paused_until).toBe('string');
});

it('a minor allows contact only through the parents; without a PIN it says where one is set', async () => {
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(true);
  const show = vi.spyOn(toast, 'show').mockImplementation(() => undefined);
  const off = { ...base, contact_enabled: false };
  const view = contact(off);
  expect(screen.getByText('Nein. Buddy schreibt dir nur hier in der App.')).toBeTruthy();
  await press(screen.getByRole('button', { name: /^Eltern fragen/ }));
  expect(request).toHaveBeenCalledWith('contact');
  expect(update).toHaveBeenCalledWith({ contact_enabled: true, version: 4 });
  view.unmount();
  update.mockClear();
  request.mockClear();
  contact(off, { pinSet: false });
  await press(screen.getByRole('button', { name: /^Eltern fragen/ }));
  expect(request).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(show).toHaveBeenCalledWith(
    expect.stringContaining('in den Einstellungen unter „Für Eltern“ bei „Anmeldung und PIN“'),
  );
});

it('ends a pause and "seltener schreiben" only with the parents for a minor', async () => {
  const request = vi.spyOn(adminFlow, 'requestAdmin').mockResolvedValue(false);
  const later = new Date(Date.now() + 2 * 86_400_000).toISOString();
  contact({ ...base, paused_until: later, only_important: true });
  await press(screen.getByRole('button', { name: 'Pause beenden' }));
  await press(screen.getByRole('button', { name: /^Wieder alles aufs Handy/ }));
  expect(request).toHaveBeenCalledTimes(2);
  expect(update).not.toHaveBeenCalled();
});
