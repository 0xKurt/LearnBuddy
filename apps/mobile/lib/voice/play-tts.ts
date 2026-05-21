// Play a base64-encoded MP3 (from GCP TTS) and resolve when it finishes.
//
// Why this shape: the server returns Chirp HD-synthesised audio as
// base64 in the SSE done event. To play it via expo-audio we have to
// write it to a temp file first (expo-audio's AudioSource accepts a
// uri string but not a data: URI). The file is cleaned up after
// playback completes or fails.

import { AudioModule, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
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

export type TtsPlaybackError =
  | 'audio_mode'
  | 'file_write'
  | 'player_create'
  | 'play_failed'
  | 'no_start';

export function playTtsAudio(
  audioBase64: string,
  mime: string,
  onError?: (kind: TtsPlaybackError, detail: string) => void,
): TtsPlayHandle {
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

  (async () => {
    // setAudioModeAsync is iOS-relevant for the silent switch. On
    // Android it's effectively a no-op but has been observed to hang
    // when toggled mid-conversation (record → play transition). Fire-
    // and-forget + swallow so it can never block playback.
    void setAudioModeAsync({ playsInSilentMode: true }).catch((err: unknown) => {
      onError?.('audio_mode', err instanceof Error ? err.message : String(err));
    });

    try {
      file.create({ overwrite: true });
      file.write(audioBase64, { encoding: 'base64' });
    } catch (err) {
      onError?.('file_write', err instanceof Error ? err.message : String(err));
      cleanup();
      return;
    }

    // expo-audio JS↔native version-skew workaround:
    //   The JS `createAudioPlayer(source)` wrapper in expo-audio 55.x
    //   internally calls `new AudioModule.AudioPlayer(source, updateInterval,
    //   keepAudioSessionActive, preferredForwardBufferDuration)` — FOUR args.
    //   The Expo Go currently shipping on the user's device has an older
    //   native AudioPlayer that only accepts THREE args
    //   ("Received 4 arguments, but 3 was expected"). Bypass the JS
    //   wrapper and call the native constructor with the 3-arg shape
    //   directly. If the host eventually catches up, the extra arg
    //   default (0) is reapplied native-side; nothing breaks. If still
    //   on the 4-arg shape, `createAudioPlayer` is the canonical path
    //   — we try that first.
    type PlayerType = ReturnType<typeof createAudioPlayer>;
    let player: PlayerType;
    try {
      player = createAudioPlayer({ uri: file.uri });
    } catch (firstErr) {
      try {
        // 3-arg path: source, updateInterval, keepAudioSessionActive.
        // Cast through `unknown` because the TypeScript constructor
        // signature still expects 4 args (matches the latest .d.ts).
        const Ctor = AudioModule.AudioPlayer as unknown as new (
          source: { uri: string },
          updateInterval: number,
          keepAudioSessionActive: boolean,
        ) => PlayerType;
        player = new Ctor({ uri: file.uri }, 500, false);
      } catch (secondErr) {
        const detail = firstErr instanceof Error ? firstErr.message : String(firstErr);
        const fallback = secondErr instanceof Error ? secondErr.message : String(secondErr);
        onError?.('player_create', `${detail} | fallback: ${fallback}`);
        cleanup();
        return;
      }
    }

    // Watchdog: if the player never reports playing within 2 s, treat
    // it as a silent failure and surface it. Most legit Android playbacks
    // start within ~200 ms once the file is on disk.
    let started = false;
    const startWatchdog = setTimeout(() => {
      if (!started && !cleanedUp) {
        onError?.('no_start', 'player never reported playing within 2 s');
        try {
          player.release();
        } catch {
          /* ignore */
        }
        cleanup();
      }
    }, 2_000);

    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.playing) started = true;
      if (status.didJustFinish) {
        clearTimeout(startWatchdog);
        sub.remove();
        try {
          player.release();
        } catch {
          /* ignore */
        }
        cleanup();
      }
    });

    stopBox.fn = () => {
      clearTimeout(startWatchdog);
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

    try {
      player.play();
    } catch (err) {
      clearTimeout(startWatchdog);
      onError?.('play_failed', err instanceof Error ? err.message : String(err));
      try {
        player.release();
      } catch {
        /* ignore */
      }
      cleanup();
    }
  })();

  return {
    done,
    stop: () => stopBox.fn(),
  };
}
