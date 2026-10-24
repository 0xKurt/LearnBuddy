// requires live verification in Claude Code session (transcription transport replaced)
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ transcribe: vi.fn() }));
vi.mock('../../../lib/api/endpoints.js', () => ({ transcribe: fake.transcribe }));
import { useConversationCapture } from '../../../lib/speech/useConversationCapture.js';

beforeEach(() => fake.transcribe.mockReset());
it('captures a continuation during transcription, sends ordered separate texts and fences the old text', async () => {
  let first!: (value: { text: string }) => void;
  let progress!: (value: { text: string }) => void;
  fake.transcribe.mockImplementationOnce(
    (_request: unknown, opts?: { onProgress: typeof progress }) => {
      progress = opts?.onProgress ?? (() => undefined);
      return new Promise((resolve) => {
        first = resolve;
      });
    },
  );
  fake.transcribe.mockResolvedValueOnce({ text: 'und Englisch' });
  const onText = vi.fn();
  const onStart = vi.fn();
  const onLive = vi.fn();
  const { result } = renderHook(() =>
    useConversationCapture({
      lang: 'de',
      onText,
      onStart,
      onLive,
      onPending: vi.fn(),
      onFailed: vi.fn(),
    }),
  );
  act(() => result.current.begin());
  function feed(from: number, to: number) {
    act(() => {
      for (let i = from; i < to; i++) {
        result.current.stream.data(Uint8Array.of(0xff, 0xf1, 0x60, 0x40, 1, 0x1f, 0xfc, i));
        result.current.stream.meter(
          (i >= 16 && i < 24) || (i >= 40 && i < 48) ? -30 : -65,
          (i + 1) * 64,
        );
      }
    });
  }
  feed(0, 36);
  await waitFor(() => expect(fake.transcribe).toHaveBeenCalledOnce());
  act(() => progress({ text: 'Mathe …' }));
  expect(onLive).toHaveBeenLastCalledWith('Mathe …');
  onLive.mockClear();
  feed(36, 70);
  act(() => progress({ text: 'old progress' }));
  expect(onLive).not.toHaveBeenCalled();
  expect(onStart).toHaveBeenCalledTimes(2);
  expect(fake.transcribe).toHaveBeenCalledOnce();
  await act(async () => first({ text: 'Mathe' }));
  await waitFor(() => expect(onText).toHaveBeenCalledTimes(2));
  expect(onText.mock.calls.map((c) => c[0])).toEqual(['Mathe', 'und Englisch']);
  expect(onText.mock.calls[0]![1]()).toBe(false);
  expect(onText.mock.calls[1]![1]()).toBe(true);
  expect(fake.transcribe.mock.calls[1]![0]).toMatchObject({
    mime: 'audio/aac',
    prev_tail: 'Mathe',
  });
});
it('drops a pending transcript on leaving and does not send queued continuation audio', async () => {
  let first!: (value: { text: string }) => void;
  fake.transcribe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        first = resolve;
      }),
  );
  const onText = vi.fn();
  const { result } = renderHook(() =>
    useConversationCapture({
      lang: 'de',
      onText,
      onStart: vi.fn(),
      onPending: vi.fn(),
      onFailed: vi.fn(),
    }),
  );
  act(() => {
    result.current.begin();
    for (let i = 0; i < 70; i++) {
      result.current.stream.data(Uint8Array.of(0xff, 0xf1, 0x60, 0x40, 1, 0x1f, 0xfc, i));
      result.current.stream.meter(
        (i >= 16 && i < 24) || (i >= 40 && i < 48) ? -30 : -65,
        (i + 1) * 64,
      );
    }
  });
  await waitFor(() => expect(fake.transcribe).toHaveBeenCalledOnce());
  act(() => result.current.cancel());
  await act(async () => first({ text: 'old' }));
  expect(onText).not.toHaveBeenCalled();
  expect(fake.transcribe).toHaveBeenCalledOnce();
});
