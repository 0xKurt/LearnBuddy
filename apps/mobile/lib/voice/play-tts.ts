// Play a base64-encoded MP3 (from GCP TTS) and resolve when it finishes.
//
// Why this shape: the server returns Chirp HD-synthesised audio as
// base64 in the SSE done event. To play it via expo-audio we have to
// write it to a temp file first (expo-audio's AudioSource accepts a
// uri string but not a data: URI). The file is cleaned up after
// playback completes or fails.

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

let tmpCounter = 0;

export type TtsPlayHandle = {
  /** Resolves when playback finishes (or fails). Caller awaits to
   *  know when to re-open the mic in conversation mode. */
  done: Promise<void>;
  /** Stop playback immediately (e.g. user tapped "stop"). The `done`
   *  promise resolves as a result. */
  stop: () => void;
};

export function playTtsAudio(audioBase64: string, mime: string): TtsPlayHandle {
  let resolver: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    resolver = resolve;
  });

  const ext = mime === 'audio/wav' ? '.wav' : '.mp3';
  const fileName = `tts-${Date.now()}-${++tmpCounter}${ext}`;
  // Paths.cache is writable + auto-cleaned by the OS. Perfect for ephemeral TTS clips.
  const dir = new Directory(Paths.cache);
  const file = new File(dir, fileName);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      file.delete();
    } catch {
      // ignore — temp dir gets reclaimed by the OS anyway
    }
    resolver();
  };

  // Holder so callers can `.stop()` mid-playback. Wrapped in a ref-style
  // object so we can swap the implementation once the player exists.
  const stopBox: { fn: () => void } = { fn: cleanup };

  // Write file + start playback async. If anything fails we resolve
  // `done` immediately so callers don't hang.
  (async () => {
    try {
      // Ensure audio plays even with the silent switch flipped on iOS.
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      file.create({ overwrite: true });
      file.write(audioBase64, { encoding: 'base64' });
      const player = createAudioPlayer({ uri: file.uri });
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          sub.remove();
          player.release();
          cleanup();
        }
      });
      stopBox.fn = () => {
        try {
          player.pause();
        } catch {
          /* ignore */
        }
        sub.remove();
        try {
          player.release();
        } catch {
          /* ignore */
        }
        cleanup();
      };
      player.play();
    } catch {
      cleanup();
    }
  })();

  return {
    done,
    stop: () => stopBox.fn(),
  };
}
