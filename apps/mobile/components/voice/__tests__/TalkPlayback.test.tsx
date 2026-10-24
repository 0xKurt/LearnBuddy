// requires live verification in Claude Code session (speech and API boundaries replaced)
import { act, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
const fake = vi.hoisted(() => ({
  onText: null as null | ((text: string) => void),
  send: vi.fn(),
  speak: vi.fn(),
  stream: vi.fn(),
  feed: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock('../useVoiceInput.js', () => ({
  useVoiceInput: (opts: { onText: (text: string) => void; untilPause?: boolean }) => {
    fake.onText = opts.onText;
    return {
      state: 'idle',
      live: '',
      hint: null,
      denied: null,
      endsByItself: opts.untilPause,
      toggle: fake.toggle,
      cancel: vi.fn(),
      level: 0,
      elapsedMs: 0,
      maxMs: null,
    };
  },
}));
vi.mock('../../../lib/speech/listen.js', () => ({ speak: fake.speak, stop: vi.fn() }));
vi.mock('../../../lib/speech/streamSpeaker.js', () => ({ createStreamSpeaker: fake.stream }));
vi.mock('../../../lib/api/endpoints.js', () => ({ sendMessageStreamed: fake.send }));
vi.mock('../../../lib/api/queries.js', () => ({
  useHome: () => ({ data: { thread: [] } }),
  setHome: vi.fn(),
}));
vi.mock('../../../lib/api/client.js', () => ({ newId: () => 'turn-1' }));
vi.mock('../../../lib/buddy/useSceneLanguage.js', () => ({
  useSceneLanguage: () => 'de',
  sceneLanguage: () => 'de',
}));
vi.mock('../../../lib/speech/recognize.js', () => ({ warmRecognition: vi.fn() }));
vi.mock('../../../lib/speech/cues.js', () => ({ playCue: async () => undefined }));
vi.mock('../../../lib/speech/bargeMonitor.js', () => ({
  bargeSupported: false,
  useBargeMonitor: () => ({ release: () => null }),
}));
vi.mock('../../../lib/useScreenReader.js', () => ({ useScreenReader: () => false }));
vi.mock('../../../lib/speech/usePronunciation.js', () => ({ useLocalPronunciation: vi.fn() }));
vi.mock('../talkScene.js', () => ({
  sceneOf: () => null,
  carriesCard: () => false,
  talkTail: () => [],
  useEndScene: () => ({ end: vi.fn() }),
}));
vi.mock('../TalkStage.js', () => ({ TalkStage: () => null }));
vi.mock('../TalkTail.js', () => ({ TalkTail: () => null }));
vi.mock('../VoiceRow.js', () => ({ VoiceRow: () => null }));
vi.mock('../../../lib/capture/attachRequest.js', () => ({ attachInChat: vi.fn() }));
import TalkScreen from '../../../app/talk.js';
const reply = 'Ja, wir üben zusammen.';
const result = {
  status: 'done',
  home: {
    thread: [
      { role: 'learner', client_message_id: 'turn-1', text: 'Hallo' },
      { role: 'buddy', status: 'done', text: reply },
    ],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  fake.stream.mockReturnValue({ feed: fake.feed, cancel: vi.fn() });
});
it('starts speech as the talk reply streams and closes the same reading after storage', async () => {
  fake.send.mockImplementation(
    async (_text: string, _id: string, _attachment: null, onProgress: (e: unknown) => void) => {
      onProgress({ round: 0, speakable: true, text: reply, done: false });
      return result;
    },
  );
  renderInApp(<TalkScreen />);
  await act(async () => fake.onText?.('Hallo'));
  await waitFor(() => expect(fake.stream).toHaveBeenCalledOnce());
  expect(fake.feed).toHaveBeenCalledWith(reply, false);
  expect(fake.feed).toHaveBeenCalledWith(reply, true);
  expect(fake.speak).not.toHaveBeenCalled();
});
it('reads the stored talk reply even when no streaming events arrived', async () => {
  fake.send.mockResolvedValue(result);
  renderInApp(<TalkScreen />);
  await act(async () => fake.onText?.('Hallo'));
  await waitFor(() =>
    expect(fake.speak).toHaveBeenCalledWith(
      reply,
      'de',
      expect.objectContaining({ onEnd: expect.any(Function) }),
    ),
  );
  expect(fake.stream).not.toHaveBeenCalled();
});
