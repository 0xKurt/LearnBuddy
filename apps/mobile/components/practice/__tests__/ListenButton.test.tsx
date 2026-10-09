// The one listen control (#311 step 2) with each of its sources: words, tones (#445) and a
// question's recording (the Hörtext #210, the Diktat #242). The same states for all — ready
// ("Anhören" / "Nochmal hören"), loading ("Lädt …"), playing ("Anhalten"), and a sound that could
// not be made is said and leaves it ready again; "Langsam" is the same listening, sharing its state.
// requires live verification in Claude Code session (the sound itself: expo-audio, the phone's voice and the request are replaced here)

import type { HeardTones, ItemView } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type End = (why: 'done' | 'stopped' | 'error') => void;

// Tones: the app's own seam (`lib/music/play.ts`); under it is expo-audio.
const lines: Array<{ bars: unknown; tempo: number; onEnd: End | undefined }> = [];
let noteStops = 0;
vi.mock('../../../lib/music/play.js', () => ({
  playPitch: () => ({ stop: () => undefined }),
  playLine: (bars: unknown, tempo: number, onEnd?: End) => {
    lines.push({ bars, tempo, onEnd });
    return { stop: () => undefined };
  },
  stopNotes: () => {
    noteStops += 1;
  },
}));

// Words: the phone's or Buddy's voice (`lib/speech/listen.ts`).
const spoken: Array<{ text: string; lang: string; slow: boolean; onEnd: End | undefined }> = [];
let voiceStops = 0;
vi.mock('../../../lib/speech/listen.js', () => ({
  speak: (text: string, lang: string, opts: { slow?: boolean; onEnd?: End }) => {
    spoken.push({ text, lang, slow: opts.slow === true, onEnd: opts.onEnd });
    return Promise.resolve();
  },
  stop: () => {
    voiceStops += 1;
  },
}));

// A recording: the request and the player.
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
            ? resolve({ audio_base64: body.slow === true ? 'slow' : 'normal', mime: 'audio/mpeg' })
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

const { ListenButton } = await import('../ListenButton.js');
const { QuestionTools } = await import('../QuestionTools.js');
const { renderInApp } = await import('../../../testing/render.js');

const THIRD: HeardTones = {
  bars: [
    [
      { el: 'note', pitch: { name: 'E', octave: 4 }, value: 'half', dotted: false },
      { el: 'note', pitch: { name: 'G', octave: 4 }, value: 'half', dotted: false },
    ],
  ],
  tempo: 80,
};

const button = (name: string) => screen.getByRole('button', { name });
const tap = (name: string) => fireEvent.click(button(name));

beforeEach(() => {
  lines.length = 0;
  spoken.length = 0;
  played.length = 0;
  released.length = 0;
  asked.length = 0;
  told.length = 0;
  noteStops = 0;
  voiceStops = 0;
});

describe('ListenButton: words', () => {
  it('reads the words in their language, says "Anhalten" while it reads, and stops', () => {
    renderInApp(<ListenButton source={{ text: 'bonjour', lang: 'fr' }} slow />);
    expect(button('Anhören').textContent).toBe('Anhören');
    // The slower pass: the short word for the eye, the whole action for the ear.
    expect(button('Langsam anhören').textContent).toBe('Langsam');
    tap('Anhören');
    expect(spoken).toMatchObject([{ text: 'bonjour', lang: 'fr', slow: false }]);
    tap('Anhalten');
    expect(voiceStops).toBe(1);
    expect(button('Anhören')).toBeTruthy();
  });

  it('switches to the slower pass, sharing one state: only the running pass says "Anhalten"', () => {
    renderInApp(<ListenButton source={{ text: 'bonjour', lang: 'fr' }} slow />);
    tap('Anhören');
    tap('Langsam anhören');
    expect(voiceStops).toBe(1);
    expect(spoken.map((s) => s.slow)).toEqual([false, true]);
    expect(screen.getAllByRole('button', { name: 'Anhalten' })).toHaveLength(1);
    expect(button('Anhören')).toBeTruthy();
  });

  it('says it when no voice could read it, and is ready again', () => {
    renderInApp(<ListenButton source={{ text: 'bonjour', lang: 'fr' }} />);
    tap('Anhören');
    act(() => spoken[0]?.onEnd?.('error'));
    expect(told).toEqual([
      'Vorlesen klappt auf diesem Gerät gerade nicht – vielleicht fehlt die Stimme für diese Sprache.',
    ]);
    expect(button('Anhören')).toBeTruthy();
  });

  it('cannot be tapped without words or while disabled', () => {
    renderInApp(<ListenButton source={{ text: '  ', lang: 'fr' }} />);
    expect(button('Anhören').getAttribute('aria-disabled')).toBe('true');
  });
});

describe('ListenButton: tones (#445)', () => {
  it('plays exactly the tones it was given, and stops on the second tap', () => {
    renderInApp(<ListenButton source={{ tones: THIRD }} />);
    tap('Anhören');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ bars: THIRD.bars, tempo: 80 });
    tap('Anhalten');
    expect(noteStops).toBe(1);
    expect(button('Anhören')).toBeTruthy();
  });

  it('is free again when the tones have sounded, and says it when none came out', () => {
    renderInApp(<ListenButton source={{ tones: THIRD }} />);
    tap('Anhören');
    act(() => lines[0]?.onEnd?.('done'));
    expect(button('Anhören')).toBeTruthy();
    expect(told).toEqual([]);
    tap('Anhören');
    act(() => lines[1]?.onEnd?.('error'));
    expect(told).toEqual(['Hier kommt gerade kein Ton heraus.']);
    expect(button('Anhören')).toBeTruthy();
  });

  it('beside a note line, it is the speaker alone and still named for the ear', () => {
    renderInApp(<ListenButton source={{ tones: THIRD }} speakerOnly />);
    expect(button('Anhören').textContent).toBe('');
    tap('Anhören');
    expect(button('Anhalten')).toBeTruthy();
  });

  it('stops what it plays when the question goes away', () => {
    const view = renderInApp(<ListenButton source={{ tones: THIRD }} />);
    tap('Anhören');
    view.unmount();
    expect(noteStops).toBe(1);
  });
});

describe('ListenButton: a recording (Hörtext #210, Diktat #242)', () => {
  let heard = 0;
  const show = (opts: { heard?: boolean } = {}) =>
    renderInApp(
      <ListenButton
        source={{ item: { sessionId: 's1', itemId: 'i1', onHeard: () => (heard += 1) } }}
        slow
        heard={opts.heard ?? false}
      />,
    );
  const answer = async (ok = true) => {
    await act(async () => {
      asked.at(-1)?.answer(ok);
      await Promise.resolve();
    });
  };
  beforeEach(() => {
    heard = 0;
  });

  it('says "Nochmal hören" once she heard it before', () => {
    show({ heard: true });
    expect(button('Nochmal hören')).toBeTruthy();
  });

  it('loads, says "Anhalten" once it sounds, and stops on the second tap', async () => {
    show();
    tap('Anhören');
    expect(asked).toMatchObject([{ slow: false }]);
    // Loading: the words say it, and the other pass waits.
    expect(button('Lädt …').querySelector('[role="progressbar"]')).not.toBeNull();
    expect(button('Langsam anhören').getAttribute('aria-disabled')).toBe('true');
    await answer();
    expect(played.map((p) => p.uri)).toEqual(['file://normal']);
    act(() => played[0]?.onStart());
    expect(heard).toBe(1);
    tap('Anhalten');
    expect(played[0]?.stopped).toBe(1);
    expect(released).toEqual(['file://normal']);
    expect(button('Anhören')).toBeTruthy();
    expect(told).toEqual([]);
  });

  it('switches to the slower pass while the normal one plays', async () => {
    show();
    tap('Anhören');
    await answer();
    act(() => played[0]?.onStart());
    tap('Langsam anhören');
    expect(played[0]?.stopped).toBe(1);
    expect(asked).toMatchObject([{ slow: false }, { slow: true }]);
    await answer();
    act(() => played[1]?.onStart());
    expect(played.map((p) => p.uri)).toEqual(['file://normal', 'file://slow']);
    expect(screen.getAllByRole('button', { name: 'Anhalten' })).toHaveLength(1);
    expect(button('Anhören')).toBeTruthy();
  });

  it('says why when the recording could not be fetched, and is ready again', async () => {
    show();
    tap('Anhören');
    await answer(false);
    expect(played).toEqual([]);
    expect(told).toHaveLength(1);
    expect(button('Anhören')).toBeTruthy();
  });

  it('says it when the recording arrived and still did not play', async () => {
    show();
    tap('Anhören');
    await answer();
    act(() => played[0]?.onEnd('error'));
    expect(told).toEqual(['Der Hörtext lässt sich gerade nicht abspielen.']);
    expect(released).toEqual(['file://normal']);
    expect(button('Anhören')).toBeTruthy();
  });

  it('stops what plays when the question goes away', async () => {
    const view = show();
    tap('Anhören');
    await answer();
    act(() => played[0]?.onStart());
    view.unmount();
    expect(played[0]?.stopped).toBe(1);
    expect(released).toEqual(['file://normal']);
    expect(told).toEqual([]);
  });

  it('never plays a recording that arrives after she left, and keeps none of it', async () => {
    const view = show();
    tap('Anhören');
    view.unmount();
    await answer();
    expect(played).toEqual([]);
    expect(released).toEqual(['file://normal']);
  });
});

describe('QuestionTools: the Hörtext of one question (#513)', () => {
  // Three questions about one recording share its ref (`ListenRef`); each is still its own question.
  const question = (id: string): ItemView => ({
    id,
    kind: 'short',
    prompt: 'Wohin fährt Lea?',
    choices: null,
    unit: null,
    topic: 'Hörverstehen',
    origin: 'typed',
    lang: 'de',
    prompt_lang: 'de',
    subject_kind: null,
    figure: null,
    choice_figures: null,
    image: null,
    tap_choices: null,
    surface: null,
    tap: false,
    task_view: null,
    listen: { ref: 'h1' },
    tones: null,
    passage: null,
    task_part: null,
    read_aloud: false,
  });
  const tools = (id: string) => (
    <QuestionTools
      item={question(id)}
      sessionId="s1"
      hearWord={false}
      heard={() => false}
      markHeard={() => undefined}
      disabled={false}
    />
  );

  it('stops the text when she moves on to the next question', async () => {
    const view = renderInApp(tools('i1'));
    tap('Anhören');
    await act(async () => {
      asked.at(-1)?.answer(true);
      await Promise.resolve();
    });
    act(() => played[0]?.onStart());
    view.rerender(tools('i2'));
    expect(played[0]?.stopped).toBe(1);
    expect(button('Anhören')).toBeTruthy();
  });
});
