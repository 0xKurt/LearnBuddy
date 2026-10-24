// requires live verification in Claude Code session (native bridge and storage replaced)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkedPronunciationPlan } from '@learnbuddy/shared-types/contracts';

const bridge = vi.hoisted(() => ({ checkPcm: vi.fn(), releaseCheckModel: vi.fn() }));
const ready = vi.hoisted(() => vi.fn());
vi.stubGlobal('__DEV__', false);
vi.mock('../packDownload.js', () => ({ mayDownloadPack: async () => true }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../voskNative.js', () => ({
  nativeVosk: () => bridge,
  pronunciationPcm: async () => 'pcm',
}));
vi.mock('../pronunciationPackStorage.js', () => ({ pronunciationPackStorage: { ready } }));
import { pronunciationSubmission } from '../pronunciation.js';

const item = { pronunciation_plan: checkedPronunciationPlan('Three.', 'en', [['free']]) };
const audio = { mime: 'audio/m4a' as const, audio_base64: 'private-recording' };
const recognized = (word: string, conf: number) =>
  JSON.stringify({ words: [{ word, conf }], unavailable: [] });

describe('Android pronunciation with disclosed audio fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ready.mockResolvedValue('/pack');
  });
  it('uses the installed native pack in release builds without uploading a reliable take', async () => {
    bridge.checkPcm.mockResolvedValue(recognized('three', 1));
    const submission = await pronunciationSubmission(item, audio, true);
    expect(submission).not.toHaveProperty('audio_base64');
    expect(submission.evidence?.words).toEqual([{ heard: 'three', confidence: 1 }]);
  });
  it.each([
    ['three', 0.5],
    ['free', 1],
    ['[unk]', 1],
  ])('sends original audio for uncertain %s (%s)', async (word, confidence) => {
    bridge.checkPcm.mockResolvedValue(recognized(word, confidence));
    expect(await pronunciationSubmission(item, audio, true)).toEqual(audio);
  });
  it('sends the original sentence when extra speech makes otherwise certain words uncertain', async () => {
    bridge.checkPcm.mockResolvedValue(
      JSON.stringify({
        words: [
          { word: 'three', conf: 1 },
          { word: 'extra', conf: 1 },
        ],
        unavailable: [],
      }),
    );
    expect(await pronunciationSubmission(item, audio, true)).toEqual(audio);
  });
  it('falls back when its pack disappears or the decoder fails', async () => {
    ready.mockResolvedValueOnce(null);
    expect(await pronunciationSubmission(item, audio, true)).toEqual(audio);
    bridge.checkPcm.mockRejectedValueOnce(new Error('native_failure'));
    expect(await pronunciationSubmission(item, audio, true)).toEqual(audio);
  });
  it('never uploads after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(pronunciationSubmission(item, audio, true, controller.signal)).rejects.toThrow(
      'cancelled',
    );
  });
  it('uses audio directly when no local checker was selected', async () => {
    expect(await pronunciationSubmission(item, audio, false)).toEqual(audio);
    expect(bridge.checkPcm).not.toHaveBeenCalled();
  });
});
