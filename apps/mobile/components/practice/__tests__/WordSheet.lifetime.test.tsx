// #548 Speak lifecycle repro on base41b. Actual WordSheet/Sheet; only recording/audio
// and API edges are replaced. No database, result renderer or production lifecycle is mocked.
import type { SpeakWordResponse } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api/apiError.js';
import type { Recording } from '../../../lib/speech/record.js';
import errors from '../../../locales/de/errors.json';
import { renderInApp } from '../../../testing/render.js';
import { WordSheet, type SpokenWord } from '../WordSheet.js';

const outside = vi.hoisted(() => ({ speakWord: vi.fn(), stopAudio: vi.fn() }));
const recorder = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  onRecorded: null as ((recording: Recording) => void) | null,
}));
vi.mock('../../../lib/api/learningEndpoints.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  speakWord: outside.speakWord,
}));
vi.mock('../../../lib/speech/listen.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  stop: outside.stopAudio,
}));
vi.mock('../../../lib/speech/record.js', () => ({
  useRecording: ({ onRecorded }: { onRecorded: (recording: Recording) => void }) => {
    recorder.onRecorded = onRecorded;
    return {
      phase: 'idle',
      elapsedMs: 0,
      maxMs: 30_000,
      level: 0,
      denied: null,
      start: recorder.start,
      stop: recorder.stop,
      cancel: recorder.cancel,
    };
  },
}));

const SESSION = '55555555-5555-4555-8555-555555555555';
const ITEM = '44444444-4444-4444-8444-444444444444';
const WEATHER: SpokenWord = { text: 'weather', ok: false, tip: 'weather original tip' };
const TODAY: SpokenWord = { text: 'today', ok: true, tip: 'today original tip' };
const RECORDING: Recording = {
  uri: 'file:///tmp/word-take.m4a',
  mime: 'audio/m4a',
  durationMs: 2400,
  base64: 'a'.repeat(200),
};
const OLD: SpeakWordResponse = {
  audible: true,
  ok: true,
  heard: 'old weather take',
  tip: 'old weather response tip',
  help: null,
};
const CURRENT: SpeakWordResponse = {
  audible: true,
  ok: true,
  heard: 'current word take',
  tip: null,
  help: null,
};
function deferred() {
  let resolve!: (value: SpeakWordResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<SpeakWordResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function Parent({ sessionId = SESSION, itemId = ITEM }: { sessionId?: string; itemId?: string }) {
  const [word, setWord] = useState<SpokenWord | null>(WEATHER);
  return (
    <>
      <button onClick={() => setWord(WEATHER)}>Select weather</button>
      <button onClick={() => setWord(TODAY)}>Select today</button>
      <WordSheet
        word={word}
        sessionId={sessionId}
        itemId={itemId}
        lang="en"
        onClose={() => setWord(null)}
      />
    </>
  );
}
async function record() {
  const starts = recorder.start.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Dieses Wort sagen' }));
  expect(recorder.start).toHaveBeenCalledTimes(starts + 1);
  // The asynchronous checker finishes before the deliberately held API request starts.
  await act(async () => {
    recorder.onRecorded?.(RECORDING);
  });
}
function close() {
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  expect(recorder.cancel).toHaveBeenCalledTimes(1);
}
async function settle(request: ReturnType<typeof deferred>, outcome: 'resolve' | 'reject') {
  await act(async () => {
    if (outcome === 'resolve') request.resolve(OLD);
    else request.reject(new ApiError('network', 'outside transport failed', 0));
    await request.promise.catch(() => undefined);
  });
}
function expectNoStaleResult() {
  expect(screen.queryByText('old weather response tip')).toBeNull();
  expect(screen.queryByText(/old weather take/)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Dieses Wort sagen' }).getAttribute('aria-disabled'),
  ).not.toBe('true');
}
beforeEach(() => {
  outside.speakWord.mockReset();
  outside.stopAudio.mockClear();
  recorder.start.mockClear();
  recorder.stop.mockClear();
  recorder.cancel.mockClear();
  recorder.onRecorded = null;
});

describe.each(['resolve', 'reject'] as const)('held old request %s', (outcome) => {
  it('does not attribute the old word result to a different selected word', async () => {
    const held = deferred();
    outside.speakWord.mockReturnValueOnce(held.promise);
    renderInApp(<Parent />);
    await record();
    expect(outside.speakWord).toHaveBeenCalledWith(SESSION, {
      item_id: ITEM,
      word: 'weather',
      mime: RECORDING.mime,
      audio_base64: RECORDING.base64,
    });
    close();
    fireEvent.click(screen.getByText('Select today'));
    await settle(held, outcome);
    expect(screen.getByRole('heading', { name: 'today' })).toBeTruthy();
    expectNoStaleResult();
  });
  it('treats reopening the same word as a new visible panel lifetime', async () => {
    const held = deferred();
    outside.speakWord.mockReturnValueOnce(held.promise);
    renderInApp(<Parent />);
    await record();
    close();
    fireEvent.click(screen.getByText('Select weather'));
    await settle(held, outcome);
    expect(screen.getByRole('heading', { name: 'weather' })).toBeTruthy();
    expectNoStaleResult();
  });
  it.each([
    { sessionId: '66666666-6666-4666-8666-666666666666', itemId: ITEM },
    { sessionId: SESSION, itemId: '77777777-7777-4777-8777-777777777777' },
  ])(
    'does not cross a session/item identity replacement with the same word text: %j',
    async (context) => {
      const held = deferred();
      outside.speakWord.mockReturnValueOnce(held.promise);
      const view = renderInApp(<Parent />);
      await record();
      view.rerender(<Parent {...context} />);
      await settle(held, outcome);
      expectNoStaleResult();
    },
  );
  it('does not clear a held new attempt when the old request completes', async () => {
    const old = deferred();
    const current = deferred();
    outside.speakWord.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    renderInApp(<Parent />);
    await record();
    close();
    fireEvent.click(screen.getByText('Select today'));
    try {
      expect(
        screen.getByRole('button', { name: 'Dieses Wort sagen' }).getAttribute('aria-disabled'),
      ).not.toBe('true');
      await record();
      expect(outside.speakWord).toHaveBeenLastCalledWith(SESSION, {
        item_id: ITEM,
        word: 'today',
        mime: RECORDING.mime,
        audio_base64: RECORDING.base64,
      });
      await settle(old, outcome);
      expect(screen.queryByText('old weather response tip')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Buddy hört zu …' }).getAttribute('aria-disabled'),
      ).toBe('true');
      await act(async () => current.resolve(CURRENT));
      expect(screen.getByText(/current word take/)).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Dieses Wort sagen' }).getAttribute('aria-disabled'),
      ).not.toBe('true');
    } finally {
      await act(async () => {
        old.resolve(OLD);
        current.resolve(CURRENT);
      });
    }
  });
  it('does not affect a fresh mounted panel after unmount', async () => {
    const held = deferred();
    outside.speakWord.mockReturnValueOnce(held.promise);
    const old = renderInApp(<Parent />);
    await record();
    old.unmount();
    renderInApp(<Parent sessionId="66666666-6666-4666-8666-666666666666" />);
    await settle(held, outcome);
    expectNoStaleResult();
    expect(outside.speakWord).toHaveBeenCalledTimes(1);
  });
});

it('shows a legitimate current result with the exact word/audio payload', async () => {
  const held = deferred();
  outside.speakWord.mockReturnValueOnce(held.promise);
  renderInApp(<Parent />);
  await record();
  await act(async () => held.resolve(CURRENT));
  expect(screen.getByText('Das sitzt!')).toBeTruthy();
  expect(screen.getByText(/current word take/)).toBeTruthy();
  expect(outside.speakWord).toHaveBeenCalledTimes(1);
  expect(outside.speakWord).toHaveBeenCalledWith(SESSION, {
    item_id: ITEM,
    word: 'weather',
    mime: RECORDING.mime,
    audio_base64: RECORDING.base64,
  });
});
it('keeps a legitimate current transport error visible and retries the current word', async () => {
  const failed = deferred();
  const retried = deferred();
  outside.speakWord.mockReturnValueOnce(failed.promise).mockReturnValueOnce(retried.promise);
  renderInApp(<Parent />);
  await record();
  await act(async () => failed.reject(new ApiError('network', 'outside transport failed', 0)));
  expect(screen.getByRole('alert').textContent).toBe(errors.code.network);
  await record();
  expect(outside.speakWord).toHaveBeenCalledTimes(2);
  expect(outside.speakWord.mock.calls[1]).toEqual([
    SESSION,
    { item_id: ITEM, word: 'weather', mime: RECORDING.mime, audio_base64: RECORDING.base64 },
  ]);
  await act(async () => retried.resolve(CURRENT));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText(/current word take/)).toBeTruthy();
});

// The fixed help text by age (#785, CLAUDE.md rule 18): what the server sends, shown as sent.
const HELP = 'fixed help answer from the server';
it('shows the fixed help answer alone, in place of the tip, when nothing was judged', async () => {
  outside.speakWord.mockResolvedValueOnce({
    audible: false,
    ok: false,
    heard: '',
    tip: null,
    help: HELP,
  } satisfies SpeakWordResponse);
  renderInApp(<Parent />);
  await record();
  await act(async () => undefined);
  expect(screen.getByText(HELP)).toBeTruthy();
  expect(screen.queryByText('weather original tip')).toBeNull();
  expect(screen.queryByText(/Fast – hör es dir nochmal an/)).toBeNull();
  expect(screen.queryByText(/Gehört habe ich/)).toBeNull();
});
it('shows the fixed help line after a judgement no check could read', async () => {
  outside.speakWord.mockResolvedValueOnce({
    audible: true,
    ok: false,
    heard: 'wedder',
    tip: 'a tip for this take',
    help: HELP,
  } satisfies SpeakWordResponse);
  renderInApp(<Parent />);
  await record();
  await act(async () => undefined);
  expect(screen.getByText('a tip for this take')).toBeTruthy();
  expect(screen.getByText(/Fast – hör es dir nochmal an/)).toBeTruthy();
  expect(screen.getByText(/wedder/)).toBeTruthy();
  expect(screen.getByText(HELP)).toBeTruthy();
});

it('does not upload a take closed before the asynchronous checker returns', async () => {
  renderInApp(<Parent />);
  act(() => recorder.onRecorded?.(RECORDING));
  close();
  await act(async () => undefined);
  expect(outside.speakWord).not.toHaveBeenCalled();
});
