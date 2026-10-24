// requires live verification in Claude Code session (network and native dialog replaced)
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ fetch: vi.fn(), alert: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: fake.fetch } }));
vi.mock('react-native', () => ({ Alert: { alert: fake.alert } }));
vi.mock('../../api/outboxStorage.js', () => ({ readItem: fake.read, writeItem: fake.write }));
vi.mock('../../i18n/index.js', () => ({ i18n: { t: (key: string) => key } }));
import { mayDownloadPack } from '../packDownload.js';
const pack = (sha256: string) => ({ sha256, name: 'pack', bytes: 40_000_000 });
describe('silent pack network policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.read.mockResolvedValue(null);
  });
  it('downloads unmetered without a prompt and never starts while disconnected', async () => {
    fake.fetch.mockResolvedValueOnce({
      isConnected: true,
      details: { isConnectionExpensive: false },
    });
    expect(await mayDownloadPack(pack('unmetered'))).toBe(true);
    fake.fetch.mockResolvedValueOnce({ isConnected: false });
    expect(await mayDownloadPack(pack('offline'))).toBe(false);
    expect(fake.alert).not.toHaveBeenCalled();
  });
  it('never opens a native dialog for a first download on mobile data', async () => {
    fake.fetch.mockResolvedValue({ isConnected: true, details: { isConnectionExpensive: true } });
    fake.alert.mockImplementation((_title, _body, _buttons, options: { onDismiss: () => void }) =>
      options.onDismiss(),
    );
    expect(await mayDownloadPack(pack('first-use'))).toBe(false);
    expect(fake.alert).not.toHaveBeenCalled();
    expect(fake.write).not.toHaveBeenCalled();
  });
  it.each([null, { isConnectionExpensive: true }])(
    'waits silently on unknown or metered networks, ignoring old consent: %s',
    async (details) => {
      fake.fetch.mockResolvedValue({ isConnected: true, details });
      fake.read.mockResolvedValue('yes');
      expect(await mayDownloadPack(pack('saved'))).toBe(false);
      expect(fake.alert).not.toHaveBeenCalled();
    },
  );
});
