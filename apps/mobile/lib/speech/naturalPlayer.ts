// Plays one sentence of Buddy's natural voice (expo-audio) and reports what really happens:
// when sound starts, where it is (for read-along), and how it ended. A player that does not
// start or stops moving counts as failed, so the phone's voice can take over instead of
// leaving her in silence.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

import { playbackProgress } from './readAloud.js';

export type PlayEnd = 'done' | 'stopped' | 'error';

export type PlayHandle = { stop: () => void };

/** No sound after this long: the audio did not start (blocked, broken file). */
const START_TIMEOUT_MS = 5000;
/** The position stands still this long while playing: the player hangs. */
const STALL_MS = 4000;

let audioModeSet = false;

export function playAudio(
  uri: string,
  on: {
    onStart: () => void;
    onProgress: (progress: number | null) => void;
    onEnd: (why: PlayEnd) => void;
  },
): PlayHandle {
  if (!audioModeSet && Platform.OS !== 'web') {
    audioModeSet = true;
    // Heard with the ring/silent switch on, like the phone's own voice.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }
  let player: AudioPlayer;
  try {
    player = createAudioPlayer(uri, { updateInterval: 100 });
  } catch {
    on.onEnd('error');
    return { stop: () => undefined };
  }
  let over = false;
  let started = false;
  let lastTime = -1;
  let lastMove = Date.now();
  const opened = Date.now();

  const finish = (why: PlayEnd) => {
    if (over) return;
    over = true;
    clearInterval(timer);
    sub.remove();
    try {
      player.pause();
      player.remove();
    } catch {
      // Already released.
    }
    on.onEnd(why);
  };

  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) finish('done');
  });

  const timer = setInterval(() => {
    let t: number;
    let d: number;
    try {
      t = player.currentTime;
      d = player.duration;
    } catch {
      finish('error');
      return;
    }
    const now = Date.now();
    if (t !== lastTime) {
      lastTime = t;
      lastMove = now;
      if (!started && t > 0) {
        started = true;
        on.onStart();
      }
    }
    const progress = playbackProgress(t, d);
    if (started) on.onProgress(progress);
    if (started && d > 0 && t >= d - 0.05) {
      finish('done');
    } else if (!started && now - opened > START_TIMEOUT_MS) {
      finish('error');
    } else if (started && now - lastMove > STALL_MS) {
      // Nearly through counts as read; otherwise the phone's voice reads it again.
      finish((progress ?? 0) > 0.9 ? 'done' : 'error');
    }
  }, 100);

  try {
    player.play();
  } catch {
    finish('error');
  }

  return { stop: () => finish('stopped') };
}
