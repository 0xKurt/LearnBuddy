// The order of things while a text is read aloud (ADR 0008): which piece is fetched when,
// what plays next, when the phone's own voice takes over, and what is thrown away at the end.
// Pure (no React Native), unit-tested; lib/speech/listen.ts hands it the real fetching,
// playing and speaking.
//
// One text is one utterance — also when it arrives sentence by sentence while Buddy is still
// writing it (issue #24). So the audio of the next sentence is fetched **while the current one
// plays**, not after it. Measured 29.09. (`apps/api/evals/tts`): synthesising a sentence takes
// 0.74–1.6 s and a sentence plays 3–9 s, so one sentence ahead closes every gap; fetching more
// ahead gains nothing and makes the first piece a touch slower.

import { nextReadingParts, READING_START, type ReadingCursor } from './readAloud.js';
import type { VoiceStore } from './voiceState.js';

export type ListenEnd = 'done' | 'stopped' | 'error';

/** Where the audio of one piece can be played from; null = the phone must read it. */
export type Clip = { uri: string } | null;

export type PlayHandle = { stop: () => void };

export type PlayCallbacks = {
  start: () => void;
  progress: (progress: number | null) => void;
  /** 'error' = the player failed; 'stopped' = it was stopped from outside. */
  end: (why: 'done' | 'error' | 'stopped') => void;
};

export type DeviceCallbacks = { done: () => void; stopped: () => void; error: () => void };

/** The outside world of a reading: everything that touches the phone or the network. */
export type ReadingEffects = {
  /**
   * The audio of one piece. `ahead` = something else is playing, so it may take its time;
   * without it she is waiting in silence. Never rejects: null means the phone reads it.
   */
  fetch: (spoken: string, ahead: boolean) => Promise<Clip>;
  release: (uri: string) => void;
  play: (uri: string, on: PlayCallbacks) => PlayHandle;
  device: (spoken: string, on: DeviceCallbacks) => void;
};

export type Reading = {
  /** The text as far as it is written; `done` once it is complete. */
  feed: (text: string, done: boolean) => void;
  /** Ends it now; `onEnd` fires with `why`, once. */
  stop: (why: ListenEnd) => void;
  /** Whether it is still reading (nothing happens after it ended). */
  readonly running: boolean;
};

export function readText(opts: {
  effects: ReadingEffects;
  store: VoiceStore;
  /** What each sentence says (math in words, lib/speech/spoken.ts). */
  transform: (sentence: string) => string;
  /** More text may still come; running out of sentences then waits instead of ending. */
  growing: boolean;
  onEnd: (why: ListenEnd) => void;
}): Reading {
  const { effects, store, transform } = opts;
  let growing = opts.growing;
  let alive = true;
  let cursor: ReadingCursor = READING_START;
  let text = '';
  let sentences: string[] = [];
  const pieces: Array<{ at: number; spoken: string }> = [];
  const fetches = new Map<number, Promise<Clip>>();
  const ready = new Set<number>();
  let playing: PlayHandle | null = null;
  /** The piece that is playing or on its way. */
  let at = 0;
  /** Ran out of pieces and waits for the next one to be written. */
  let stalled = true;
  // Buddy's first sentence is not written yet: his voice is on its way, not idle.
  if (growing) store.set({ phase: 'loading', progress: null, source: null });

  /** The audio of piece i, fetched once. */
  function fetchClip(i: number, ahead: boolean): Promise<Clip> {
    const known = fetches.get(i);
    if (known) return known;
    const piece = pieces[i];
    // Not written yet: nothing is remembered, so it is really fetched once it is there.
    if (!piece) return Promise.resolve(null);
    const tracked = effects.fetch(piece.spoken, ahead).then((clip) => {
      ready.add(i);
      return clip;
    });
    fetches.set(i, tracked);
    return tracked;
  }

  function finish(why: ListenEnd): void {
    if (!alive) return;
    alive = false;
    const handle = playing;
    playing = null;
    handle?.stop();
    // Audio fetched ahead and never played is thrown away.
    for (const f of fetches.values()) void f.then((clip) => clip && effects.release(clip.uri));
    store.reset();
    opts.onEnd(why);
  }

  function playOnDevice(i: number): void {
    const piece = pieces[i];
    if (!piece) return;
    store.set({ phase: 'speaking', source: 'device', index: piece.at, progress: null });
    effects.device(piece.spoken, {
      done: () => playNext(i + 1),
      stopped: () => finish('stopped'),
      error: () => finish('error'),
    });
  }

  function playNext(i: number): void {
    if (!alive) return;
    at = i;
    const piece = pieces[i];
    if (!piece) {
      // Nothing more to say yet: wait for the next sentence instead of ending — Buddy is
      // still writing. `feed` picks it up again.
      if (growing) {
        stalled = true;
        store.set({ phase: 'loading', progress: null });
        return;
      }
      finish('done');
      return;
    }
    stalled = false;
    // "Loading" only while the audio is really still on its way.
    if (!ready.has(i)) store.set({ phase: 'loading', index: piece.at, progress: null });
    void fetchClip(i, false).then((clip) => {
      if (!alive) return;
      void fetchClip(i + 1, true); // The next sentence arrives while this one plays.
      if (!clip) {
        playOnDevice(i);
        return;
      }
      store.set({ index: piece.at, progress: null });
      playing = effects.play(clip.uri, {
        start: () => {
          if (alive) store.set({ phase: 'speaking', source: 'natural', progress: 0 });
        },
        progress: (progress) => {
          if (alive) store.set({ progress });
        },
        end: (why) => {
          effects.release(clip.uri);
          if (!alive || why === 'stopped') return;
          playing = null;
          if (why === 'done') {
            playNext(i + 1);
            return;
          }
          // The player failed: the phone reads this sentence (the caller rests the natural
          // voice for a while).
          playOnDevice(i);
        },
      });
    });
  }

  return {
    feed(next, done) {
      if (!alive) return;
      const r = nextReadingParts(next, done, cursor, transform);
      cursor = r.cursor;
      text = next;
      if (done) growing = false;
      // A sentence with nothing to say ("$$") is counted too, so the numbers stay those of
      // the finished text — that is what read-along highlights by.
      if (r.sentences.length > 0) sentences = [...sentences, ...r.sentences];
      for (const p of r.parts) for (const spoken of p.spoken) pieces.push({ at: p.at, spoken });
      // Only at a sentence boundary, not for every few characters of a reply being written.
      if (r.sentences.length > 0 || done) store.set({ text, sentences });
      if (!stalled) {
        // A sentence written while the one before it plays is fetched straight away.
        if (ready.has(at)) void fetchClip(at + 1, true);
        return;
      }
      if (pieces[at]) {
        playNext(at);
        return;
      }
      if (!growing) finish('done'); // Nothing to say at all, or the last sentence was read.
    },
    stop(why) {
      finish(why);
    },
    get running() {
      return alive;
    },
  };
}
