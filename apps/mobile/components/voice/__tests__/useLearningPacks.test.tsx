// requires live verification in Claude Code session (native pack storage and network replaced)
import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  state: vi.fn(),
  install: vi.fn(),
  alert: vi.fn(),
  fetch: vi.fn(),
  listener: null as
    | null
    | ((net: { isConnected: boolean; details: { isConnectionExpensive: boolean } }) => void),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'de' } }) }));
vi.mock('react-native', () => ({ Alert: { alert: fake.alert } }));
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: fake.fetch,
    addEventListener: (listener: typeof fake.listener) => {
      fake.listener = listener;
      return () => {
        fake.listener = null;
      };
    },
  },
}));
vi.mock('../../../lib/speech/pronunciation.js', () => ({
  pronunciationPacks: { state: fake.state, install: fake.install },
}));
import { mayDownloadPack } from '../../../lib/speech/packDownload.js';
import { useLearningPacks } from '../../../lib/speech/useLearningPacks.js';
const home = (languages: string[], roleplay?: string) =>
  ({
    learning_languages: languages,
    roleplay: roleplay ? { language: roleplay } : null,
  }) as BuddyHome;
const download = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fake.state.mockResolvedValue({ state: 'missing' });
  fake.fetch.mockResolvedValue({ isConnected: true, details: { isConnectionExpensive: false } });
  fake.install.mockImplementation(async (lang: string) => {
    if (await mayDownloadPack({ name: lang, sha256: '', bytes: 1 })) download(lang);
    return { state: 'missing' };
  });
});
it('prepares a foreign-language pack from learning content before opening talk', async () => {
  renderHook(() => useLearningPacks(home(['en', 'de', 'en'])));
  await waitFor(() => expect(download).toHaveBeenCalledWith('en'));
  expect(fake.alert).not.toHaveBeenCalled();
});
it('ordinary German talk requires no pack', async () => {
  renderHook(() => useLearningPacks(home(['de-DE'], 'de')));
  await act(async () => {});
  expect(fake.state).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
  expect(fake.alert).not.toHaveBeenCalled();
});
it('foreign roleplay waits silently for Wi-Fi and unsubscribes on leaving', async () => {
  fake.fetch.mockResolvedValue({ isConnected: true, details: { isConnectionExpensive: true } });
  const { unmount } = renderHook(() => useLearningPacks(home([], 'fr')));
  await waitFor(() => expect(fake.fetch).toHaveBeenCalled());
  expect(download).not.toHaveBeenCalled();
  expect(fake.alert).not.toHaveBeenCalled();
  const wifi = { isConnected: true, details: { isConnectionExpensive: false } };
  fake.fetch.mockResolvedValue(wifi);
  act(() => fake.listener?.(wifi));
  await waitFor(() => expect(download).toHaveBeenCalledWith('fr'));
  unmount();
  expect(fake.listener).toBeNull();
});
