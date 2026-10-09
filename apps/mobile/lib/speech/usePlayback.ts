// The one play/stop state of the app's listen controls (issue #311, slice 6). Every "Anhören" —
// words in their language, tones the app makes (`useListenToggle`), the Hörtext and the Diktat the
// server records (`useHearText`) — is a sound that is asked for, may take a moment, sounds, and
// ends. What that means for her is the same everywhere, so it lives here once:
//
//   · a tap on what is running stops it; a tap on another one (the slower pass) switches;
//   · going away mid-sound (next question, leaving) stops it;
//   · a sound that could not be made is said, never left in silence;
//   · the end of a sound that was already stopped or replaced changes nothing.
//
// Where the sound comes from is the caller's: a `PlaybackSource` starts it and hands back how to
// stop it. Buddy's own voice (reading a message, the voice sample) keeps its state in
// `voiceStore` — that is the voice's, shared by every screen, not a control's.

import { useEffect, useRef, useState } from 'react';

import { messageFor } from '../errors.js';
import { toast, type ToastTone } from '../toast.js';
import { useMounted } from '../useMounted.js';
import type { ListenEnd } from './pipeline.js';

/** What a source reports back while it plays. */
type PlaybackRun = {
  /** Still wanted: on screen, and not stopped or replaced since it was asked for. */
  live: () => boolean;
  /** Sound really started (a source that fetches first calls this once it plays). */
  started: () => void;
  ended: (why: ListenEnd) => void;
};

/**
 * Starts one sound and returns how to stop it — null when nothing is left to stop (it ended at
 * once, or was not wanted any more). A source that throws, or rejects, failed to fetch it.
 */
type PlaybackSource = (run: PlaybackRun) => Stop | null | Promise<Stop | null>;
type Stop = () => void;

/** What she is told when the sound itself could not be made. */
type PlaybackFailed = { text: string; tone: ToastTone };

export function usePlayback<K extends string>(failed: PlaybackFailed) {
  const mounted = useMounted();
  /** Which sound is asked for (fetching or sounding); null = none. */
  const [busy, setBusy] = useState<K | null>(null);
  /** Which sound is really sounding. */
  const [playing, setPlaying] = useState<K | null>(null);
  const current = useRef<{ key: K; stop: Stop | null } | null>(null);
  const failedRef = useRef(failed);
  failedRef.current = failed;

  useEffect(
    () => () => {
      current.current?.stop?.();
      current.current = null;
    },
    [],
  );

  function clear(): void {
    current.current = null;
    setPlaying(null);
    setBusy(null);
  }

  function stop(): void {
    const run = current.current;
    clear();
    run?.stop?.();
  }

  /** Tapping what runs stops it; tapping another one switches to it. */
  function toggle(key: K, source: PlaybackSource): void {
    const running = current.current?.key ?? null;
    if (running !== null) stop();
    if (running === key) return;

    const run: { key: K; stop: Stop | null } = { key, stop: null };
    current.current = run;
    setBusy(key);
    const live = (): boolean => mounted.current && current.current === run;
    const attach = (stopIt: Stop | null): void => {
      if (live()) run.stop = stopIt;
    };
    const fetchFailed = (err: unknown): void => {
      if (live()) clear();
      toast.show(messageFor(err), 'error');
    };

    let started: ReturnType<PlaybackSource>;
    try {
      started = source({
        live,
        started: () => {
          if (live()) setPlaying(key);
        },
        ended: (why) => {
          if (!live()) return;
          clear();
          if (why === 'error') toast.show(failedRef.current.text, failedRef.current.tone);
        },
      });
    } catch (err) {
      fetchFailed(err);
      return;
    }
    if (started instanceof Promise) started.then(attach, fetchFailed);
    else attach(started);
  }

  return { busy, playing, toggle };
}
