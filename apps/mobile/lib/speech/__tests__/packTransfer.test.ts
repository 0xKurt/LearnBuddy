// requires live verification in Claude Code session (native transfer and network replaced)
import { beforeEach, expect, it, vi } from 'vitest';
import type { NetInfoState } from '@react-native-community/netinfo';
const fake = vi.hoisted(() => ({
  fetch: vi.fn(),
  download: vi.fn(),
  cancel: vi.fn(),
  unsubscribe: vi.fn(),
  listener: undefined as undefined | ((net: NetInfoState) => void),
}));
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: fake.fetch,
    addEventListener: (listener: typeof fake.listener) => {
      fake.listener = listener;
      return fake.unsubscribe;
    },
  },
}));
vi.mock('expo-file-system', () => ({
  File: class {
    static downloadFileAsync = fake.download;
  },
}));
vi.mock('expo-file-system/legacy', () => ({
  createDownloadResumable: () => ({
    downloadAsync: fake.download,
    cancelAsync: fake.cancel,
  }),
}));
import { downloadPack } from '../packTransfer.js';
const network = (isConnected: boolean, expensive?: boolean) =>
  ({
    isConnected,
    details: { isConnectionExpensive: expensive },
  }) as NetInfoState;
beforeEach(() => {
  vi.resetAllMocks();
  fake.listener = undefined;
  fake.fetch.mockResolvedValue(network(true, false));
  fake.cancel.mockResolvedValue(undefined);
});
it.each([network(true, true), network(false, false), network(true)])(
  'cancels an active transfer when the network is no longer explicitly unmetered: %s',
  async (net) => {
    let finish!: (result: { status: number }) => void;
    fake.download.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const transfer = downloadPack('https://example.test/model.zip', 'file:///model.zip');
    await vi.waitFor(() => expect(fake.download).toHaveBeenCalledOnce());
    fake.listener?.(net);
    finish({ status: 200 });
    await expect(transfer).rejects.toThrow('model_network_changed');
    expect(fake.cancel).toHaveBeenCalledOnce();
    expect(fake.unsubscribe).toHaveBeenCalledOnce();
  },
);
it('waits before starting on an unknown connection', async () => {
  fake.fetch.mockResolvedValue(network(true));
  await expect(downloadPack('url', 'uri')).rejects.toThrow('model_network_changed');
  expect(fake.download).not.toHaveBeenCalled();
  expect(fake.unsubscribe).toHaveBeenCalledOnce();
});
it('releases its listener after success and after a transfer failure', async () => {
  fake.download.mockResolvedValueOnce({ status: 200 }).mockRejectedValueOnce(new Error('offline'));
  await downloadPack('url', 'uri');
  expect(fake.cancel).not.toHaveBeenCalled();
  await expect(downloadPack('url', 'uri')).rejects.toThrow('offline');
  expect(fake.unsubscribe).toHaveBeenCalledTimes(2);
});
it('does not let a stale fetch restart a transfer blocked by a newer network event', async () => {
  let resolve!: (net: NetInfoState) => void;
  fake.fetch.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const transfer = downloadPack('url', 'uri');
  fake.listener?.(network(true, true));
  fake.listener?.(network(true, false));
  resolve(network(true, false));
  await expect(transfer).rejects.toThrow('model_network_changed');
  expect(fake.download).not.toHaveBeenCalled();
  expect(fake.cancel).toHaveBeenCalledOnce();
  expect(fake.unsubscribe).toHaveBeenCalledOnce();
});
it.each([undefined, { status: 500 }])('rejects an incomplete download: %s', async (result) => {
  fake.download.mockResolvedValue(result);
  await expect(downloadPack('url', 'uri')).rejects.toThrow('model_download_failed');
  expect(fake.unsubscribe).toHaveBeenCalledOnce();
});
it('also cancels on cellular networks that report an unmetered plan', async () => {
  let finish!: (result: { status: number }) => void;
  fake.download.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const transfer = downloadPack('url', 'uri');
  await vi.waitFor(() => expect(fake.download).toHaveBeenCalledOnce());
  fake.listener?.({ ...network(true, false), type: 'cellular' } as NetInfoState);
  finish({ status: 200 });
  await expect(transfer).rejects.toThrow('model_network_changed');
  expect(fake.cancel).toHaveBeenCalledOnce();
  expect(fake.unsubscribe).toHaveBeenCalledOnce();
});
