// Sequential MP3 player for streaming tutor audio.
//
// The server streams per-sentence audio chunks via SSE during voice
// turns (see lib/agent/stream-pipeline.ts on the API side). The
// mobile receives them in playback order; we play each chunk to
// completion before starting the next so the kid hears a continuous
// utterance instead of overlapping/cross-talking voices.
//
// Built as a small queue wrapper around playTtsAudio so the existing
// single-chunk path (opener TTS, non-streaming Gemini path) stays
// untouched.

import { playTtsAudio, type TtsPlayHandle, type TtsPlaybackError } from './play-tts';

export type TtsQueueHandle = {
  /** Push the next chunk onto the queue. Plays immediately if the
   *  queue was idle, otherwise waits for the prior chunk to finish.
   *  Safe to call at any time during the session. */
  enqueue: (audio: { base64: string; mime: string }) => void;
  /** Resolves the first time the queue empties AFTER `finalise()` is
   *  called. Use it to know "tutor is done speaking" — e.g. to
   *  re-open the mic in conversation mode. */
  done: Promise<void>;
  /** Mark "no more chunks will arrive". The done promise resolves
   *  when whatever is currently queued finishes. Without this the
   *  queue stays open forever. */
  finalise: () => void;
  /** Stop everything immediately — current playback aborts, pending
   *  chunks are dropped, done resolves. */
  stop: () => void;
};

export function createTtsQueue(
  onError?: (kind: TtsPlaybackError, detail: string) => void,
): TtsQueueHandle {
  const queue: Array<{ base64: string; mime: string }> = [];
  let playing: TtsPlayHandle | null = null;
  let finalised = false;
  let stopped = false;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((res) => {
    resolveDone = res;
  });

  const maybeResolveDone = () => {
    if (finalised && !playing && queue.length === 0) resolveDone();
  };

  const playNext = () => {
    if (stopped || playing) return;
    const next = queue.shift();
    if (!next) {
      maybeResolveDone();
      return;
    }
    const handle = playTtsAudio(next.base64, next.mime, onError);
    playing = handle;
    void handle.done.then(() => {
      if (stopped) return;
      playing = null;
      playNext();
    });
  };

  return {
    enqueue: (audio) => {
      if (stopped) return;
      queue.push(audio);
      if (!playing) playNext();
    },
    done,
    finalise: () => {
      finalised = true;
      maybeResolveDone();
    },
    stop: () => {
      stopped = true;
      queue.length = 0;
      try {
        playing?.stop();
      } catch {
        /* ignore */
      }
      playing = null;
      resolveDone();
    },
  };
}
