// The Hörtext pills (issue #210) on the one playback state (`usePlayback`, #311 slice 6): a tap
// fetches the recording and plays it, a second tap stops it, "Langsam" while it plays switches,
// leaving stops it and keeps nothing on the phone, and what could not be fetched or played is said.
// requires live verification in Claude Code session (the sound itself: the player and the request are replaced here)

import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type End = (why: 'done' | 'stopped' | 'error') => void;
type Played = { uri: string; onStart: () => void; onEnd: End; stopped: number };
const played: Played[] = [];
const released: string[] = [];
const asked: Array<{ slow: boolean; answer: (ok: boolean) => void }> = [];

vi.mock('../../../lib/api/endpoints.js', () => ({
  listenToItem: (_session: string, body: { item_id: string; slow?: boolean }) =>
    new Promise((resolve, reject) =>
      asked.push({
        slow: body.slow === true,
        answer: (ok) =>
          ok
            ? resolve({
                audio_base64: `${body.slow === true ? 'slow' : 'normal'}`,
                mime: 'audio/mpeg',
              })
            : reject(new Error('offline')),
      }),
    ),
}));
vi.mock('../../../lib/speech/naturalAudio.js', () => ({
  audioUri: (base64: string) => `file://${base64}`,
  releaseAudio: (uri: string) => released.push(uri),
}));
vi.mock('../../../lib/speech/naturalPlayer.js', () => ({
  playAudio: (uri: string, on: { onStart: () => void; onEnd: End }) => {
    const p: Played = { uri, onStart: on.onStart, onEnd: on.onEnd, stopped: 0 };
    played.push(p);
    return {
      stop: () => {
        p.stopped += 1;
        on.onEnd('stopped');
      },
    };
  },
}));

// What she is told; the toast's own rendering is the toast's test.
const told: string[] = [];
vi.mock('../../../lib/toast.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { show: (text: string) => told.push(text), dismiss: () => undefined },
}));

const { HearText } = await import('../HearText.js');
const { renderInApp } = await import('../../../testing/render.js');

let heard = 0;
const show = () =>
  renderInApp(<HearText sessionId="s1" itemId="i1" heard={false} onHeard={() => (heard += 1)} />);
const answer = async (ok = true) => {
  await act(async () => {
    asked.at(-1)?.answer(ok);
    await Promise.resolve();
  });
};

describe('HearText on the one playback (#311)', () => {
  beforeEach(() => {
    played.length = 0;
    released.length = 0;
    asked.length = 0;
    told.length = 0;
    heard = 0;
  });

  it('fetches, says "Anhalten" once it sounds, and stops on the second tap', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Hörtext abspielen' }));
    expect(asked).toMatchObject([{ slow: false }]);
    await answer();
    expect(played.map((p) => p.uri)).toEqual(['file://normal']);
    act(() => played[0]?.onStart());
    expect(heard).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Anhalten' }));
    expect(played[0]?.stopped).toBe(1);
    expect(released).toEqual(['file://normal']);
    expect(screen.getByRole('button', { name: 'Hörtext abspielen' })).toBeTruthy();
    expect(told).toEqual([]);
  });

  it('switches to the slower pass while the normal one plays', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Hörtext abspielen' }));
    await answer();
    act(() => played[0]?.onStart());
    fireEvent.click(screen.getByRole('button', { name: 'Langsam anhören' }));
    expect(played[0]?.stopped).toBe(1);
    expect(asked).toMatchObject([{ slow: false }, { slow: true }]);
    await answer();
    act(() => played[1]?.onStart());
    expect(played.map((p) => p.uri)).toEqual(['file://normal', 'file://slow']);
    // Only the pass that sounds says "Anhalten".
    expect(screen.getAllByRole('button', { name: 'Anhalten' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Hörtext abspielen' })).toBeTruthy();
  });

  it('says why when the recording could not be fetched, and is free again', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Hörtext abspielen' }));
    await answer(false);
    expect(played).toEqual([]);
    expect(told).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Hörtext abspielen' })).toBeTruthy();
  });

  it('says it when the recording arrived and still did not play', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Hörtext abspielen' }));
    await answer();
    act(() => played[0]?.onEnd('error'));
    expect(told).toEqual(['Der Hörtext lässt sich gerade nicht abspielen.']);
    expect(released).toEqual(['file://normal']);
    expect(screen.getByRole('button', { name: 'Hörtext abspielen' })).toBeTruthy();
  });

  it('stops what plays when the question goes away', async () => {
    const view = show();
    fireEvent.click(screen.getByRole('button', { name: 'Hörtext abspielen' }));
    await answer();
    act(() => played[0]?.onStart());
    view.unmount();
    expect(played[0]?.stopped).toBe(1);
    expect(released).toEqual(['file://normal']);
    expect(told).toEqual([]);
  });

  it('never plays a recording that arrives after she left, and keeps none of it', async () => {
    const view = show();
    fireEvent.click(screen.getByRole('button', { name: 'Hörtext abspielen' }));
    view.unmount();
    await answer();
    expect(played).toEqual([]);
    expect(released).toEqual(['file://normal']);
  });
});
