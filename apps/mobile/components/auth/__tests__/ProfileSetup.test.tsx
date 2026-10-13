// requires live verification in Claude Code session — the API, the session, the device's draft
// storage and Buddy's voices are the edges held here; the real request and its answer are walked
// by tests/web/redesign-{profile-parent,contact,handover}.spec.ts and core-loop-setup.spec.ts.
//
// What must never regress on the profile pages, and is otherwise only held by the walkthrough:
//   · "Weiter" waits for every required field of the learner page;
//   · on the parents' page it waits for the consent AND a four-digit PIN typed twice alike;
//   · that page offers the way out (design Onboarding.jsx:68) and the way back;
//   · leaving the notification question with "Zurück" decides nothing and saves nothing.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import * as endpoints from '../../../lib/api/endpoints.js';
import type * as Session from '../../../lib/auth/session.js';
import { renderInApp } from '../../../testing/render.js';
import Profile from '../../../app/profile.js';

const edge = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../../../lib/leave.js', () => ({ signOutHere: edge.signOut }));
vi.mock('../../../lib/auth/session.js', async (original) => ({
  ...(await original<typeof Session>()),
  currentSession: () => ({ email: 'eltern@example.invalid' }),
}));
vi.mock('../../../lib/api/outboxStorage.js', () => ({
  readItem: async () => null,
  writeItem: async () => undefined,
}));
vi.mock('../../lb/BuddyOrb.js', () => ({ BuddyOrb: () => null }));
vi.mock('../../voice/VoicePicker.js', () => ({ VoicePicker: () => null }));

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const waits = (name: string) => button(name).getAttribute('aria-disabled') === 'true';
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function pickRegion() {
  fireEvent.click(button('Bundesland wählen'));
  await act(async () => {
    fireEvent.click(await screen.findByRole('radio', { name: 'Niedersachsen' }));
  });
}

/** The learner page filled for a child under 16, then on to the parents' page. */
async function toParents() {
  renderInApp(<Profile />);
  fireEvent.click(await screen.findByRole('radio', { name: 'Mein Kind' }));
  type('Wie heißt dein Kind? (Spitzname genügt)', 'Mia');
  await pickRegion();
  type('Tag', '14');
  type('Monat', '03');
  type('Jahr', '2013');
  await waitFor(() => expect(waits('Weiter')).toBe(false));
  fireEvent.click(button('Weiter'));
  await screen.findByRole('heading', { name: 'Noch kurz für die Eltern' });
}

let create: MockInstance<typeof endpoints.createLearner>;
beforeEach(() => {
  vi.restoreAllMocks();
  edge.signOut.mockReset().mockResolvedValue(undefined);
  create = vi.spyOn(endpoints, 'createLearner').mockRejectedValue(new Error('not in this test'));
});

it('keeps "Weiter" waiting until every required field of the learner page is given', async () => {
  renderInApp(<Profile />);
  await screen.findByRole('heading', { name: 'Wer lernt mit LearnBuddy?' });
  expect(waits('Weiter')).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: 'Mein Kind' }));
  expect(waits('Weiter')).toBe(true);
  type('Wie heißt dein Kind? (Spitzname genügt)', 'Mia');
  expect(waits('Weiter')).toBe(true);
  // No Bundesland is chosen in advance (issue #199).
  type('Tag', '14');
  type('Monat', '03');
  type('Jahr', '2013');
  expect(waits('Weiter')).toBe(true);
  await pickRegion();
  await waitFor(() => expect(waits('Weiter')).toBe(false));
  // A date that does not exist takes it back.
  type('Tag', '31');
  type('Monat', '02');
  await waitFor(() => expect(waits('Weiter')).toBe(true));
  expect(create).not.toHaveBeenCalled();
});

it('keeps "Weiter" on the parents’ page waiting for the consent and a PIN typed twice alike', async () => {
  await toParents();
  const consent = screen.getByRole('checkbox', { name: /sorgeberechtigt/ });
  // Agreement is given, never restored or ticked in advance.
  expect(consent.getAttribute('aria-checked')).toBe('false');
  expect(waits('Weiter')).toBe(true);
  type('PIN der Eltern', '4826');
  type('PIN wiederholen', '4826');
  expect(waits('Weiter')).toBe(true); // the PIN alone is not enough
  fireEvent.click(consent);
  await waitFor(() => expect(waits('Weiter')).toBe(false));
  type('PIN wiederholen', '4827');
  await waitFor(() => expect(waits('Weiter')).toBe(true));
  expect(screen.getByText('Die PINs stimmen nicht überein. Bitte nochmal.')).toBeTruthy();
  type('PIN der Eltern', '482');
  type('PIN wiederholen', '482');
  expect(waits('Weiter')).toBe(true); // three digits are no PIN
  type('PIN der Eltern', '4826');
  type('PIN wiederholen', '4826');
  await waitFor(() => expect(waits('Weiter')).toBe(false));
  fireEvent.click(consent);
  await waitFor(() => expect(waits('Weiter')).toBe(true)); // the consent taken back
  expect(create).not.toHaveBeenCalled();
});

it('offers the way out and the way back on the parents’ page, in that order under "Weiter"', async () => {
  await toParents();
  const names = screen.getAllByRole('button').map((b) => b.textContent);
  const [next, out, back] = ['Weiter', 'Abmelden', 'Zurück'].map((name) => names.indexOf(name));
  expect(next).toBeGreaterThanOrEqual(0);
  expect(out).toBeGreaterThan(next!);
  expect(back).toBeGreaterThan(out!);
  await act(async () => {
    fireEvent.click(button('Abmelden'));
  });
  expect(edge.signOut).toHaveBeenCalledTimes(1);
  fireEvent.click(button('Zurück'));
  await screen.findByRole('heading', { name: 'Wer lernt mit LearnBuddy?' });
  // The learner page has the way out too, and no way back: it is the first of the profile.
  expect(button('Abmelden')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

it('decides nothing about notifications when the question is left with "Zurück"', async () => {
  await toParents();
  fireEvent.click(screen.getByRole('checkbox', { name: /sorgeberechtigt/ }));
  type('PIN der Eltern', '4826');
  type('PIN wiederholen', '4826');
  await waitFor(() => expect(waits('Weiter')).toBe(false));
  fireEvent.click(button('Weiter'));
  await screen.findByRole('heading', { name: 'Darf Buddy Mia Benachrichtigungen schicken?' });
  fireEvent.click(button('Zurück'));
  await screen.findByRole('heading', { name: 'Noch kurz für die Eltern' });
  // Nothing was sent, and what the parents typed is still there.
  expect(create).not.toHaveBeenCalled();
  expect((screen.getByLabelText('PIN der Eltern') as HTMLInputElement).value).toBe('4826');
  // Asked again, it is answered once — with the answer that was tapped.
  fireEvent.click(button('Weiter'));
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Nein, danke' }));
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]?.[0]).toMatchObject({ contact: 'no', minor_consent: true });
});
