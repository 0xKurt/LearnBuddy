// Shared Web Audio scheduling through the already installed Android/web audio library.
import { AudioContext } from 'react-native-audio-api';
import { Platform } from 'react-native';
import { PcmQueue, type PcmCallbacks } from './pcmQueue.js';
import type { ListenEnd, PlayHandle } from './pipeline.js';

let context: AudioContext | null = null;
let sequence = 0;
const clips = new Map<
  string,
  { queue: PcmQueue; play: (on: PcmCallbacks) => PlayHandle; release: () => void }
>();
let playing = 0;
let warmTimer: ReturnType<typeof setTimeout> | undefined;

/** Called at the interaction boundary, before waiting on text/network (browser activation). */
export function warmAudio(): void {
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => undefined);
    clearTimeout(warmTimer);
    warmTimer = setTimeout(() => {
      if (!playing) void context?.suspend().catch(() => undefined);
    }, 15_000);
  } catch {
    /* Unsupported runtime uses the existing device fallback. */
  }
}

export function preparePcm(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  closeTransport: () => void = () => undefined,
): string {
  context ??= new AudioContext();
  const ctx = context;
  const uri = `buddy-pcm:${sequence++}`;
  let on: PcmCallbacks | null = null;
  let ended: ListenEnd | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let active = false;
  let lastMove = Date.now();
  let lastTime = ctx.currentTime;
  const reader = body.getReader();
  let stalled = setTimeout(() => queue.fail(), 10_000);
  const finish = (why: ListenEnd) => {
    if (ended) return;
    ended = why;
    clearInterval(timer);
    clearTimeout(stalled);
    signal.removeEventListener('abort', abort);
    closeTransport();
    if (active) {
      active = false;
      playing--;
    }
    if (!playing) void ctx.suspend().catch(() => undefined);
    on?.end(why);
  };
  const queue = new PcmQueue(
    {
      now: () => ctx.currentTime,
      schedule(samples, at, done) {
        const buffer = ctx.createBuffer(1, samples.length, 24000);
        buffer.copyToChannel(samples, 0);
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        // Native audio-api 0.12.2 consumes buffer frames at the context rate without
        // Web Audio's automatic rate conversion (AudioBufferBaseSourceNode.cpp).
        // Compensate once; browsers already account for buffer.sampleRate.
        if (Platform.OS !== 'web') node.playbackRate.value = 24000 / ctx.sampleRate;
        node.connect(ctx.destination);
        node.onEnded = () => {
          node.disconnect();
          done();
        };
        node.start(at);
        return () => {
          node.onEnded = null;
          node.stop();
          node.disconnect();
        };
      },
    },
    { start: () => on?.start(), progress: (value) => on?.progress(value), end: finish },
  );
  const abort = () => queue.stop();
  signal.addEventListener('abort', abort, { once: true });
  clips.set(uri, {
    queue,
    play(callbacks) {
      on = callbacks;
      if (ended) {
        on.end(ended);
        return { stop: abort };
      }
      if (active) return { stop: abort };
      active = true;
      playing++;
      clearTimeout(warmTimer);
      lastMove = Date.now();
      lastTime = ctx.currentTime;
      void ctx
        .resume()
        .then(() => {
          if (ended) return;
          queue.start();
          timer = setInterval(() => {
            queue.tick();
            if (ctx.currentTime !== lastTime) {
              lastTime = ctx.currentTime;
              lastMove = Date.now();
            }
            if (Date.now() - lastMove > 5000) queue.fail();
          }, 20);
        })
        .catch(() => queue.fail());
      return { stop: abort };
    },
    release: abort,
  });
  if (signal.aborted) abort();
  void (async () => {
    try {
      while (!ended) {
        const part = await reader.read();
        if (part.done) {
          queue.finish();
          break;
        }
        clearTimeout(stalled);
        stalled = setTimeout(() => queue.fail(), 10_000);
        queue.push(part.value);
      }
    } catch {
      if (!ended) queue.fail();
    } finally {
      clearTimeout(stalled);
      reader.releaseLock();
    }
  })();
  return uri;
}

export function playPcm(uri: string, on: PcmCallbacks): PlayHandle | null {
  return clips.get(uri)?.play(on) ?? null;
}
export function releasePcm(uri: string): boolean {
  if (!uri.startsWith('buddy-pcm:')) return false;
  clips.get(uri)?.release();
  clips.delete(uri);
  return true;
}
