// PCM16 mono at 24 kHz, independent of native/browser audio APIs. No file/decoder buffering.
import type { ListenEnd } from './pipeline.js';

export type PcmOutput = {
  now(): number;
  schedule(samples: Float32Array, at: number, ended: () => void): () => void;
};
export type PcmCallbacks = {
  start(): void;
  progress(value: number | null): void;
  end(why: ListenEnd): void;
};
const RATE = 24000;
const MAX_BYTES = 12_000_000;
const LEAD = 0.02;

export class PcmQueue {
  private pending: Float32Array[] = [];
  private stops = new Set<() => void>();
  private tail: number | null = null;
  private bytes = 0;
  private samples = 0;
  private next = 0;
  private first: number | null = null;
  private playing = false;
  private started = false;
  private eof = false;
  private over = false;

  constructor(
    private readonly output: PcmOutput,
    private readonly on: PcmCallbacks,
  ) {}

  push(bytes: Uint8Array): void {
    if (this.over || this.eof) return;
    this.bytes += bytes.length;
    if (this.bytes > MAX_BYTES) {
      this.fail();
      return;
    }
    const count = Math.floor((bytes.length + (this.tail === null ? 0 : 1)) / 2);
    const samples = new Float32Array(count);
    let from = 0,
      to = 0;
    if (this.tail !== null && bytes.length) {
      samples[to++] = this.sample(this.tail, bytes[from++]!);
      this.tail = null;
    }
    while (from + 1 < bytes.length) {
      samples[to++] = this.sample(bytes[from]!, bytes[from + 1]!);
      from += 2;
    }
    if (from < bytes.length) this.tail = bytes[from]!;
    if (!count) return;
    this.samples += count;
    if (this.playing) this.schedule(samples);
    else this.pending.push(samples);
  }

  start(): void {
    if (this.over || this.playing) return;
    this.playing = true;
    for (const samples of this.pending) this.schedule(samples);
    this.pending = [];
    this.complete();
  }

  tick(): void {
    if (this.over || this.first === null || this.output.now() < this.first) return;
    if (!this.started) {
      this.started = true;
      this.on.start();
    }
    this.on.progress(
      this.eof
        ? Math.min(1, Math.max(0, ((this.output.now() - this.first) * RATE) / this.samples))
        : null,
    );
  }

  finish(): void {
    if (this.over) return;
    this.eof = true;
    if (this.tail !== null || !this.samples) {
      this.fail();
      return;
    }
    this.complete();
  }

  stop(): void {
    this.end('stopped');
  }
  fail(): void {
    this.end('error');
  }

  private sample(low: number, high: number): number {
    const value = low | (high << 8);
    return (value >= 32768 ? value - 65536 : value) / 32768;
  }

  private schedule(samples: Float32Array): void {
    const at = Math.max(this.next, this.output.now() + LEAD);
    this.first ??= at;
    this.next = at + samples.length / RATE;
    const stop = this.output.schedule(samples, at, () => {
      this.stops.delete(stop);
      this.tick();
      this.complete();
    });
    this.stops.add(stop);
  }

  private complete(): void {
    if (this.playing && this.eof && !this.stops.size && !this.pending.length) this.end('done');
  }

  private end(why: ListenEnd): void {
    if (this.over) return;
    this.over = true;
    for (const stop of this.stops) stop();
    this.stops.clear();
    this.pending = [];
    this.on.end(why);
  }
}
