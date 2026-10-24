// requires live verification in Claude Code session (native decoder and files replaced)
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  state: vi.fn(),
  checkPcm: vi.fn(),
  base64: vi.fn(),
  remove: vi.fn(),
  available: true,
}));
vi.mock('../pronunciation.js', () => ({ pronunciationPacks: { state: fake.state } }));
vi.mock('../voskNative.js', () => ({
  nativeVosk: () =>
    fake.available ? { checkPcm: fake.checkPcm, releaseCheckModel: vi.fn() } : null,
  pronunciationPcm: async (audio: string) => audio,
}));
vi.mock('expo-file-system', () => ({
  File: class {
    exists = true;
    size = 100;
    base64 = fake.base64;
    delete = fake.remove;
  },
}));
import {
  checkConversationPronunciation,
  removeRecognitionAudio,
} from '../conversationPronunciation.js';

describe('local conversation evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.available = true;
    fake.state.mockResolvedValue({ state: 'ready', path: '/pack' });
    fake.base64.mockResolvedValue('private');
    fake.checkPcm.mockResolvedValue(
      JSON.stringify({ words: [{ word: 'hello', conf: 1 }], unavailable: [] }),
    );
  });
  it('checks the same recording against exactly the phone transcript and returns no audio', async () => {
    const result = await checkConversationPronunciation('Hello!', 'en', 'file:///take.wav');
    expect(fake.checkPcm).toHaveBeenCalledWith('/pack', 'private', '["hello","[unk]"]');
    expect(result?.evidence.words).toEqual([{ heard: 'hello', confidence: 1 }]);
    expect(result).not.toHaveProperty('audio_base64');
  });
  it('quietly preserves the existing transcript path without a pack/module or on failure', async () => {
    fake.available = false;
    expect(await checkConversationPronunciation('Hello', 'en', 'file:///take.wav')).toBeUndefined();
    fake.available = true;
    fake.state.mockResolvedValueOnce({ state: 'missing' });
    expect(await checkConversationPronunciation('Hello', 'en', 'file:///take.wav')).toBeUndefined();
    expect(fake.base64).not.toHaveBeenCalled();
    fake.checkPcm.mockRejectedValueOnce(new Error('decoder'));
    expect(await checkConversationPronunciation('Hello', 'en', 'file:///take.wav')).toBeUndefined();
  });
  it('removes temporary recordings even when no transcript or evidence survived', () => {
    removeRecognitionAudio('file:///take.wav');
    expect(fake.remove).toHaveBeenCalledOnce();
    removeRecognitionAudio(null);
    expect(fake.remove).toHaveBeenCalledOnce();
  });
});
