// @vitest-environment jsdom
// requires live verification in Claude Code session (native recognizer events replaced)
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  events: new Map<string, (event: unknown) => void>(),
  start: vi.fn(),
  remove: vi.fn(),
  supportsRecording: false,
}));
vi.mock('expo-localization', () => ({ getLocales: () => [] }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: vi.fn() } }));
vi.mock('../conversationPronunciation.js', () => ({ removeRecognitionAudio: fake.remove }));
vi.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    getPermissionsAsync: async () => ({ granted: true }),
    getSupportedLocales: async () => ({ installedLocales: ['en-GB'] }),
    getSpeechRecognitionServices: () => [],
    supportsRecording: () => fake.supportsRecording,
    start: fake.start,
    stop: vi.fn(),
    abort: vi.fn(),
  },
  useSpeechRecognitionEvent: (name: string, handler: (event: unknown) => void) =>
    fake.events.set(name, handler),
}));
import { useDeviceRecognition } from '../recognize.js';
const emit = (name: string, event?: unknown) => fake.events.get(name)?.(event);
const handlers = () => ({ maxMs: 30_000, onText: vi.fn(), onFallback: vi.fn(), onFailed: vi.fn() });
describe('phone recognizer recording capability and lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.supportsRecording = false;
  });
  afterEach(cleanup);
  it('keeps recognition on-device without requesting unsupported audio retention', async () => {
    const h = handlers();
    const { result } = renderHook(() => useDeviceRecognition(h));
    await act(async () => result.current.start('en-GB', { recordAudio: true }));
    expect(fake.start).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresOnDeviceRecognition: true,
        recordingOptions: expect.objectContaining({ persist: false }),
      }),
    );
    expect(h.onFallback).not.toHaveBeenCalled();
  });
  it('hands over the finished recording with its transcript and deletes it after checking', async () => {
    fake.supportsRecording = true;
    const h = handlers();
    let finish: () => void = () => {};
    h.onText.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useDeviceRecognition(h));
    await act(async () => result.current.start('en-GB', { recordAudio: true }));
    expect(fake.start).toHaveBeenCalledWith(
      expect.objectContaining({ recordingOptions: expect.objectContaining({ persist: true }) }),
    );
    act(() => {
      emit('result', { results: [{ transcript: 'Hello' }], isFinal: true });
      emit('audioend', { uri: 'file:///take.wav' });
      emit('end');
    });
    expect(h.onText).toHaveBeenCalledWith('Hello', 'file:///take.wav');
    expect(fake.remove).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(fake.remove).toHaveBeenCalledWith('file:///take.wav');
  });
  it('deletes an interrupted recording without delivering its transcript', async () => {
    fake.supportsRecording = true;
    const h = handlers();
    const { result } = renderHook(() => useDeviceRecognition(h));
    await act(async () => result.current.start('en-GB', { recordAudio: true }));
    act(() => {
      emit('result', { results: [{ transcript: 'Hello' }], isFinal: true });
      emit('error', { error: 'aborted' });
      emit('audioend', { uri: 'file:///interrupted.wav' });
      emit('end');
    });
    expect(h.onText).not.toHaveBeenCalled();
    expect(fake.remove).toHaveBeenCalledWith('file:///interrupted.wav');
  });
});
