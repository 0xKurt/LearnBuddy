// requires live verification in Claude Code session
import { afterEach, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({ rate: 48000, platform: 'android', durations: [] as number[] }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return audio.platform;
    },
  },
}));
vi.mock('react-native-audio-api', () => ({
  AudioContext: class {
    sampleRate = audio.rate;
    currentTime = 0;
    destination = {};
    resume = async () => undefined;
    suspend = async () => undefined;
    createBuffer(_channels: number, length: number, sampleRate: number) {
      return { length, sampleRate, copyToChannel() {} };
    }
    createBufferSource() {
      return {
        buffer: null as { length: number; sampleRate: number } | null,
        playbackRate: { value: 1 },
        connect() {},
        disconnect() {},
        stop() {},
        onEnded: null,
        start() {
          // Native 0.12.2 advances at context rate; Web Audio compensates buffer rate itself.
          const rate = audio.platform === 'web' ? this.buffer!.sampleRate : audio.rate;
          audio.durations.push(this.buffer!.length / rate / this.playbackRate.value);
        },
      };
    }
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  audio.durations = [];
});
it.each([
  ['android', 48000],
  ['android', 44100],
  ['web', 48000],
] as const)(
  'plays one second of 24 kHz mono PCM for one second on %s at %i Hz',
  async (platform, rate) => {
    vi.useFakeTimers();
    audio.platform = platform;
    audio.rate = rate;
    const { preparePcm, playPcm, releasePcm } = await import('../pcmPlayer.js');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(24000 * 2));
        controller.close();
      },
    });
    const uri = preparePcm(stream, new AbortController().signal);
    playPcm(uri, { start() {}, progress() {}, end() {} });
    await vi.advanceTimersByTimeAsync(1);
    try {
      expect(audio.durations).toEqual([1]);
    } finally {
      releasePcm(uri);
    }
  },
);
