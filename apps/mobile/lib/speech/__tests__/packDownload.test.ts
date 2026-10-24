// requires live verification in Claude Code session (network and native confirmation replaced)
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ fetch: vi.fn(), alert: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: fake.fetch } }));
vi.mock('react-native', () => ({ Alert: { alert: fake.alert } }));
vi.mock('../../api/outboxStorage.js', () => ({ readItem: fake.read, writeItem: fake.write }));
vi.mock('../../i18n/index.js', () => ({ i18n: { t: (key: string) => key } }));
import { mayDownloadPack } from '../packDownload.js';
const pack = (sha256: string) => ({ sha256, name: 'pack', bytes: 40_000_000 });
describe('pack network consent', () => {
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
  it('asks once on an unknown/metered connection and remembers consent for the archive', async () => {
    fake.fetch.mockResolvedValue({ isConnected: true, details: null });
    fake.alert.mockImplementation((_title, _body, buttons: { onPress: () => void }[]) =>
      buttons[1]!.onPress(),
    );
    expect(await mayDownloadPack(pack('allowed'))).toBe(true);
    expect(await mayDownloadPack(pack('allowed'))).toBe(true);
    expect(fake.alert).toHaveBeenCalledOnce();
    expect(fake.write).toHaveBeenCalledWith('lb.pronunciation.download.allowed', 'yes');
    fake.read.mockResolvedValueOnce('yes');
    expect(await mayDownloadPack(pack('saved'))).toBe(true);
    expect(fake.alert).toHaveBeenCalledOnce();
  });
  it('does not nag after refusal or dismissal, but can later use an unmetered connection', async () => {
    fake.fetch.mockResolvedValue({ isConnected: true, details: { isConnectionExpensive: true } });
    fake.alert.mockImplementation((_title, _body, _buttons, options: { onDismiss: () => void }) =>
      options.onDismiss(),
    );
    expect(await mayDownloadPack(pack('refused'))).toBe(false);
    expect(await mayDownloadPack(pack('refused'))).toBe(false);
    expect(fake.alert).toHaveBeenCalledOnce();
    expect(fake.write).not.toHaveBeenCalled();
    fake.fetch.mockResolvedValueOnce({
      isConnected: true,
      details: { isConnectionExpensive: false },
    });
    expect(await mayDownloadPack(pack('refused'))).toBe(true);
  });
});
