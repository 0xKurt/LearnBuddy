// Auth is an external adapter seam; no database, production client or network is opened here.
// Real recovery parsing, fields, labels and screen state run inside the app providers.
// Pending ordered integration: shared Field and Welcome AUTH theme must exist; do not stub them.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Session } from '../../../lib/auth/session.js';
import { AuthFailure } from '../../../lib/auth/authFailure.js';
import { renderInApp } from '../../../testing/render.js';
import ResetPassword from '../../../app/reset-password.js';

const adapter = vi.hoisted(() => ({
  url: null as string | null,
  session: null as Session | null,
  request: vi.fn(),
  start: vi.fn(),
  finish: vi.fn(),
  abandon: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
  clearQueries: vi.fn(),
  clearAdmin: vi.fn(),
}));
vi.mock('expo-linking', () => ({ useLinkingURL: () => adapter.url }));
vi.mock('expo-router', () => ({ router: { replace: adapter.replace } }));
vi.mock('../../../lib/auth/supabase.js', async () => {
  const { AuthFailure } = await import('../../../lib/auth/authFailure.js');
  return {
    AuthFailure,
    requestPasswordReset: adapter.request,
    startRecovery: adapter.start,
    finishRecovery: adapter.finish,
    abandonRecovery: adapter.abandon,
  };
});
vi.mock('../../../lib/auth/session.js', () => ({ currentSession: () => adapter.session }));
vi.mock('../../../lib/api/queries.js', () => ({ queryClient: { clear: adapter.clearQueries } }));
vi.mock('../../../lib/admin.js', () => ({ clearAdminToken: adapter.clearAdmin }));
vi.mock('../../lb/Toast.js', () => ({ toast: { show: adapter.toast } }));
vi.mock('../../lb/BuddyOrb.js', () => ({ BuddyOrb: () => null }));

const CONFIRMATION =
  'Wenn es ein Konto mit dieser Adresse gibt, kommt gleich eine E-Mail zum Zurücksetzen.';
const RECOVERY_URL = 'learnbuddy://reset-password?code=fixture-code';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function invalid() {
  renderInApp(<ResetPassword />);
  await screen.findByText('Dieser Link gilt nicht mehr');
  return screen.getByRole('textbox', { name: 'E-Mail' });
}
function enterEmail(input: HTMLElement, email = ' lena@example.invalid ') {
  fireEvent.change(input, { target: { value: email } });
}
const session = (user_id: string): Session => ({
  user_id,
  email: 'fixture@example.invalid',
  access_token: 'fixture-access',
  refresh_token: 'fixture-refresh',
  expires_at: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  adapter.url = null;
  adapter.session = null;
  adapter.request.mockReset().mockResolvedValue(undefined);
  adapter.start.mockReset().mockResolvedValue(undefined);
  adapter.finish.mockReset().mockResolvedValue(undefined);
  adapter.abandon.mockReset().mockResolvedValue(undefined);
});

it('locks same-render Enter resends, fields and leaving until the invalid-link request finishes', async () => {
  const waiting = deferred();
  adapter.request.mockReturnValueOnce(waiting.promise);
  const email = await invalid();
  enterEmail(email);
  act(() => {
    fireEvent.keyDown(email, { key: 'Enter', code: 'Enter' });
    fireEvent.keyDown(email, { key: 'Enter', code: 'Enter' });
  });
  expect(adapter.request).toHaveBeenCalledTimes(1);
  expect(adapter.request).toHaveBeenCalledWith('lena@example.invalid');
  expect((email as HTMLInputElement).readOnly).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Neuen Link schicken' }));
  const leave = screen.getByRole('button', { name: 'Zurück zur Anmeldung' });
  expect(leave.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(leave);
  expect(adapter.request).toHaveBeenCalledTimes(1);
  expect(adapter.abandon).not.toHaveBeenCalled();
  await act(async () => waiting.resolve());
  expect(await screen.findByText(CONFIRMATION)).toBeDefined();
  expect(leave.getAttribute('aria-disabled')).not.toBe('true');
});

it.each(['known', 'unknown'] as const)(
  'gives the same generic confirmation for a %s account outcome',
  async (outcome) => {
    if (outcome === 'unknown') adapter.request.mockRejectedValueOnce(new AuthFailure('unknown'));
    const email = await invalid();
    enterEmail(email);
    fireEvent.click(screen.getByRole('button', { name: 'Neuen Link schicken' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', CONFIRMATION);
    expect(adapter.request).toHaveBeenCalledWith('lena@example.invalid');
    expect(
      screen.getByRole('button', { name: 'Neuen Link schicken' }).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(adapter.toast).not.toHaveBeenCalled();
  },
);

it.each([
  ['network', 'Keine Verbindung. Versuch es gleich nochmal.'],
  [
    'rate_limited',
    'Das waren gerade ein paar Versuche zu viel. Warte kurz und versuch es dann nochmal.',
  ],
] as const)(
  'keeps the email and retries after %s without falsely confirming delivery',
  async (reason, message) => {
    adapter.request.mockRejectedValueOnce(new AuthFailure(reason));
    const email = await invalid();
    enterEmail(email);
    fireEvent.click(screen.getByRole('button', { name: 'Neuen Link schicken' }));
    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.queryByText(CONFIRMATION)).toBeNull();
    // The real web email input normalizes surrounding spaces; its address remains intact.
    expect((email as HTMLInputElement).value).toBe('lena@example.invalid');
    const retry = screen.getByRole('button', { name: 'Neuen Link schicken' });
    expect(retry.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(retry);
    expect(await screen.findByText(CONFIRMATION)).toBeDefined();
    expect(screen.queryByText(message)).toBeNull();
    expect(adapter.request).toHaveBeenCalledTimes(2);
    expect(adapter.request.mock.calls.map(([email]) => email)).toEqual([
      'lena@example.invalid',
      'lena@example.invalid',
    ]);
  },
);

it.each([false, true])(
  'abandons only the recovery session and routes back for signed-in=%s',
  async (signedIn) => {
    adapter.session = signedIn ? session('existing-user') : null;
    await invalid();
    fireEvent.click(
      screen.getByRole('button', { name: signedIn ? 'Zurück zur App' : 'Zurück zur Anmeldung' }),
    );
    expect(adapter.abandon).toHaveBeenCalledTimes(1);
    expect(adapter.replace).toHaveBeenCalledWith(signedIn ? '/' : '/welcome');
    expect(adapter.finish).not.toHaveBeenCalled();
    expect(adapter.clearQueries).not.toHaveBeenCalled();
    expect(adapter.clearAdmin).not.toHaveBeenCalled();
  },
);

it('retries checking the exact recovery link after a network failure without requesting another email', async () => {
  adapter.url = RECOVERY_URL;
  adapter.start.mockRejectedValueOnce(new AuthFailure('network'));
  renderInApp(<ResetPassword />);
  fireEvent.click(await screen.findByRole('button', { name: 'Nochmal versuchen' }));
  await screen.findByRole('heading', { name: 'Neues Passwort' });
  expect(adapter.start.mock.calls).toEqual([
    [{ kind: 'code', code: 'fixture-code' }],
    [{ kind: 'code', code: 'fixture-code' }],
  ]);
  expect(adapter.request).not.toHaveBeenCalled();
});

it('saves the exact password, prevents leaving mid-save and clears prior-account caches only after success', async () => {
  adapter.url = RECOVERY_URL;
  adapter.session = session('before-user');
  const waiting = deferred();
  adapter.finish.mockImplementationOnce(async () => {
    await waiting.promise;
    adapter.session = session('after-user');
  });
  renderInApp(<ResetPassword />);
  await screen.findByRole('heading', { name: 'Neues Passwort' });
  fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'new-pass-123' } });
  fireEvent.change(screen.getByLabelText('Neues Passwort wiederholen'), {
    target: { value: 'new-pass-123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));
  const leave = screen.getByRole('button', { name: 'Zurück zur App' });
  expect(leave.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(leave);
  expect(adapter.abandon).not.toHaveBeenCalled();
  expect(adapter.clearQueries).not.toHaveBeenCalled();
  await act(async () => waiting.resolve());
  await waitFor(() => expect(adapter.replace).toHaveBeenCalledWith('/'));
  expect(adapter.start).toHaveBeenCalledWith({ kind: 'code', code: 'fixture-code' });
  expect(adapter.finish).toHaveBeenCalledTimes(1);
  expect(adapter.finish).toHaveBeenCalledWith('new-pass-123');
  expect(adapter.clearQueries).toHaveBeenCalledTimes(1);
  expect(adapter.clearAdmin).toHaveBeenCalledTimes(1);
  expect(adapter.toast).toHaveBeenCalledWith(
    'Geschafft – dein neues Passwort gilt ab jetzt.',
    'info',
    { survivesNavigation: true },
  );
});

it('accepts a retry as soon as a failed request commits an enabled action', async () => {
  let reject!: (error: Error) => void;
  adapter.request.mockReturnValueOnce(
    new Promise<void>((_resolve, fail) => {
      reject = fail;
    }),
  );
  const email = await invalid();
  enterEmail(email);
  const button = screen.getByRole('button', { name: 'Neuen Link schicken' });
  fireEvent.click(button);
  // Observe the committed real DOM before passive effects: a visible enabled action must
  // already accept its next interaction, even while the failed request's effects settle.
  const observer = new MutationObserver(() => {
    if (button.isConnected && button.getAttribute('aria-disabled') !== 'true') {
      observer.disconnect();
      fireEvent.click(button);
    }
  });
  observer.observe(button, { attributes: true, attributeFilter: ['aria-disabled'] });
  void Promise.resolve().then(() => reject(new AuthFailure('network')));
  try {
    expect(await screen.findByText(CONFIRMATION)).toBeDefined();
    expect(adapter.request.mock.calls).toEqual([
      ['lena@example.invalid'],
      ['lena@example.invalid'],
    ]);
  } finally {
    observer.disconnect();
  }
});
