// requires live verification in Claude Code session (device recognition and recorder replaced)
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  handler: null as null | ((text: string, uri?: string) => Promise<void>),
  check: vi.fn(),
  start: vi.fn(),
  pack: vi.fn(),
  recPhase: 'idle' as 'idle' | 'recording',
  level: null as null | ((level: number, at: number) => void),
  stop: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
vi.mock('../../../lib/announce.js', () => ({ announce: vi.fn() }));
vi.mock('../../../lib/api/endpoints.js', () => ({ transcribe: vi.fn() }));
vi.mock('../../../lib/errors.js', () => ({ messageFor: () => '' }));
vi.mock('../../../lib/speech/listen.js', () => ({ stop: vi.fn() }));
vi.mock('../../../lib/perf.js', () => ({ dropped: vi.fn(), reacted: vi.fn(), tapped: vi.fn() }));
vi.mock('../../lb/Toast.js', () => ({ toast: { show: vi.fn() } }));
vi.mock('../../../lib/speech/pronunciation.js', () => ({
  pronunciationPacks: { state: fake.pack },
}));
vi.mock('../../../lib/speech/conversationPronunciation.js', () => ({
  checkConversationPronunciation: fake.check,
}));
vi.mock('../../../lib/speech/record.js', () => ({
  recorderMeters: true,
  useRecording: (opts: { onLevel: typeof fake.level }) => {
    fake.level = opts.onLevel;
    return {
      phase: fake.recPhase,
      start: vi.fn(),
      stop: fake.stop,
      cancel: vi.fn(),
      elapsedMs: 0,
      level: 0,
      maxMs: null,
      denied: null,
    };
  },
}));
vi.mock('../../../lib/speech/recognize.js', () => ({
  engineFor: async () => 'device',
  useDeviceRecognition: (handlers: { onText: typeof fake.handler }) => {
    fake.handler = handlers.onText;
    return { phase: 'idle', start: fake.start, stop: vi.fn(), heard: '', level: 0, elapsedMs: 0 };
  },
}));
import { useVoiceInput } from '../useVoiceInput.js';

describe('conversation input evidence and cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.recPhase = 'idle';
    fake.pack.mockResolvedValue({ state: 'ready', path: '/pack' });
  });
  it('requests a local recording only with a ready pack and delivers structured evidence with the unchanged transcript', async () => {
    const onText = vi.fn();
    const evidence = { words: [] };
    fake.check.mockResolvedValue(evidence);
    const { result } = renderHook(() =>
      useVoiceInput({ purpose: 'message', lang: 'en', untilPause: true, onText }),
    );
    act(() => result.current.toggle());
    await waitFor(() =>
      expect(fake.start).toHaveBeenCalledWith('en-GB', { untilPause: true, recordAudio: true }),
    );
    await act(async () => fake.handler?.('Help me', 'file:///take.wav'));
    expect(fake.check).toHaveBeenCalledWith('Help me', 'en', 'file:///take.wav');
    expect(onText).toHaveBeenCalledWith('Help me', evidence);
  });
  it('drops evidence and transcript after cancellation while Vosk is still running', async () => {
    const onText = vi.fn();
    let finish: () => void = () => {};
    fake.check.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useVoiceInput({ purpose: 'message', lang: 'en', untilPause: true, onText }),
    );
    let pending: Promise<void> | undefined;
    act(() => {
      pending = fake.handler?.('Hello', 'file:///take.wav');
    });
    act(() => result.current.cancel());
    await act(async () => {
      finish();
      await pending;
    });
    expect(onText).not.toHaveBeenCalled();
  });
  it('keeps the ordinary device transcript working without a pack or saved audio', async () => {
    const onText = vi.fn();
    fake.pack.mockResolvedValue({ state: 'missing' });
    const { result } = renderHook(() =>
      useVoiceInput({ purpose: 'message', lang: 'en', untilPause: true, onText }),
    );
    act(() => result.current.toggle());
    await waitFor(() =>
      expect(fake.start).toHaveBeenCalledWith('en-GB', { untilPause: true, recordAudio: false }),
    );
    await act(async () => fake.handler?.('Hello'));
    expect(onText).toHaveBeenCalledWith('Hello', undefined);
    expect(fake.check).not.toHaveBeenCalled();
  });
});

it('waits for room calibration before claiming that Talk is ready to listen', () => {
  fake.recPhase = 'recording';
  const { result } = renderHook(() =>
    useVoiceInput({ purpose: 'message', lang: 'de', untilPause: true, onText: vi.fn() }),
  );
  expect(result.current.state).toBe('starting');
  act(() => {
    for (let at = 0; at <= 600; at += 100) fake.level?.(0.02, at);
  });
  expect(result.current.state).toBe('recording');
  act(() => {
    for (let at = 700; at <= 1200; at += 100) fake.level?.(0.2, at);
    for (let at = 1300; at <= 1900; at += 100) fake.level?.(0.02, at);
    fake.level?.(0.02, 1950);
  });
  // Without a continuation buffer the legacy recorder keeps its conservative 1.6-s pause.
  expect(fake.stop).not.toHaveBeenCalled();
  act(() => fake.level?.(0.02, 2900));
  expect(fake.stop).toHaveBeenCalledOnce();
});
